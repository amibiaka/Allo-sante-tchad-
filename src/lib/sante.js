/* Referentiel sanitaire (districts et formations sanitaires du MSP 2020),
   charge a la demande : 110 Ko, 35 Ko compresses, mis en cache par le
   service worker. Une fois charge, « le centre de sante le plus proche »
   fonctionne sans reseau. */
import { distanceKm } from './geo'

let cache = null
export async function chargerSante() {
  if (!cache) {
    const mod = await import('../data/sante.json')
    const d = mod.default || mod
    const [cCode, cNom, cType, cAffil, cFonct, cLng, cLat, cDistrict] = [0, 1, 2, 3, 4, 5, 6, 7]
    const districts = new Map(d.districts.map((x) => [x.id, x]))
    const formations = d.formations.map((f) => ({
      code: f[cCode], nom: f[cNom], type: f[cType], affiliation: f[cAffil], fonctionnelle: f[cFonct],
      lng: f[cLng], lat: f[cLat], districtId: f[cDistrict], district: districts.get(f[cDistrict]) || null,
    }))
    cache = { ...d, districts, formations }
  }
  return cache
}

export const TYPES_FS = ['CS', 'HD', 'HP', 'HN']

/* Les n formations les plus proches d'une position, avec la distance. */
export function plusProches(sante, position, { types = null, fonctionnellesSeules = true, n = 10, rayonKm = 150 } = {}) {
  if (!position?.lat || !position?.lng) return []
  return sante.formations
    .filter((f) => (!fonctionnellesSeules || f.fonctionnelle === 1) && (!types || types.includes(f.type)))
    .map((f) => ({ ...f, distance: distanceKm(position, f) }))
    .filter((f) => f.distance <= rayonKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n)
}

/* Les formations d'un district (quand on n'a pas de position GPS). */
export function formationsDuDistrict(sante, districtId, { fonctionnellesSeules = true } = {}) {
  return sante.formations
    .filter((f) => f.districtId === districtId && (!fonctionnellesSeules || f.fonctionnelle === 1))
    .sort((a, b) => (a.type === b.type ? a.nom.localeCompare(b.nom) : TYPES_FS.indexOf(b.type) - TYPES_FS.indexOf(a.type)))
}

export const libelleType = (sante, code) => sante.types[code] || code
export const libelleAffiliation = (sante, code) => sante.affiliations[code] || code

/* District d'une ville de l'application, par homonymie (memes regles que
   la migration 11, exceptions comprises). */
const EXCEPTIONS = { "n'djamena": 'Ndjamena-Centre', 'faya-largeau': 'Faya', 'am-djarass': 'Amdjarass', 'krim krim': 'Benoye',
  'bebedjia': 'Bebedja', 'guelengdeng': 'Guelendeng' }
const plat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const compact = (s) => plat(s).replace(/[^a-z]/g, '')
export function districtPourVille(sante, nomVille) {
  if (!nomVille) return null
  const ex = EXCEPTIONS[plat(nomVille)]
  const liste = [...sante.districts.values()]
  if (ex) return liste.find((d) => d.nom === ex) || null
  return liste.find((d) => plat(d.nom) === plat(nomVille)) || liste.find((d) => compact(d.nom) === compact(nomVille)) || null
}
