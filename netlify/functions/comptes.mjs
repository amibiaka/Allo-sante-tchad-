/* =====================================================================
 *  POST /api/comptes — comptes de gestion (programme national, Ordres,
 *  autorites, administrateurs) crees par le super-administrateur.
 *
 *  Le navigateur ne detient jamais la cle service : il envoie le jeton
 *  de session du super-administrateur, la base confirme son role
 *  (est_super_admin), puis la fonction parle a Supabase Auth avec la
 *  cle service. Le role est attribue par attribuer_role() avec le jeton
 *  de l'appelant : journalise a son nom, refus si l'appelant n'y a pas
 *  droit. Chaque envoi est inscrit au journal.
 *
 *  Corps JSON : { action, ... }
 *   - lister                       → comptes de gestion (profils + etat Auth)
 *   - inviter  { email, nom, role, province_id, ville_id, mode }
 *        mode : 'invitation' (Supabase envoie l'e-mail), 'lien' (lien a
 *        transmettre soi-meme), 'mot_de_passe' (mot de passe provisoire,
 *        affiche une fois)
 *   - reinitialiser { profil_id, mode }   memes modes, pour un compte existant
 *  Variables : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *  URL (fournie par Netlify : adresse publique du site).
 * ===================================================================== */
import { randomBytes } from 'node:crypto'
import { config as configuration, reponseJson, rest } from './lib/commun.mjs'

