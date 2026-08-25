/* Acces au referentiel geographique. Charge a la demande (import
   dynamique) pour ne pas alourdir la page d'accueil. */
let cache = null

export async function chargerGeo() {
  if (!cache) {
    const mod = await import('../data/geo.json')
    const geo = mod.default || mod
    const villes = []
    for (const p of geo.provinces) {
      for (const v of p.cities) villes.push({ ...v, province: p })
    }
    cache = { ...geo, villes }
  }
  return cache
}

export function geoSync() { return cache }

export const villeParCode = (geo, code) => geo?.villes.find((v) => v.code === code) || null

export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null
  const R = 6371
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLng = (b.lng - a.lng) * r
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)))
}

export function villeLaPlusProche(geo, position) {
  let meilleure = null, min = Infinity
  for (const v of geo.villes) {
    const d = distanceKm(position, v)
    if (d != null && d < min) { min = d; meilleure = v }
  }
  return meilleure ? { ville: meilleure, distance: min } : null
}

/* Position GPS du navigateur, avec un delai court : en 2G, une attente
   longue est pire que pas de position du tout. */
export function positionActuelle({ delai = 12000, precise = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocalisation indisponible'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: precise, timeout: delai, maximumAge: 60000 }
    )
  })
}

/* ------------------------------------------------------------------ */
/* Detection automatique de la zone.
   Regle : on ne declenche jamais une demande de permission sans geste
   de l'usager. Si la permission est DEJA accordee, on se localise en
   silence a l'ouverture ; sinon on propose un bouton. Un refus n'est
   jamais bloquant : le choix manuel reste toujours la.               */
/* ------------------------------------------------------------------ */

const DISTANCE_DOUTEUSE_KM = 60

export async function permissionGeo() {
  try {
    if (!navigator.geolocation) return 'indisponible'
    if (!navigator.permissions?.query) return 'inconnu'
    const p = await navigator.permissions.query({ name: 'geolocation' })
    return p.state                    // granted | prompt | denied
  } catch { return 'inconnu' }
}

/* forcer = true : l'usager a appuye sur le bouton, on peut demander la
   permission. forcer = false : detection discrete au demarrage. */
export async function detecterZone({ forcer = false } = {}) {
  const etat = await permissionGeo()
  if (etat === 'indisponible' || etat === 'denied') return { etat }
  if (!forcer && etat !== 'granted') return { etat: 'a_demander' }

  const geo = await chargerGeo()
  let p
  try {
    p = await positionActuelle({ delai: forcer ? 15000 : 7000, precise: forcer })
  } catch {
    return { etat: 'echec' }
  }

  const proche = villeLaPlusProche(geo, p)
  if (!proche) return { etat: 'echec' }

  return {
    etat: 'ok',
    position: p,
    ville: proche.ville,
    distance: proche.distance,
    // Au-dela de ~60 km d'un chef-lieu, on est probablement dans un
    // village : on propose la ville trouvee, sans l'affirmer.
    incertain: proche.distance > DISTANCE_DOUTEUSE_KM,
    zone: {
      provinceCode: proche.ville.province.code,
      villeCode: proche.ville.code,
      quartierNom: '', quartierLibre: '',
      libelle: proche.ville.fr,
      lat: p.lat, lng: p.lng,
    },
  }
}

export function grouperQuartiers(geo, ville) {
  const groupes = new Map()
  for (const q of ville?.districts || []) {
    const cle = q.g ?? '_'
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle).push(q)
  }
  return [...groupes.entries()]
    .sort((a, b) => (a[0] === '_' ? 1 : b[0] === '_' ? -1 : Number(a[0]) - Number(b[0])))
    .map(([cle, items]) => ({
      cle,
      libelle: geo.groupes?.[cle] || null,
      items: items.sort((x, y) => x.fr.localeCompare(y.fr, 'fr')),
    }))
}
