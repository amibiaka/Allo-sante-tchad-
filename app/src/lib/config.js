/* Configuration lue une seule fois au demarrage. */
const env = import.meta.env

const nettoieTel = (v) => String(v || '').replace(/[^\d]/g, '')

/* Une adresse Supabase valable ressemble a https://abcdefgh.supabase.co.
   On refuse aussi les gabarits laisses tels quels (xxxxxxxx, collez_ici,
   votre-cle...) : mieux vaut retomber en demonstration qu'afficher une
   application vide parce qu'une variable a ete recopiee sans etre
   remplacee. */
const GABARIT = /^(x{4,}|collez|coller|votre|your|paste|remplacer|a_?remplir|todo|changeme)/i

const urlValable = (v) => {
  const s = String(v || '').trim().replace(/\/+$/, '')
  if (!s || GABARIT.test(s.replace(/^https?:\/\//, ''))) return ''
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:') return ''
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname)) return ''
    if (GABARIT.test(u.hostname)) return ''
    return u.origin
  } catch { return '' }
}

/* Cle anonyme : soit un JWT (eyJ...), soit le format publiable recent
   (sb_publishable_...). Tout le reste est un gabarit ou une faute de
   copie. */
const cleValable = (v) => {
  const s = String(v || '').trim()
  if (!s || GABARIT.test(s)) return ''
  if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(s)) return s
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(s)) return s
  return ''
}

const URL_SUPABASE = urlValable(env.VITE_SUPABASE_URL)
const CLE_SUPABASE = cleValable(env.VITE_SUPABASE_ANON_KEY)

/* Sans cles Supabase valables, l'application tourne entierement dans le
   navigateur : c'est le MODE DEMO. Calcule avant CONFIG car il en
   determine certaines valeurs par defaut. */
export const MODE_DEMO = !(URL_SUPABASE && CLE_SUPABASE)

/* Diagnostic visible dans la console : distingue « pas configure » (normal,
   demonstration voulue) de « mal configure » (une variable existe mais ne
   vaut rien), le cas ou l'exploitant croit etre en production. */
export const CONFIG_INVALIDE = MODE_DEMO && Boolean(
  String(env.VITE_SUPABASE_URL || '').trim() || String(env.VITE_SUPABASE_ANON_KEY || '').trim()
)

if (CONFIG_INVALIDE && typeof console !== 'undefined') {
  console.warn(
    '[Allo Sante] Variables Supabase presentes mais invalides — retour en mode demonstration.'
    + (URL_SUPABASE ? '' : ' VITE_SUPABASE_URL attendu : https://<ref>.supabase.co')
    + (CLE_SUPABASE ? '' : ' VITE_SUPABASE_ANON_KEY attendu : eyJ... ou sb_publishable_...')
  )
}

export const CONFIG = {
  nomApp: env.VITE_APP_NAME || 'Allo Santé Tchad',
  supabaseUrl: URL_SUPABASE,
  supabaseKey: CLE_SUPABASE,
  whatsappPlateforme: nettoieTel(env.VITE_PLATFORM_WHATSAPP),
  telegramPlateforme: String(env.VITE_PLATFORM_TELEGRAM || '').replace(/^@/, '').trim(),
  // Back-office : chemin volontairement discret et modifiable.
  cheminAdmin: (env.VITE_ADMIN_PATH || 'gestion').replace(/^[#/]+/, ''),
  cleAdmin: String(env.VITE_ADMIN_GATE_CODE || '').trim(),
  otpActive: env.VITE_ENABLE_PHONE_OTP === 'true',
  transparenceActive: env.VITE_ENABLE_TRANSPARENCY !== 'false',
  domaineTel: 'tel.allosante.td',

  /* Inscription sans mot de passe : le soignant entre son numero, c'est
     tout. Actif par defaut en demonstration. En production, il faut le
     demander explicitement (VITE_INSCRIPTION_LIBRE=true) : le compte est
     alors protege par un code de recuperation garde sur le telephone,
     et non par un mot de passe choisi. Voir le README. */
  inscriptionLibre: env.VITE_INSCRIPTION_LIBRE === 'true'
    || (MODE_DEMO && env.VITE_INSCRIPTION_LIBRE !== 'false'),
}

export const NIVEAUX = [
  { n: 1, cle: 'vitale',   couleur: 'bg-vital',    emoji: '🔴' },
  { n: 2, cle: 'urgent',   couleur: 'bg-urgent',   emoji: '🟠' },
  { n: 3, cle: 'jour',     couleur: 'bg-jour',     emoji: '🟡' },
  { n: 4, cle: 'planifie', couleur: 'bg-planifie', emoji: '🟢' },
]

export const CATEGORIES = [
  { cle: 'accident_route',   emoji: '🚗' },
  { cle: 'accident_domestique', emoji: '🏠' },
  { cle: 'malaise',          emoji: '😵' },
  { cle: 'douleur',          emoji: '⚡' },
  { cle: 'fievre',           emoji: '🌡️' },
  { cle: 'grossesse',        emoji: '🤰' },
  { cle: 'enfant',           emoji: '👶' },
  { cle: 'morsure',          emoji: '🐍' },
  { cle: 'brulure',          emoji: '🔥' },
  { cle: 'intoxication',     emoji: '☠️' },
  { cle: 'autre',            emoji: '❓' },
]

export const TYPES_PRO = [
  { cle: 'medecin',          emoji: '🩺', soin: true },
  { cle: 'infirmier',        emoji: '💉', soin: true },
  { cle: 'sage_femme',       emoji: '🤱', soin: true },
  { cle: 'pharmacie',        emoji: '💊', soin: false },
  { cle: 'centre_sante',     emoji: '🏥', soin: true },
  { cle: 'police',           emoji: '👮', secours: true },
  { cle: 'gendarmerie',      emoji: '🛡️', secours: true },
  { cle: 'pompiers',         emoji: '🚒', secours: true },
  { cle: 'ambulance',        emoji: '🚑', secours: true },
  { cle: 'protection_civile', emoji: '⛑️', secours: true },
  { cle: 'autre',            emoji: '➕' },
]

export const typePro = (cle) => TYPES_PRO.find((t) => t.cle === cle) || TYPES_PRO[TYPES_PRO.length - 1]
