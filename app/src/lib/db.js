/* =====================================================================
 * Facade unique. Le reste de l'application ne sait pas si les donnees
 * viennent de Supabase ou du navigateur : elle appelle db.xxx().
 * Le backend est charge en import dynamique, donc absent du bundle
 * d'accueil.
 * ===================================================================== */
import { MODE_DEMO } from './config'

let backend = null
let chargement = null

export function chargerBackend() {
  if (backend) return Promise.resolve(backend)
  if (!chargement) {
    chargement = (MODE_DEMO
      ? import('./backendLocal')
      : import('./backendSupabase')
    ).then(async (m) => {
      await m.init()
      backend = m
      return m
    }).catch((e) => {
      chargement = null
      throw e
    })
  }
  return chargement
}

/* Appel asynchrone generique. */
const appel = (nom) => (...args) =>
  chargerBackend().then((b) => {
    if (typeof b[nom] !== 'function') throw new Error(`fonction absente : ${nom}`)
    return b[nom](...args)
  })

const NOMS = [
  'annuaire', 'detailPro', 'televerser', 'urlSignee',
  'creerDemande', 'suivreDemande', 'annulerDemande', 'contactDemande', 'contactOrdonnance',
  'creerOrdonnance', 'suivreOrdonnance',
  'numerosUrgence', 'statsPubliques', 'suggererQuartier', 'signaler',
  'inscrire', 'connecter', 'renvoyerConfirmation', 'deconnecter', 'sessionCourante',
  'majPro', 'definirEnLigne', 'demandesZone', 'repondre',
  'ordonnancesZone', 'repondreOrdonnance',
  'adminStats', 'adminPros', 'adminMajPro', 'adminDemandes', 'adminMajDemande',
  'adminOrdonnances', 'adminMajOrdonnance', 'adminSignalements', 'adminMajSignalement',
  'adminQuartiers', 'adminCreerQuartier', 'adminMajQuartier', 'adminSupprimerQuartier',
  'adminCreerVille', 'adminNumeros', 'adminMajNumero', 'adminCreerNumero', 'adminSupprimerNumero',
  'adminReglages', 'adminMajReglage', 'adminProfils', 'adminMajProfil', 'adminCreerProfil',
  'adminEffacerDemo', 'escalader', 'reinitialiser',
]

export const db = Object.fromEntries(NOMS.map((n) => [n, appel(n)]))

/* Abonnements : la fonction de desabonnement doit etre disponible tout
   de suite, meme si le backend n'est pas encore charge. */
function abonnement(nom) {
  return (...args) => {
    let stop = null
    let annule = false
    chargerBackend().then((b) => {
      if (annule) return
      stop = b[nom]?.(...args) || null
    }).catch(() => {})
    return () => { annule = true; stop?.() }
  }
}

export const abonnerDemandes = abonnement('abonnerDemandes')
export const surSession = abonnement('surSession')

export { MODE_DEMO }
