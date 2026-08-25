/* =====================================================================
 * BACKEND SUPABASE — appels HTTP directs, sans SDK.
 *
 * Pourquoi pas @supabase/supabase-js ? Parce qu'il pese ~40 Ko une fois
 * compresse. Sur un forfait 2G tchadien, c'est plusieurs secondes et
 * quelques francs a chaque premiere visite. Les API REST (PostgREST),
 * Auth et Storage de Supabase sont de simples appels HTTP : les faire
 * a la main coute ~8 Ko et donne le controle total des charges utiles.
 *
 * Le temps reel utilise une interrogation adaptative plutot que des
 * websockets : sur les reseaux mobiles instables (proxys d'operateurs,
 * coupures frequentes), une requete courte toutes les N secondes est
 * plus fiable qu'une socket qui tombe en silence. La cadence ralentit
 * automatiquement quand l'ecran n'est pas visible.
 * ===================================================================== */
import { CONFIG } from './config'

const URL_BASE = CONFIG.supabaseUrl.replace(/\/+$/, '')
const APIKEY = CONFIG.supabaseKey
const REST = `${URL_BASE}/rest/v1`
const AUTH = `${URL_BASE}/auth/v1`
const STORAGE = `${URL_BASE}/storage/v1`
const BUCKET = 'medias'
const CLE_JETON = 'ast.session.v1'
const CLE_REF = 'ast.ref.v1'

let REF = null
let jeton = null            // { access_token, refresh_token, expires_at }
let cacheSession = null
const auditeurs = new Set()

/* --- Jeton de session ------------------------------------------------ */
function lireJeton() {
  if (jeton !== null) return jeton
  try { jeton = JSON.parse(localStorage.getItem(CLE_JETON) || 'null') } catch { jeton = null }
  return jeton
}
function ecrireJeton(j) {
  jeton = j
  cacheSession = null
  try {
    if (j) localStorage.setItem(CLE_JETON, JSON.stringify(j))
    else localStorage.removeItem(CLE_JETON)
  } catch { /* stockage plein ou refuse */ }
  auditeurs.forEach((f) => { try { f() } catch { /* ignore */ } })
}

