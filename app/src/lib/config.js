/* Configuration lue une seule fois au demarrage. */
const env = import.meta.env

const nettoieTel = (v) => String(v || '').replace(/[^\d]/g, '')

/* Sans cles Supabase, l'application tourne entierement dans le
   navigateur : c'est le MODE DEMO. Calcule avant CONFIG car il en
   determine certaines valeurs par defaut. */
export const MODE_DEMO = !((env.VITE_SUPABASE_URL || '').trim() && (env.VITE_SUPABASE_ANON_KEY || '').trim())

export const CONFIG = {
  nomApp: env.VITE_APP_NAME || 'Allo Santé Tchad',
  supabaseUrl: (env.VITE_SUPABASE_URL || '').trim(),
  supabaseKey: (env.VITE_SUPABASE_ANON_KEY || '').trim(),
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