const ROLES = ['admin_ville', 'admin_province', 'super_admin', 'autorite_nationale', 'autorite_provinciale', 'ordre_medecins', 'ordre_pharmaciens', 'centre_numerique', 'pro']
const site = () => (process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://afiyatchad.com').replace(/\/+$/, '')

const entetesService = (cfg) => ({ apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, 'Content-Type': 'application/json' })

async function auth(cfg, chemin, { methode = 'GET', corps } = {}) {
  const r = await fetch(`${cfg.url}/auth/v1${chemin}`, { method: methode, headers: entetesService(cfg), body: corps === undefined ? undefined : JSON.stringify(corps) })
  const texte = await r.text()
  let d = null
  try { d = texte ? JSON.parse(texte) : null } catch { d = { brut: texte } }
  if (!r.ok) { const e = new Error(d?.msg || d?.message || d?.error_description || d?.error || `auth ${r.status}`); e.statut = r.status; e.code = d?.error_code || d?.code; throw e }
  return d
}

/* Mot de passe provisoire lisible, sans caracteres ambigus. */
function motDePasse() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const b = randomBytes(12)
  const s = [...b].map((x) => alphabet[x % alphabet.length]).join('')
  return `Afiya-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

async function utilisateurParEmail(cfg, email) {
  for (let page = 1; page <= 20; page++) {
    const d = await auth(cfg, `/admin/users?page=${page}&per_page=200`)
    const u = (d.users || []).find((x) => (x.email || '').toLowerCase() === email)
    if (u) return u
    if (!d.users || d.users.length < 200) return null
  }
  return null
}

async function appelant(cfg, jeton) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/est_super_admin`, { method: 'POST', headers: { apikey: cfg.anon, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: '{}' })
  if (!r.ok || (await r.json().catch(() => false)) !== true) return null
  const u = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${jeton}` } })
  if (!u.ok) return null
  const d = await u.json()
  return { id: d.id, email: d.email, jeton }
}

async function journal(cfg, adm, action, cible, detail) {
  await rest(cfg, '/journal_admin', { jeton: adm.jeton, methode: 'POST', entetes: { Prefer: 'return=minimal' },
    corps: { admin_id: adm.id, action, cible_type: 'profil', cible_id: String(cible), detail } }).catch(() => {})
}

const lienDe = (d) => d?.action_link || d?.properties?.action_link || null

/* Compte existant : on s'assure qu'il est confirme, puis on livre selon le
   mode. Renvoie ce qu'il faut montrer au super-administrateur. */
async function livrerExistant(cfg, { user, email, nom, mode }) {
  const redirection = site() + '/'
  if (mode === 'mot_de_passe') {
    const mdp = motDePasse()
    await auth(cfg, `/admin/users/${user.id}`, { methode: 'PUT', corps: { password: mdp, email_confirm: true } })
    return { mode, mot_de_passe: mdp }
  }
  if (!(user.email_confirmed_at || user.confirmed_at)) await auth(cfg, `/admin/users/${user.id}`, { methode: 'PUT', corps: { email_confirm: true } })
  if (mode === 'lien') {
    const d = await auth(cfg, '/admin/generate_link', { methode: 'POST', corps: { type: 'recovery', email, redirect_to: redirection, data: { nom } } })
    return { mode, lien: lienDe(d), type: 'recovery' }
  }
  // invitation : Supabase envoie l'e-mail de (re)definition du mot de passe
  try {
    const r = await fetch(`${cfg.url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirection)}`, { method: 'POST', headers: { apikey: cfg.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    if (!r.ok) throw new Error((await r.text().catch(() => '')).slice(0, 200) || `recover ${r.status}`)
    return { mode, envoye: true, type: 'recovery' }
  } catch (e) {
    const d = await auth(cfg, '/admin/generate_link', { methode: 'POST', corps: { type: 'recovery', email, redirect_to: redirection, data: { nom } } })
    return { mode: 'lien', lien: lienDe(d), type: 'recovery', envoi_echoue: String(e.message || e).slice(0, 160) }
  }
}

/* Nouveau compte : cree selon le mode (l'invitation et le lien creent
   l'utilisateur eux-memes). */
async function creerNouveau(cfg, { email, nom, mode }) {
  const redirection = site() + '/'
  if (mode === 'mot_de_passe') {
    const mdp = motDePasse()
    const user = await auth(cfg, '/admin/users', { methode: 'POST', corps: { email, password: mdp, email_confirm: true, user_metadata: { nom } } })
    return { user, livraison: { mode, mot_de_passe: mdp } }
  }
  if (mode === 'lien') {
    const d = await auth(cfg, '/admin/generate_link', { methode: 'POST', corps: { type: 'invite', email, redirect_to: redirection, data: { nom } } })
    return { user: { id: d.id || d.user?.id, email }, livraison: { mode, lien: lienDe(d), type: 'invite' } }
  }
  try {
    const user = await auth(cfg, `/invite?redirect_to=${encodeURIComponent(redirection)}`, { methode: 'POST', corps: { email, data: { nom } } })
    return { user, livraison: { mode, envoye: true, type: 'invite' } }
  } catch (e) {
    // L'e-mail n'est pas parti (SMTP absent, limite atteinte) : on cree
    // le compte et on rend un lien a transmettre soi-meme.
    const d = await auth(cfg, '/admin/generate_link', { methode: 'POST', corps: { type: 'invite', email, redirect_to: redirection, data: { nom } } })
    return { user: { id: d.id || d.user?.id, email }, livraison: { mode: 'lien', lien: lienDe(d), type: 'invite', envoi_echoue: String(e.message || e).slice(0, 160) } }
  }
}

export default async (req) => {
  if (req.method !== 'POST') return reponseJson({ erreur: 'POST attendu' }, 405)
  const cfg = configuration()
  if (!cfg.url || !cfg.anon || !cfg.service) return reponseJson({ erreur: 'configuration Supabase absente (SUPABASE_SERVICE_ROLE_KEY)' }, 503)
  const jeton = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || jeton === cfg.anon) return reponseJson({ erreur: 'SESSION_REQUISE' }, 401)
  const adm = await appelant(cfg, jeton)
  if (!adm) return reponseJson({ erreur: 'HORS_PERIMETRE' }, 403)
  let corps
  try { corps = await req.json() } catch { return reponseJson({ erreur: 'corps invalide' }, 400) }
  const action = String(corps.action || '')

  try {
    if (action === 'lister') {
      const profils = await rest(cfg, '/profils?role=neq.pro&select=id,role,nom,telephone,email,province_id,ville_id,actif,created_at&order=created_at.desc&limit=500')
      const etats = new Map()
      for (let page = 1; page <= 20; page++) {
        const d = await auth(cfg, `/admin/users?page=${page}&per_page=200`)
        for (const u of d.users || []) etats.set(u.id, { email: u.email, derniere_connexion: u.last_sign_in_at, confirme: !!(u.email_confirmed_at || u.confirmed_at), invite_le: u.invited_at })
        if (!d.users || d.users.length < 200) break
      }
      return reponseJson({ comptes: profils.map((p) => ({ ...p, ...(etats.get(p.id) || {}), email: p.email || etats.get(p.id)?.email || null })) })
    }

    if (action === 'inviter') {
      const email = String(corps.email || '').trim().toLowerCase()
      const nom = String(corps.nom || '').trim().slice(0, 120)
      const role = String(corps.role || '')
      const mode = ['invitation', 'lien', 'mot_de_passe'].includes(corps.mode) ? corps.mode : 'invitation'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reponseJson({ erreur: 'adresse invalide' }, 400)
      if (!ROLES.includes(role)) return reponseJson({ erreur: 'role inconnu' }, 400)
      let user = await utilisateurParEmail(cfg, email)
      const nouveau = !user
      let livraison
      if (nouveau) ({ user, livraison } = await creerNouveau(cfg, { email, nom, mode }))
      else livraison = await livrerExistant(cfg, { user, email, nom, mode })
      if (!user?.id) throw new Error('creation du compte impossible')
      // Profil : nom, adresse (cle service : le trigger a deja cree la ligne).
      const patch = { email }
      if (nom) patch.nom = nom
      await rest(cfg, `/profils?id=eq.${user.id}`, { methode: 'PATCH', entetes: { Prefer: 'return=minimal' }, corps: patch })
      // Role, avec le jeton de l'appelant : journalise a son nom, verifie par la base.
      if (user.id !== adm.id) {
        await rest(cfg, '/rpc/attribuer_role', { jeton: adm.jeton, methode: 'POST',
          corps: { p_profil: user.id, p_role: role, p_province: corps.province_id ?? null, p_ville: corps.ville_id ?? null } })
      }
      await journal(cfg, adm, 'compte:' + (nouveau ? 'creation' : 'acces') + ':' + livraison.mode, user.id, { email, role, nouveau })
      return reponseJson({ ok: true, profil_id: user.id, nouveau, email, ...livraison })
    }

    if (action === 'reinitialiser') {
      const id = String(corps.profil_id || '')
      const mode = ['invitation', 'lien', 'mot_de_passe'].includes(corps.mode) ? corps.mode : 'lien'
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reponseJson({ erreur: 'identifiant invalide' }, 400)
      const user = await auth(cfg, `/admin/users/${id}`)
      if (!user?.email) return reponseJson({ erreur: 'compte sans adresse' }, 404)
      const livraison = await livrerExistant(cfg, { user, email: user.email, nom: user.user_metadata?.nom || '', mode })
      await journal(cfg, adm, 'compte:reinitialisation:' + livraison.mode, user.id, { email: user.email })
      return reponseJson({ ok: true, profil_id: user.id, email: user.email, ...livraison })
    }

    return reponseJson({ erreur: 'action inconnue' }, 400)
  } catch (e) {
    return reponseJson({ erreur: String(e.message || e).slice(0, 240) }, e.statut === 422 ? 422 : 502)
  }
}

export const config = { path: '/api/comptes', method: 'POST' }