async function rafraichirJeton() {
  const j = lireJeton()
  if (!j?.refresh_token) return null
  const r = await fetch(`${AUTH}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: APIKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: j.refresh_token }),
  })
  if (!r.ok) { ecrireJeton(null); return null }
  const d = await r.json()
  const neuf = {
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  }
  ecrireJeton(neuf)
  return neuf
}

async function jetonValide() {
  let j = lireJeton()
  if (!j) return null
  if (j.expires_at && j.expires_at - Date.now() < 60000) j = await rafraichirJeton()
  return j
}

/* --- Requete generique ----------------------------------------------- */
async function requete(chemin, { methode = 'GET', corps, entetes = {}, brut, base = REST } = {}) {
  const j = await jetonValide()
  const h = {
    apikey: APIKEY,
    Authorization: `Bearer ${j?.access_token || APIKEY}`,
    ...entetes,
  }
  if (corps !== undefined && !brut) h['Content-Type'] = 'application/json'

  const r = await fetch(base + chemin, {
    method: methode,
    headers: h,
    body: corps === undefined ? undefined : (brut ? corps : JSON.stringify(corps)),
  })

  if (r.status === 401 && j) {
    const neuf = await rafraichirJeton()
    if (neuf) return requete(chemin, { methode, corps, entetes, brut, base })
  }
  if (!r.ok) {
    let detail = ''
    try { const e = await r.json(); detail = e.message || e.error_description || e.error || e.msg || '' }
    catch { detail = await r.text().catch(() => '') }
    throw new Error(detail || `HTTP ${r.status}`)
  }
  if (r.status === 204) return null
  const texte = await r.text()
  return texte ? JSON.parse(texte) : null
}

const rpc = (fn, args = {}) => requete(`/rpc/${fn}`, { methode: 'POST', corps: args })

/* Construit une chaine de requete PostgREST lisible. */
function q(params) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.append(k, v)
  return p.toString() ? '?' + p.toString() : ''
}
const echappe = (v) => String(v).replace(/[(),"]/g, ' ').trim()

/* --- Referentiel geographique ---------------------------------------- */
export async function init() {
  if (REF) return { mode: 'supabase' }
  try {
    const c = JSON.parse(localStorage.getItem(CLE_REF) || 'null')
    if (c && Date.now() - c.le < 7 * 864e5) REF = c.ref
  } catch { /* cache illisible */ }

  try {
    const [provinces, villes, quartiers] = await Promise.all([
      requete('/provinces' + q({ select: 'id,code,nom_fr,nom_ar', order: 'ordre' })),
      requete('/villes' + q({ select: 'id,province_id,code,nom_fr,nom_ar,lat,lng,chef_lieu', order: 'nom_fr' })),
      requete('/quartiers' + q({ select: 'id,ville_id,nom_fr,nom_ar,groupe,qualite', approuve: 'eq.true', order: 'nom_fr' })),
    ])
    REF = { provinces, villes, quartiers }
    try { localStorage.setItem(CLE_REF, JSON.stringify({ le: Date.now(), ref: REF })) } catch { /* quota */ }
  } catch {
    REF = REF || { provinces: [], villes: [], quartiers: [] }
  }
  const degrade = !REF.villes.length
  return { mode: 'supabase', degrade }
}

export function referentiel() { return REF || { provinces: [], villes: [], quartiers: [] } }
const villeParCode = (code) => referentiel().villes.find((v) => v.code === code) || null
const quartierId = (villeId, nom) =>
  referentiel().quartiers.find((x) => x.ville_id === villeId && x.nom_fr === nom)?.id ?? null

/* Resout une ville, en rechargeant le referentiel si necessaire.
   Leve une erreur plutot que de laisser passer une demande orpheline. */
async function exigerVille(code) {
  if (!code) return null
  let v = villeParCode(code)
  if (!v) { await rafraichirRef(); v = villeParCode(code) }
  if (!v) throw new Error('REFERENTIEL_INDISPONIBLE')
  return v
}

async function rafraichirRef() {
  try { localStorage.removeItem(CLE_REF) } catch { /* ignore */ }
  REF = null
  await init()
}

/* --- Selections imbriquees ------------------------------------------- */
/* Deux selections distinctes : la note interne de moderation et la date
   de fin de probation ne doivent pas partir dans l'annuaire public. */
const SEL_PRO = [
  'id,type,nom,specialite,province_id,ville_id,quartier_id,adresse_texte',
  'telephone,whatsapp,telegram,horaires,lat,lng,statut,probation_fin',
  'en_ligne,derniere_activite,service_officiel,numero_confirme,demo,created_at',
  'villes(nom_fr,code),quartiers(nom_fr),provinces(nom_fr)',
].join(',')

const SEL_PRO_PUBLIC = [
  'id,type,nom,specialite,province_id,ville_id,quartier_id,adresse_texte',
  'telephone,whatsapp,telegram,horaires,lat,lng,statut,probation_fin',
  'en_ligne,service_officiel,numero_confirme,demo',
  'villes(nom_fr,code),quartiers(nom_fr),provinces(nom_fr)',
].join(',')

const SEL_PRO_ADMIN = SEL_PRO + ',note_admin,profil_id,verifie_le'

/* Colonnes explicites, JAMAIS "*" : contact_tel et contact_whatsapp
   sont volontairement absents. Le numero du patient s'obtient par la
   fonction contact_demande(), qui verifie que le soignant s'est
   effectivement engage. */
const SEL_DEM = [
  'id,code,pour_qui,niveau,categories,description,vocal_url,age_approx,sexe',
  'province_id,ville_id,quartier_id,quartier_libre,ville_libre,lieu_texte,lat,lng',
  'statut,escalade_le,resolu_le,demo,created_at,updated_at,a_contact',
  'villes(nom_fr)', 'quartiers(nom_fr)',
  'reponses(pro_id,action,message,created_at,professionnels(nom,type,statut,telephone,whatsapp,demo))',
].join(',')

const SEL_ORD = [
  'id,code,image_url,vocal_url,note,province_id,ville_id,quartier_id,quartier_libre,ville_libre',
  'pharmacie_id,diffusion,livraison_souhaitee,statut,masquee,demo,created_at,a_contact',
].join(',')

function habiller(p) {
  if (!p) return p
  return {
    ...p,
    ville_nom: p.villes?.nom_fr ?? null,
    ville_code: p.villes?.code ?? null,
    quartier_nom: p.quartiers?.nom_fr ?? null,
    province_nom: p.provinces?.nom_fr ?? null,
  }
}

function habillerDemande(d) {
  return {
    ...d,
    ville_nom: d.villes?.nom_fr ?? null,
    quartier_nom: d.quartiers?.nom_fr ?? d.quartier_libre,
    reponses: (d.reponses || []).map((r) => {
      const engage = ['en_route', 'appelle', 'whatsapp'].includes(r.action)
      return {
        action: r.action, message: r.message, created_at: r.created_at,
        pro_id: r.pro_id ?? null,
        pro_nom: r.professionnels?.nom ?? null, pro_type: r.professionnels?.type ?? null,
        pro_statut: r.professionnels?.statut ?? null, pro_demo: !!r.professionnels?.demo,
        pro_tel: engage ? r.professionnels?.telephone ?? null : null,
        pro_whatsapp: engage ? r.professionnels?.whatsapp ?? null : null,
      }
    }),
  }
}

/* ===================== ANNUAIRE ====================================== */
export async function annuaire({ villeCode, type, recherche, secours } = {}) {
  const p = {
    select: SEL_PRO_PUBLIC, statut: 'in.(provisoire,verifie)',
    // Meme tri qu'en mode demo : disponibles d'abord, puis ceux qui ont
    // un numero, puis l'ordre alphabetique.
    order: 'en_ligne.desc,telephone.asc.nullslast,nom.asc', limit: '300',
  }
  const v = villeCode ? villeParCode(villeCode) : null
  if (v) p.ville_id = 'eq.' + v.id
  if (type) p.type = 'eq.' + type
  if (secours === true) p.service_officiel = 'is.true'
  if (secours === false) p.service_officiel = 'is.false'
  if (recherche) p.or = `(nom.ilike.*${echappe(recherche)}*,specialite.ilike.*${echappe(recherche)}*)`
  return (await requete('/professionnels' + q(p)) || []).map(habiller)
}

export async function detailPro(id) {
  const l = await requete('/professionnels' + q({ select: SEL_PRO_PUBLIC, id: 'eq.' + id, limit: '1' }))
  return habiller(l?.[0] || null)
}

/* ===================== FICHIERS ====================================== */
export async function televerser(blob, prefixe = 'media') {
  const ext = blob.type.includes('jpeg') ? 'jpg'
    : blob.type.includes('png') ? 'png'
    : blob.type.includes('mp4') ? 'm4a'
    : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const chemin = `${prefixe}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  // Le stockage compare le type declare a une liste de types nus :
  // "audio/webm;codecs=opus" (ce que produit Chrome) serait refuse.
  const typeBase = (blob.type || 'application/octet-stream').split(';')[0].trim()
  await requete(`/object/${BUCKET}/${chemin}`, {
    base: STORAGE, methode: 'POST', corps: blob, brut: true,
    entetes: { 'Content-Type': typeBase, 'cache-control': 'max-age=3600', 'x-upsert': 'false' },
  })
  return { chemin, url: null }
}

export async function urlSignee(chemin) {
  if (!chemin) return null
  try {
    const d = await requete(`/object/sign/${BUCKET}/${chemin}`, {
      base: STORAGE, methode: 'POST', corps: { expiresIn: 3600 },
    })
    return d?.signedURL ? STORAGE + d.signedURL.replace(/^\/?/, '/') : null
  } catch { return null }
}

/* ===================== DEMANDES ====================================== */
export async function creerDemande(p) {
  // Si le referentiel n'a pas pu etre charge, une demande partirait avec
  // ville_id = null : elle serait acceptee, le patient verrait son code
  // de suivi... et AUCUN soignant ne la verrait jamais. On refuse plutot
  // que de laisser croire a un envoi reussi.
  const v = await exigerVille(p.villeCode)
  const qid = v && p.quartierNom ? quartierId(v.id, p.quartierNom) : null
  const l = await requete('/demandes' + q({ select: 'code,id' }), {
    methode: 'POST',
    entetes: { Prefer: 'return=representation' },
    corps: {
      pour_qui: p.pourQui, niveau: p.niveau, categories: p.categories || [],
      description: p.description || null, vocal_url: p.vocalChemin || null,
      age_approx: p.age || null, sexe: p.sexe || null,
      province_id: v?.province_id ?? null, ville_id: v?.id ?? null,
      quartier_id: qid, quartier_libre: qid ? null : (p.quartierNom || null),
      ville_libre: p.villeLibre || null,
      lieu_texte: p.lieuTexte || null, lat: p.lat ?? null, lng: p.lng ?? null,
      contact_tel: p.contactTel || null, contact_whatsapp: p.contactWhatsapp || null,
      contact_visible: !!p.contactVisible, consentement: true,
    },
  })
  return l?.[0]
}

export const suivreDemande = (code) => rpc('suivre_demande', { p_code: code })
export const annulerDemande = async (code) => !!(await rpc('annuler_demande', { p_code: code }))

/* ===================== ORDONNANCES =================================== */
export async function creerOrdonnance(p) {
  const v = await exigerVille(p.villeCode)
  const qid = v && p.quartierNom ? quartierId(v.id, p.quartierNom) : null
  const l = await requete('/ordonnances' + q({ select: 'code,id' }), {
    methode: 'POST',
    entetes: { Prefer: 'return=representation' },
    corps: {
      image_url: p.imageChemin || null, vocal_url: p.vocalChemin || null,
      note: p.note || null, province_id: v?.province_id ?? null, ville_id: v?.id ?? null,
      quartier_id: qid, quartier_libre: qid ? null : (p.quartierNom || null),
      ville_libre: p.villeLibre || null,
      pharmacie_id: p.pharmacieId || null, diffusion: !p.pharmacieId,
      contact_tel: p.contactTel || null, livraison_souhaitee: !!p.livraison,
      consentement: true,
    },
  })
  return l?.[0]
}

export const suivreOrdonnance = (code) => rpc('suivre_ordonnance', { p_code: code })

/* ===================== DIVERS PUBLIC ================================= */
export async function numerosUrgence({ villeCode } = {}) {
  const v = villeCode ? villeParCode(villeCode) : null
  const p = { select: '*', actif: 'is.true', order: 'verifie.desc,ordre.asc' }
  // Sans zone choisie on montre tout : un numero d'hopital verifie vaut
  // mieux qu'un ecran vide au moment ou quelqu'un panique.
  if (v) p.or = `(national.is.true,ville_id.is.null,ville_id.eq.${v.id})`
  return await requete('/numeros_urgence' + q(p)) || []
}

export const statsPubliques = (jours = 30) => rpc('stats_publiques', { p_jours: jours })

export async function suggererQuartier({ villeCode, nom }) {
  const v = villeParCode(villeCode)
  if (!v || !nom) return false
  try {
    await requete('/quartiers', {
      methode: 'POST',
      corps: { ville_id: v.id, nom_fr: nom, approuve: false, qualite: 'suggere' },
    })
    return true
  } catch { return false }
}

export async function signaler({ cibleType, cibleId, motif, detail }) {
  try {
    await requete('/signalements', {
      methode: 'POST',
      corps: { cible_type: cibleType, cible_id: cibleId, motif, detail: detail || null },
    })
    return true
  } catch { return false }
}

/* ===================== AUTHENTIFICATION ============================== */
const emailDepuisTel = (tel) => `${String(tel).replace(/\D/g, '')}@${CONFIG.domaineTel}`

/* Inscription sans mot de passe (VITE_INSCRIPTION_LIBRE).
   Le compte a tout de meme une vraie cle : elle est tiree au hasard,
   gardee sur le telephone, et montree une fois au soignant comme
   « code de recuperation ». Ce n'est pas equivalent a un mot de passe
   choisi — c'est un compromis assume pour une phase pilote, ou exiger
   un mot de passe ferait perdre la moitie des inscrits. */
const CLE_LOCALE = 'ast.cle.'

function cleLocale(tel) {
  try { return localStorage.getItem(CLE_LOCALE + String(tel).replace(/\D/g, '')) } catch { return null }
}
function poserCleLocale(tel, cle) {
  try { localStorage.setItem(CLE_LOCALE + String(tel).replace(/\D/g, ''), cle) } catch { /* quota */ }
}
function nouvelleCle() {
  const octets = new Uint8Array(12)
  crypto.getRandomValues(octets)
  return [...octets].map((o) => o.toString(36).padStart(2, '0')).join('').slice(0, 16)
}

async function authentifier(chemin, corps) {
  const r = await fetch(AUTH + chemin, {
    method: 'POST',
    headers: { apikey: APIKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || `HTTP ${r.status}`)
  return d
}

export async function inscrire(p) {
  const email = emailDepuisTel(p.telephone)
  const libre = CONFIG.inscriptionLibre && !p.motDePasse
  const cle = libre ? nouvelleCle() : p.motDePasse
  if (libre) { p = { ...p, motDePasse: cle } }
  let d
  try {
    d = await authentifier('/signup', {
      email, password: p.motDePasse,
      data: { nom: p.nom, telephone: p.telephone },
    })
  } catch (e) {
    throw new Error(/already|exists|registered/i.test(e.message) ? 'COMPTE_EXISTANT' : e.message)
  }

  if (d.access_token) {
    ecrireJeton({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 })
  } else {
    // La confirmation par e-mail est activee : l'inscription par numero
    // ne peut pas fonctionner tant qu'elle n'est pas desactivee.
    try { await connecter({ telephone: p.telephone, motDePasse: p.motDePasse }) }
    catch { throw new Error('CONFIRMATION_EMAIL_ACTIVE') }
  }

  const uid = d.user?.id || d.id || (await utilisateurCourant())?.id
  const v = p.villeCode ? villeParCode(p.villeCode) : null
  const tel = String(p.telephone).replace(/\D/g, '')

  // Seuls le nom et le telephone sont modifiables par l'interesse ;
  // province_id / ville_id sont un perimetre d'administration, pose
  // uniquement par un super-administrateur. La zone d'exercice du
  // soignant vit dans sa fiche professionnelle.
  await requete('/profils' + q({ id: 'eq.' + uid }), {
    methode: 'PATCH', corps: { nom: p.nom, telephone: p.telephone },
  }).catch(() => {})

  const l = await requete('/professionnels' + q({ select: SEL_PRO_ADMIN }), {
    methode: 'POST',
    entetes: { Prefer: 'return=representation' },
    corps: {
      profil_id: uid, type: p.type, nom: p.nom, specialite: p.specialite || null,
      province_id: v?.province_id ?? null, ville_id: v?.id ?? null,
      quartier_id: v && p.quartierNom ? quartierId(v.id, p.quartierNom) : null,
      adresse_texte: p.adresse || null,
      telephone: '+235' + tel, whatsapp: p.whatsapp || '+235' + tel,
      horaires: p.horaires || null, en_ligne: true,
      derniere_activite: new Date().toISOString(),
      lat: v?.lat ?? null, lng: v?.lng ?? null,
    },
  })
  if (libre) poserCleLocale(p.telephone, cle)
  return {
    profil: { id: uid, nom: p.nom, role: 'pro' },
    pro: habiller(l?.[0]),
    codeRecuperation: libre ? cle : null,
  }
}

export async function connecter({ telephone, motDePasse }) {
  // En acces libre, la cle du telephone remplace le mot de passe saisi.
  const cle = motDePasse || (CONFIG.inscriptionLibre ? cleLocale(telephone) : null)
  if (!cle) throw new Error(CONFIG.inscriptionLibre ? 'CLE_ABSENTE' : 'IDENTIFIANTS')
  let d
  try {
    d = await authentifier('/token?grant_type=password', {
      email: emailDepuisTel(telephone), password: cle,
    })
  } catch { throw new Error('IDENTIFIANTS') }
  if (CONFIG.inscriptionLibre && motDePasse) poserCleLocale(telephone, motDePasse)
  ecrireJeton({
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.expires_in || 3600) * 1000,
  })
  return sessionCourante()
}

export async function deconnecter() {
  try { await requete('/logout', { base: AUTH, methode: 'POST', corps: {} }) } catch { /* peu importe */ }
  ecrireJeton(null)
}

async function utilisateurCourant() {
  const j = await jetonValide()
  if (!j) return null
  try { return await requete('/user', { base: AUTH }) } catch { return null }
}

/* La session est demandee dans des chemins chauds (repondre, passer en
   ligne, journaliser, filtrer le perimetre). Sans cache, chaque geste
   coutait trois allers-retours. Le cache est invalide des que le jeton
   change. */
export async function sessionCourante() {
  if (cacheSession && Date.now() - cacheSession.le < 60000) return cacheSession.valeur
  const v = await lireSession()
  cacheSession = { le: Date.now(), valeur: v }
  return v
}

async function lireSession() {
  const u = await utilisateurCourant()
  if (!u?.id) return null
  const [profils, pros] = await Promise.all([
    requete('/profils' + q({ select: '*,villes(nom_fr),provinces(nom_fr)', id: 'eq.' + u.id, limit: '1' })).catch(() => []),
    requete('/professionnels' + q({ select: SEL_PRO_ADMIN, profil_id: 'eq.' + u.id, limit: '1' })).catch(() => []),
  ])
  const profil = profils?.[0]
  if (!profil || profil.actif === false) return null
  return {
    profil: { ...profil, ville_nom: profil.villes?.nom_fr, province_nom: profil.provinces?.nom_fr },
    pro: habiller(pros?.[0] || null),
  }
}

export function surSession(cb) { auditeurs.add(cb); return () => auditeurs.delete(cb) }

/* ===================== ESPACE PROFESSIONNEL ========================== */
export async function majPro(id, patch) {
  const p = { ...patch }
  if ('villeCode' in p && p.villeCode) {
    const v = villeParCode(p.villeCode)
    p.ville_id = v?.id ?? null
    p.province_id = v?.province_id ?? null
    delete p.villeCode
  }
  if (p.quartierNom !== undefined) {
    p.quartier_id = p.ville_id ? quartierId(p.ville_id, p.quartierNom) : null
    delete p.quartierNom
  }
  const l = await requete('/professionnels' + q({ select: SEL_PRO_ADMIN, id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps: p,
  })
  if (!l?.length) throw new Error('HORS_PERIMETRE')
  cacheSession = null
  return habiller(l[0])
}

export async function definirEnLigne(enLigne) {
  const s = await sessionCourante()
  if (!s?.pro) return null
  return majPro(s.pro.id, { en_ligne: enLigne, derniere_activite: new Date().toISOString() })
}

export async function demandesZone({ inclureCloturees = false } = {}) {
  const p = { select: SEL_DEM, order: 'niveau.asc,created_at.desc', limit: '200' }
  if (!inclureCloturees) p.statut = 'in.(nouveau,vu,pris_en_charge)'
  return (await requete('/demandes' + q(p)) || []).map(habillerDemande)
}

/* Le numero du patient n'est rendu qu'apres un engagement reel
   (en route / j'appelle / WhatsApp), ou a un administrateur de la zone.
   La verification est faite dans la base, pas dans l'interface. */
export const contactDemande = (demandeId) => rpc('contact_demande', { p_demande: demandeId })
export const contactOrdonnance = (ordonnanceId) => rpc('contact_ordonnance', { p_ordonnance: ordonnanceId })

export async function repondre({ demandeId, action, message }) {
  const s = await sessionCourante()
  const l = await requete('/reponses' + q({ select: '*' }), {
    methode: 'POST', entetes: { Prefer: 'return=representation' },
    corps: { demande_id: demandeId, pro_id: s?.pro?.id ?? null, action, message: message || null },
  })
  return l?.[0]
}

export async function ordonnancesZone() {
  const s = await sessionCourante()
  const l = await requete('/ordonnances' + q({
    select: SEL_ORD + ',villes(nom_fr),quartiers(nom_fr),reponses_ordonnance(id,pharmacie_id,disponibilite,created_at)',
    masquee: 'is.false', order: 'created_at.desc', limit: '100',
  })) || []
  return l.map((o) => ({
    ...o,
    ville_nom: o.villes?.nom_fr ?? null,
    quartier_nom: o.quartiers?.nom_fr ?? o.quartier_libre,
    mes_reponses: (o.reponses_ordonnance || []).filter((r) => r.pharmacie_id === s?.pro?.id),
    total_reponses: (o.reponses_ordonnance || []).length,
  }))
}

export async function repondreOrdonnance({ ordonnanceId, disponibilite, prix, livraison, message }) {
  const s = await sessionCourante()
  const l = await requete('/reponses_ordonnance' + q({ select: '*' }), {
    methode: 'POST', entetes: { Prefer: 'return=representation' },
    corps: {
      ordonnance_id: ordonnanceId, pharmacie_id: s?.pro?.id ?? null,
      disponibilite, prix_indicatif: prix || null, livraison: !!livraison, message: message || null,
    },
  })
  return l?.[0]
}

/* ===================== BACK-OFFICE =================================== */
/* Une seule requete, perimetre applique dans la base. */
export async function adminStats() {
  const d = await rpc('admin_stats')
  return d || {
    demandes_ouvertes: 0, urgences_non_prises: 0, escalades: 0, demandes_24h: 0,
    pros_en_ligne: 0, pros_a_verifier: 0, pros_expires: 0, signalements_ouverts: 0,
    numeros_a_confirmer: 0, services_sans_numero: 0, numeros_valides_localement: false,
  }
}

/* Le perimetre de l'administrateur connecte, pour filtrer les listes
   cote requete : le RLS protege l'ecriture, mais tous les soignants sont
   lisibles publiquement, donc la lecture doit etre bornee ici. */
async function perimetreAdmin() {
  const s = await sessionCourante()
  const r = s?.profil?.role
  if (r === 'admin_ville') return { ville_id: 'eq.' + s.profil.ville_id }
  if (r === 'admin_province') return { province_id: 'eq.' + s.profil.province_id }
  return {}
}

export async function adminPros({ statut, type, villeCode, recherche } = {}) {
  const p = { select: SEL_PRO_ADMIN, order: 'created_at.desc', limit: '300', ...(await perimetreAdmin()) }
  if (statut) p.statut = 'eq.' + statut
  if (type) p.type = 'eq.' + type
  const v = villeCode ? villeParCode(villeCode) : null
  if (v) p.ville_id = 'eq.' + v.id
  if (recherche) p.or = `(nom.ilike.*${echappe(recherche)}*,telephone.ilike.*${echappe(recherche)}*)`
  return (await requete('/professionnels' + q(p)) || []).map(habiller)
}

export async function adminMajPro(id, patch) {
  let corps = { ...patch }
  if (patch.statut === 'verifie') {
    const s = await sessionCourante()
    corps = { ...corps, verifie_le: new Date().toISOString(), verifie_par: s?.profil?.id ?? null, numero_confirme: true }
  }
  const l = await requete('/professionnels' + q({ select: SEL_PRO, id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps,
  })
  journaliser('pro.maj', 'professionnel', id, patch)
  return habiller(l?.[0])
}

export async function adminDemandes({ statut, niveau, villeCode, jours = 30 } = {}) {
  const p = {
    select: SEL_DEM, order: 'created_at.desc', limit: '300',
    created_at: 'gt.' + new Date(Date.now() - jours * 864e5).toISOString(),
    ...(await perimetreAdmin()),
  }
  if (statut) p.statut = 'eq.' + statut
  if (niveau) p.niveau = 'eq.' + Number(niveau)
  const v = villeCode ? villeParCode(villeCode) : null
  if (v) p.ville_id = 'eq.' + v.id
  return (await requete('/demandes' + q(p)) || []).map(habillerDemande)
}

export async function adminMajDemande(id, patch) {
  const l = await requete('/demandes' + q({ select: SEL_DEM, id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps: patch,
  })
  // Un PATCH hors perimetre renvoie 200 et un tableau vide : sans ce
  // test, l'administrateur croirait avoir agi.
  if (!l?.length) throw new Error('HORS_PERIMETRE')
  return habillerDemande(l[0])
}

export async function adminOrdonnances() {
  const l = await requete('/ordonnances' + q({
    select: SEL_ORD + ',villes(nom_fr),reponses_ordonnance(id)', order: 'created_at.desc', limit: '200',
  })) || []
  return l.map((o) => ({ ...o, ville_nom: o.villes?.nom_fr, reponses: (o.reponses_ordonnance || []).length }))
}

export async function adminMajOrdonnance(id, patch) {
  const l = await requete('/ordonnances' + q({ select: SEL_ORD, id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps: patch,
  })
  if (!l?.length) throw new Error('HORS_PERIMETRE')
  return l[0]
}

export const adminSignalements = async () =>
  await requete('/signalements' + q({ select: '*', order: 'created_at.desc', limit: '200' })) || []

export async function adminMajSignalement(id, patch) {
  const s = await sessionCourante()
  const l = await requete('/signalements' + q({ select: '*', id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' },
    corps: { ...patch, traite_par: s?.profil?.id ?? null },
  })
  return l?.[0]
}

export async function adminQuartiers(villeCode) {
  const v = villeParCode(villeCode)
  if (!v) return []
  return await requete('/quartiers' + q({
    select: '*', ville_id: 'eq.' + v.id, order: 'groupe.asc.nullslast,nom_fr.asc',
  })) || []
}

export async function adminCreerQuartier({ villeCode, nom, groupe }) {
  const v = villeParCode(villeCode)
  const l = await requete('/quartiers' + q({ select: '*' }), {
    methode: 'POST', entetes: { Prefer: 'return=representation' },
    corps: { ville_id: v.id, nom_fr: nom, groupe: groupe ?? null, qualite: 'officiel', approuve: true },
  })
  await rafraichirRef()
  return l?.[0]
}

export async function adminMajQuartier(id, patch) {
  const l = await requete('/quartiers' + q({ select: '*', id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps: patch,
  })
  await rafraichirRef()
  return l?.[0]
}

export async function adminSupprimerQuartier(id) {
  await requete('/quartiers' + q({ id: 'eq.' + id }), { methode: 'DELETE' })
  await rafraichirRef()
  return true
}

export async function adminCreerVille({ provinceCode, nom, nomAr, lat, lng }) {
  const p = referentiel().provinces.find((x) => x.code === provinceCode)
  const code = `${provinceCode}-${nom.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}${Date.now().toString().slice(-3)}`
  const l = await requete('/villes' + q({ select: '*' }), {
    methode: 'POST', entetes: { Prefer: 'return=representation' },
    corps: { province_id: p.id, code, nom_fr: nom, nom_ar: nomAr || null, lat: lat ?? null, lng: lng ?? null, chef_lieu: false },
  })
  await rafraichirRef()
  return l?.[0]
}

export const adminNumeros = async () =>
  await requete('/numeros_urgence' + q({ select: '*', order: 'ordre.asc' })) || []

export async function adminMajNumero(id, patch) {
  const l = await requete('/numeros_urgence' + q({ select: '*', id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps: patch,
  })
  if (!l?.length) throw new Error('HORS_PERIMETRE')
  return l[0]
}

export async function adminCreerNumero(n) {
  // Sans zone, la politique d'ecriture n'accepterait que le
  // super-administrateur : on rattache le numero au perimetre du compte.
  const s = await sessionCourante()
  const corps = { ...n }
  if (corps.ville_id === undefined && corps.province_id === undefined) {
    if (s?.profil?.role === 'admin_ville') {
      corps.ville_id = s.profil.ville_id
      corps.province_id = s.profil.province_id
    } else if (s?.profil?.role === 'admin_province') {
      corps.province_id = s.profil.province_id
    }
  }
  const l = await requete('/numeros_urgence' + q({ select: '*' }), {
    methode: 'POST', entetes: { Prefer: 'return=representation' }, corps,
  })
  return l?.[0]
}

export async function adminSupprimerNumero(id) {
  await requete('/numeros_urgence' + q({ id: 'eq.' + id }), { methode: 'DELETE' })
  return true
}

export async function adminReglages() {
  const l = await requete('/reglages' + q({ select: '*' })) || []
  return Object.fromEntries(l.map((r) => [r.cle, r.valeur]))
}

export async function adminMajReglage(cle, valeur) {
  await requete('/reglages', {
    methode: 'POST',
    entetes: { Prefer: 'resolution=merge-duplicates' },
    corps: { cle, valeur, updated_at: new Date().toISOString() },
  })
  return adminReglages()
}

export async function adminProfils() {
  const l = await requete('/profils' + q({ select: '*,villes(nom_fr),provinces(nom_fr)', limit: '200' })) || []
  return l.map((p) => ({ ...p, ville_nom: p.villes?.nom_fr, province_nom: p.provinces?.nom_fr }))
}

export async function adminMajProfil(id, patch) {
  const p = { ...patch }
  // On teste la PRESENCE de la cle, pas sa veracite : passer null doit
  // effacer le perimetre (promotion en super-administrateur), et la cle
  // ne doit jamais partir telle quelle vers PostgREST.
  if ('villeCode' in p) {
    const v = p.villeCode ? villeParCode(p.villeCode) : null
    p.ville_id = v?.id ?? null
    p.province_id = v?.province_id ?? null
    delete p.villeCode
  }
  if ('provinceCode' in p) {
    p.province_id = p.provinceCode
      ? referentiel().provinces.find((x) => x.code === p.provinceCode)?.id ?? null
      : (p.ville_id !== undefined ? p.province_id : null)
    delete p.provinceCode
  }
  const l = await requete('/profils' + q({ select: '*', id: 'eq.' + id }), {
    methode: 'PATCH', entetes: { Prefer: 'return=representation' }, corps: p,
  })
  journaliser('profil.maj', 'profil', id, patch)
  return l?.[0]
}

export async function adminCreerProfil() {
  throw new Error('CREATION_COMPTE_SUPABASE')
}

export async function adminEffacerDemo() {
  await requete('/demandes' + q({ demo: 'is.true' }), { methode: 'DELETE' }).catch(() => {})
  await requete('/ordonnances' + q({ demo: 'is.true' }), { methode: 'DELETE' }).catch(() => {})
  await requete('/professionnels' + q({ demo: 'is.true' }), { methode: 'DELETE' })
  return true
}

function journaliser(action, cibleType, cibleId, detail) {
  sessionCourante().then((s) =>
    requete('/journal_admin', {
      methode: 'POST',
      corps: { admin_id: s?.profil?.id ?? null, action, cible_type: cibleType, cible_id: String(cibleId), detail },
    })
  ).catch(() => { /* le journal ne bloque jamais une action */ })
}

export async function escalader() { return 0 }   // assuree par la tache planifiee Netlify

/* ===================== TEMPS REEL (interrogation adaptative) ========= */
/* Cadence : rapide quand l'ecran est visible, lente sinon, arret total
   si le telephone est hors ligne. Chaque appel est une requete courte. */
export function abonnerDemandes(_zone, cb) {
  let minuteur = null
  let arrete = false

  const cadence = () => {
    if (document.visibilityState !== 'visible') return 60000
    if (navigator.connection && ['slow-2g', '2g'].includes(navigator.connection.effectiveType)) return 20000
    return 10000
  }

  const boucle = () => {
    if (arrete) return
    minuteur = setTimeout(() => {
      if (navigator.onLine !== false && document.visibilityState === 'visible') {
        try { cb() } catch { /* ignore */ }
      }
      boucle()
    }, cadence())
  }

  const surVisible = () => {
    if (document.visibilityState === 'visible') { try { cb() } catch { /* ignore */ } }
  }
  document.addEventListener('visibilitychange', surVisible)
  window.addEventListener('online', surVisible)
  boucle()

  return () => {
    arrete = true
    clearTimeout(minuteur)
    document.removeEventListener('visibilitychange', surVisible)
    window.removeEventListener('online', surVisible)
  }
}
