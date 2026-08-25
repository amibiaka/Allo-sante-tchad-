/* =====================================================================
 * MODE DEMO — tout se passe dans le navigateur.
 * Sert a : essayer l'application sans rien installer, faire une demo
 * sur le terrain sans reseau, et developper hors ligne.
 * Aucune donnee ne quitte le telephone.
 * ===================================================================== */
import { CONFIG } from './config'
import geo from '../data/geo.json'
import demo from '../data/demo.json'
import urgences from '../data/urgences.json'

const CLE = 'ast.demo.v1'
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679'
const abonnes = new Set()
const blobs = new Map()          // chemin -> Blob (memoire uniquement)

const uid = () => 'x' + Math.random().toString(36).slice(2, 11)
const maintenant = () => new Date().toISOString()

function nouveauCode(db) {
  let c
  do {
    c = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  } while (db.demandes.some((d) => d.code === c) || db.ordonnances.some((o) => o.code === c))
  return c
}

/* --- Referentiel geographique avec identifiants stables -------------- */
const REF = (() => {
  const provinces = [], villes = [], quartiers = []
  let vp = 1, vv = 1, vq = 1
  for (const p of geo.provinces) {
    const prov = { id: vp++, code: p.code, nom_fr: p.fr, nom_ar: p.ar }
    provinces.push(prov)
    for (const v of p.cities) {
      const ville = { id: vv++, province_id: prov.id, code: v.code, nom_fr: v.fr, nom_ar: v.ar, lat: v.lat, lng: v.lng, chef_lieu: !!v.cl }
      villes.push(ville)
      for (const q of v.districts || []) {
        quartiers.push({ id: vq++, ville_id: ville.id, nom_fr: q.fr, nom_ar: q.ar || null, groupe: q.g ?? null, qualite: q.q || 'local', approuve: true })
      }
    }
  }
  return { provinces, villes, quartiers }
})()

const villeParCode = (code) => REF.villes.find((v) => v.code === code) || null
const villeParId = (id) => REF.villes.find((v) => v.id === id) || null

/* --- Base initiale ---------------------------------------------------- */
function graine() {
  const pros = []
  // Services de secours pre-crees pour chaque chef-lieu.
  const SERVICES = [
    ['police', 'Commissariat de police'],
    ['gendarmerie', 'Brigade de gendarmerie'],
    ['pompiers', 'Sapeurs-pompiers'],
  ]
  for (const v of REF.villes) {
    for (const [type, prefixe] of SERVICES) {
      const connu = v.code === 'NDJ-NDJ' && type === 'pompiers'
      pros.push({
        id: uid(), type, nom: `${prefixe} de ${v.nom_fr}`, specialite: 'Service de secours',
        province_id: v.province_id, ville_id: v.id, quartier_id: null,
        telephone: connu ? '+23522522555' : null, whatsapp: null,
        horaires: '24h/24', statut: 'verifie', service_officiel: true,
        numero_confirme: false, demo: false, en_ligne: true,
        lat: v.lat, lng: v.lng, created_at: maintenant(),
      })
    }
  }
  // Hopitaux de reference.
  for (const h of urgences.hopitaux_reference) {
    const v = REF.villes.find((x) => x.nom_fr === h.ville)
    if (!v) continue
    pros.push({
      id: uid(), type: 'centre_sante', nom: h.fr, specialite: 'Hôpital de référence',
      province_id: v.province_id, ville_id: v.id, quartier_id: null,
      telephone: h.tel, whatsapp: null, horaires: '24h/24', statut: 'verifie',
      service_officiel: true, numero_confirme: !!h.verifie, demo: false,
      en_ligne: true, lat: v.lat, lng: v.lng, created_at: maintenant(),
    })
  }
  // Fiches de demonstration.
  for (const p of demo.professionnels) {
    const v = villeParCode(p.ville)
    const q = REF.quartiers.find((x) => x.ville_id === v.id && x.nom_fr === p.quartier)
    pros.push({
      id: uid(), type: p.type, nom: p.nom + ' (DÉMO)', specialite: p.specialite,
      province_id: v.province_id, ville_id: v.id, quartier_id: q?.id ?? null,
      telephone: null, whatsapp: null, horaires: p.horaires,
      statut: 'verifie', service_officiel: false, numero_confirme: false,
      demo: true, en_ligne: !!p.enligne, lat: v.lat, lng: v.lng,
      derniere_activite: maintenant(), created_at: maintenant(),
    })
  }

  const ndj = villeParCode('NDJ-NDJ')
  // Mot de passe conserve pour ceux qui veulent l'essayer, mais l'acces
  // libre permet d'entrer avec le seul numero.
  const comptes = [
    { id: uid(), telephone: '66000000', motDePasse: 'demo1234', role: 'super_admin', nom: 'Super administrateur (DÉMO)', province_id: null, ville_id: null, actif: true },
    { id: uid(), telephone: '66000001', motDePasse: 'demo1234', role: 'pro', nom: 'Dr Démo Soignant', province_id: ndj.province_id, ville_id: ndj.id, actif: true },
    { id: uid(), telephone: '66000002', motDePasse: 'demo1234', role: 'admin_ville', nom: 'Admin ville N\'Djamena (DÉMO)', province_id: ndj.province_id, ville_id: ndj.id, actif: true },
    { id: uid(), telephone: '66000003', motDePasse: 'demo1234', role: 'pro', nom: 'Pharmacie Démo', province_id: ndj.province_id, ville_id: ndj.id, actif: true },
  ]
  // On rattache un vrai profil professionnel aux comptes de demo.
  const proSoignant = {
    id: uid(), profil_id: comptes[1].id, type: 'medecin', nom: 'Dr Démo Soignant',
    specialite: 'Médecine générale', province_id: ndj.province_id, ville_id: ndj.id,
    quartier_id: REF.quartiers.find((q) => q.ville_id === ndj.id && q.nom_fr === 'Moursal')?.id ?? null,
    telephone: '+23566000001', whatsapp: '+23566000001', horaires: 'Lun–Sam 8h–20h',
    statut: 'provisoire', probation_fin: new Date(Date.now() + 45 * 864e5).toISOString(),
    service_officiel: false, numero_confirme: false, demo: true, en_ligne: true,
    lat: ndj.lat, lng: ndj.lng, derniere_activite: maintenant(), created_at: maintenant(),
  }
  const proPharmacie = {
    id: uid(), profil_id: comptes[3].id, type: 'pharmacie', nom: 'Pharmacie Démo',
    specialite: 'Pharmacie de garde', province_id: ndj.province_id, ville_id: ndj.id,
    quartier_id: REF.quartiers.find((q) => q.ville_id === ndj.id && q.nom_fr === 'Chagoua')?.id ?? null,
    telephone: '+23566000003', whatsapp: '+23566000003', horaires: '8h–22h',
    statut: 'verifie', service_officiel: false, numero_confirme: false, demo: true,
    en_ligne: true, lat: ndj.lat, lng: ndj.lng, derniere_activite: maintenant(), created_at: maintenant(),
  }
  pros.push(proSoignant, proPharmacie)

  return {
    version: 1,
    pros,
    comptes,
    session: null,
    demandes: [],
    reponses: [],
    ordonnances: [],
    reponsesOrdo: [],
    signalements: [],
    quartiersSup: [],
    numeros: urgences.numeros.map((u, i) => ({
      id: i + 1, libelle_fr: u.fr, libelle_ar: u.ar, tel: u.tel, tel2: u.tel2 || null,
      ville_id: u.ville ? (REF.villes.find((v) => v.nom_fr === u.ville)?.id ?? null) : null,
      national: !!u.national, h24: !!u.h24, verifie: !!u.verifie, source: u.source,
      ordre: i * 10, actif: true,
    })),
    reglages: {
      delai_escalade: { minutes: 15 },
      retention_medias: { jours: 30 },
      probation_jours: { jours: 45 },
      transparence_active: true,
      numeros_verifies_localement: false,
      message_accueil: { fr: '', ar: '' },
    },
  }
}

let DB = null

function charger() {
  if (DB) return DB
  try {
    const brut = localStorage.getItem(CLE)
    DB = brut ? JSON.parse(brut) : graine()
  } catch { DB = graine() }
  return DB
}
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(DB)) } catch { /* quota */ }
  abonnes.forEach((f) => { try { f() } catch { /* ignore */ } })
}
window.addEventListener('storage', (e) => {
  if (e.key === CLE) { DB = null; charger(); abonnes.forEach((f) => f()) }
})

export function reinitialiser() {
  DB = graine(); sauver()
}

/* --- Enrichissement d'une fiche pro ---------------------------------- */
function habiller(p) {
  const v = villeParId(p.ville_id)
  const q = p.quartier_id ? REF.quartiers.find((x) => x.id === p.quartier_id) : null
  return {
    ...p,
    ville_nom: v?.nom_fr || null,
    ville_code: v?.code || null,
    quartier_nom: q?.nom_fr || null,
    province_nom: REF.provinces.find((x) => x.id === p.province_id)?.nom_fr || null,
  }
}

/* ===================== API PUBLIQUE ================================== */
export async function init() { charger(); return { mode: 'demo' } }

export function referentiel() { return REF }

export async function annuaire({ villeCode, type, recherche, secours } = {}) {
  const db = charger()
  const v = villeCode ? villeParCode(villeCode) : null
  let l = db.pros.filter((p) => ['provisoire', 'verifie'].includes(p.statut))
  if (v) l = l.filter((p) => p.ville_id === v.id)
  if (type) l = l.filter((p) => p.type === type)
  if (secours === true) l = l.filter((p) => p.service_officiel)
  if (secours === false) l = l.filter((p) => !p.service_officiel)
  if (recherche) {
    const r = recherche.toLowerCase()
    l = l.filter((p) => (p.nom + ' ' + (p.specialite || '')).toLowerCase().includes(r))
  }
  return l.map(habiller).sort((a, b) =>
    (b.en_ligne - a.en_ligne) ||
    ((a.telephone ? 0 : 1) - (b.telephone ? 0 : 1)) ||
    a.nom.localeCompare(b.nom, 'fr'))
}

export async function detailPro(id) {
  const p = charger().pros.find((x) => x.id === id)
  return p ? habiller(p) : null
}

export async function televerser(blob, prefixe = 'media') {
  const chemin = `${prefixe}/${uid()}`
  blobs.set(chemin, blob)
  return { chemin, url: URL.createObjectURL(blob) }
}

export async function urlSignee(chemin) {
  const b = blobs.get(chemin)
  return b ? URL.createObjectURL(b) : null
}

export async function creerDemande(p) {
  const db = charger()
  const v = villeParCode(p.villeCode)
  const q = p.quartierNom
    ? REF.quartiers.find((x) => x.ville_id === v?.id && x.nom_fr === p.quartierNom)
    : null
  const d = {
    id: uid(), code: nouveauCode(db), pour_qui: p.pourQui, niveau: p.niveau,
    categories: p.categories || [], description: p.description || '',
    vocal_url: p.vocalChemin || null, age_approx: p.age || null, sexe: p.sexe || null,
    province_id: v?.province_id ?? null, ville_id: v?.id ?? null,
    quartier_id: q?.id ?? null, quartier_libre: q ? null : (p.quartierNom || null),
    lieu_texte: p.lieuTexte || '', ville_libre: p.villeLibre || null,
    lat: p.lat ?? null, lng: p.lng ?? null,
    contact_tel: p.contactTel || null, contact_whatsapp: p.contactWhatsapp || null,
    contact_visible: !!p.contactVisible,
    statut: 'nouveau', escalade_le: null, resolu_le: null,
    consentement: true, demo: true, created_at: maintenant(),
  }
  db.demandes.unshift(d)
  sauver()
  return { code: d.code, id: d.id }
}

function habillerReponse(r) {
  const p = charger().pros.find((x) => x.id === r.pro_id)
  const engage = ['en_route', 'appelle', 'whatsapp'].includes(r.action)
  return {
    action: r.action, message: r.message, created_at: r.created_at,
    pro_id: r.pro_id || null,
    pro_nom: p?.nom || null, pro_type: p?.type || null, pro_statut: p?.statut || null,
    pro_demo: !!p?.demo,
    pro_tel: engage ? p?.telephone || null : null,
    pro_whatsapp: engage ? p?.whatsapp || null : null,
  }
}

/* Meme regle qu'en production : le numero du patient ne part jamais
   dans une liste. Il s'obtient par contactDemande(), apres engagement. */
function sansContact(d) {
  const db = charger()
  const { contact_tel, contact_whatsapp, ...reste } = d
  return {
    ...reste,
    ville_nom: villeParId(d.ville_id)?.nom_fr || null,
    ville_libre: d.ville_libre || null,
    quartier_nom: d.quartier_id ? REF.quartiers.find((q) => q.id === d.quartier_id)?.nom_fr : d.quartier_libre,
    a_contact: !!d.contact_tel,
    reponses: db.reponses.filter((r) => r.demande_id === d.id).map(habillerReponse),
  }
}

export async function contactDemande(demandeId) {
  const db = charger()
  const d = db.demandes.find((x) => x.id === demandeId)
  if (!d) return null
  const s = await sessionCourante()
  const admin = s && s.profil.role !== 'pro'
  const engage = db.reponses.some((r) =>
    r.demande_id === demandeId && r.pro_id === s?.pro?.id &&
    ['en_route', 'appelle', 'whatsapp'].includes(r.action))
  if (!admin && !engage) return null
  return { tel: d.contact_tel, whatsapp: d.contact_whatsapp }
}

export async function contactOrdonnance(ordonnanceId) {
  const db = charger()
  const o = db.ordonnances.find((x) => x.id === ordonnanceId)
  if (!o) return null
  const s = await sessionCourante()
  const admin = s && s.profil.role !== 'pro'
  const repondu = db.reponsesOrdo.some((r) => r.ordonnance_id === ordonnanceId && r.pharmacie_id === s?.pro?.id)
  if (!admin && !repondu) return null
  return { tel: o.contact_tel }
}

export async function suivreDemande(code) {
  const db = charger()
  const d = db.demandes.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase())
  if (!d) return null
  const reponses = db.reponses.filter((r) => r.demande_id === d.id)
  const q = d.quartier_id ? REF.quartiers.find((x) => x.id === d.quartier_id) : null
  return {
    code: d.code, niveau: d.niveau, statut: d.statut, categories: d.categories,
    description: d.description, created_at: d.created_at, escalade_le: d.escalade_le,
    resolu_le: d.resolu_le, ville: villeParId(d.ville_id)?.nom_fr || null,
    ville_code: villeParId(d.ville_id)?.code || null,
    quartier: q?.nom_fr || d.quartier_libre, lieu_texte: d.lieu_texte,
    vus: reponses.length, reponses: reponses.map(habillerReponse),
  }
}

export async function annulerDemande(code) {
  const db = charger()
  const d = db.demandes.find((x) => x.code.toUpperCase() === String(code).toUpperCase())
  if (!d || !['nouveau', 'vu'].includes(d.statut)) return false
  d.statut = 'annule'; sauver(); return true
}

export async function creerOrdonnance(p) {
  const db = charger()
  const v = villeParCode(p.villeCode)
  const q = p.quartierNom ? REF.quartiers.find((x) => x.ville_id === v?.id && x.nom_fr === p.quartierNom) : null
  const o = {
    id: uid(), code: nouveauCode(db), image_url: p.imageChemin || null,
    vocal_url: p.vocalChemin || null, note: p.note || '',
    province_id: v?.province_id ?? null, ville_id: v?.id ?? null,
    quartier_id: q?.id ?? null, quartier_libre: q ? null : (p.quartierNom || null),
    pharmacie_id: p.pharmacieId || null, diffusion: !p.pharmacieId,
    contact_tel: p.contactTel || null, livraison_souhaitee: !!p.livraison,
    statut: 'ouverte', masquee: false, consentement: true, demo: true,
    created_at: maintenant(),
  }
  db.ordonnances.unshift(o)
  sauver()
  return { code: o.code, id: o.id }
}

export async function suivreOrdonnance(code) {
  const db = charger()
  const o = db.ordonnances.find((x) => x.code.toUpperCase() === String(code).trim().toUpperCase())
  if (!o || o.masquee) return null
  const reps = db.reponsesOrdo.filter((r) => r.ordonnance_id === o.id).map((r) => {
    const p = db.pros.find((x) => x.id === r.pharmacie_id)
    return {
      disponibilite: r.disponibilite, prix_indicatif: r.prix_indicatif,
      livraison: r.livraison, message: r.message, created_at: r.created_at,
      pharmacie: p?.nom || null, tel: p?.telephone || null, whatsapp: p?.whatsapp || null,
      statut_pharmacie: p?.statut, demo: !!p?.demo,
      quartier: p?.quartier_id ? REF.quartiers.find((q) => q.id === p.quartier_id)?.nom_fr : null,
    }
  })
  return {
    code: o.code, statut: o.statut, created_at: o.created_at, note: o.note,
    diffusion: o.diffusion, ville: villeParId(o.ville_id)?.nom_fr || null,
    image_url: o.image_url, reponses: reps,
  }
}

export async function numerosUrgence({ villeCode } = {}) {
  const db = charger()
  const v = villeCode ? villeParCode(villeCode) : null
  return db.numeros
    .filter((n) => n.actif && (
      // Sans zone choisie on montre tout : un numero d'hopital verifie
      // vaut mieux qu'un ecran vide au moment ou quelqu'un panique.
      !v || n.national || !n.ville_id || n.ville_id === v.id
    ))
    .sort((a, b) => (b.verifie - a.verifie) || a.ordre - b.ordre)
}

export async function statsPubliques(jours = 30) {
  const db = charger()
  const depuis = Date.now() - jours * 864e5
  const d = db.demandes.filter((x) => new Date(x.created_at).getTime() > depuis)
  const pec = d.filter((x) => ['pris_en_charge', 'resolu'].includes(x.statut))
  const delais = d.map((x) => {
    const r = db.reponses.filter((y) => y.demande_id === x.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]
    return r ? (new Date(r.created_at) - new Date(x.created_at)) / 60000 : null
  }).filter((x) => x != null).sort((a, b) => a - b)
  const parVille = {}
  for (const x of d) {
    const nom = villeParId(x.ville_id)?.nom_fr || '—'
    parVille[nom] = parVille[nom] || { ville: nom, demandes: 0, prises_en_charge: 0 }
    parVille[nom].demandes++
    if (['pris_en_charge', 'resolu'].includes(x.statut)) parVille[nom].prises_en_charge++
  }
  return {
    periode_jours: jours, total: d.length, pris_en_charge: pec.length,
    delai_median_minutes: delais.length ? Math.round(delais[Math.floor(delais.length / 2)]) : null,
    par_ville: Object.values(parVille).sort((a, b) => b.demandes - a.demandes),
    pros_actifs: db.pros.filter((p) => ['provisoire', 'verifie'].includes(p.statut) && !p.demo).length,
  }
}

export async function suggererQuartier({ villeCode, nom }) {
  const db = charger()
  const v = villeParCode(villeCode)
  if (!v || !nom) return false
  db.quartiersSup.push({ id: uid(), ville_id: v.id, nom_fr: nom, approuve: false, qualite: 'suggere', created_at: maintenant() })
  sauver(); return true
}

/* ===================== AUTHENTIFICATION ============================== */
export async function inscrire(p) {
  const db = charger()
  const tel = String(p.telephone).replace(/\D/g, '')
  if (db.comptes.some((c) => c.telephone === tel)) throw new Error('COMPTE_EXISTANT')
  const v = villeParCode(p.villeCode)
  const compte = {
    id: uid(), telephone: tel, motDePasse: p.motDePasse || null, role: 'pro',
    nom: p.nom, province_id: v?.province_id ?? null, ville_id: v?.id ?? null, actif: true,
  }
  db.comptes.push(compte)
  const q = p.quartierNom ? REF.quartiers.find((x) => x.ville_id === v?.id && x.nom_fr === p.quartierNom) : null
  const pro = {
    id: uid(), profil_id: compte.id, type: p.type, nom: p.nom, specialite: p.specialite || '',
    province_id: v?.province_id ?? null, ville_id: v?.id ?? null, quartier_id: q?.id ?? null,
    adresse_texte: p.adresse || '', telephone: '+235' + tel, whatsapp: p.whatsapp || '+235' + tel,
    horaires: p.horaires || '', statut: 'provisoire',
    probation_fin: new Date(Date.now() + (db.reglages.probation_jours?.jours || 45) * 864e5).toISOString(),
    service_officiel: false, numero_confirme: false, demo: false, en_ligne: true,
    lat: v?.lat ?? null, lng: v?.lng ?? null, derniere_activite: maintenant(), created_at: maintenant(),
  }
  db.pros.push(pro)
  db.session = compte.id
  sauver()
  return { profil: compte, pro: habiller(pro) }
}

export async function connecter({ telephone, motDePasse }) {
  const db = charger()
  const tel = String(telephone).replace(/\D/g, '')
  const c = db.comptes.find((x) => x.telephone === tel && (
    // En acces libre, le numero suffit : c'est le mode retenu pour la
    // demonstration et les phases pilotes.
    CONFIG.inscriptionLibre || x.motDePasse === motDePasse
  ))
  if (!c) throw new Error('IDENTIFIANTS')
  if (!c.actif) throw new Error('COMPTE_DESACTIVE')
  db.session = c.id
  sauver()
  return sessionCourante()
}

export async function deconnecter() {
  const db = charger(); db.session = null; sauver()
}

export async function sessionCourante() {
  const db = charger()
  if (!db.session) return null
  const profil = db.comptes.find((c) => c.id === db.session)
  if (!profil) return null
  const pro = db.pros.find((p) => p.profil_id === profil.id)
  return { profil, pro: pro ? habiller(pro) : null }
}

export function surSession(cb) { abonnes.add(cb); return () => abonnes.delete(cb) }

/* ===================== ESPACE PROFESSIONNEL ========================== */
export async function majPro(id, patch) {
  const db = charger()
  const p = db.pros.find((x) => x.id === id)
  if (!p) return null
  const interdits = ['statut', 'probation_fin', 'service_officiel', 'demo', 'profil_id', 'verifie_le']
  for (const [k, v] of Object.entries(patch)) if (!interdits.includes(k)) p[k] = v
  sauver(); return habiller(p)
}

export async function definirEnLigne(enLigne) {
  const s = await sessionCourante()
  if (!s?.pro) return null
  return majPro(s.pro.id, { en_ligne: enLigne, derniere_activite: maintenant() })
}

export async function demandesZone({ inclureCloturees = false } = {}) {
  const db = charger()
  const s = await sessionCourante()
  if (!s) return []
  const admin = s.profil.role !== 'pro'
  const villeId = s.pro?.ville_id ?? s.profil.ville_id
  const provId = s.pro?.province_id ?? s.profil.province_id
  let l = db.demandes.filter((d) => {
    if (admin) {
      if (s.profil.role === 'super_admin') return true
      if (s.profil.role === 'admin_province') return d.province_id === provId
      return d.ville_id === villeId
    }
    return d.ville_id === villeId || (d.escalade_le && d.province_id === provId)
  })
  if (!inclureCloturees) l = l.filter((d) => !['resolu', 'annule', 'non_pris_en_charge'].includes(d.statut))
  return l.map(sansContact).sort((a, b) => a.niveau - b.niveau || new Date(b.created_at) - new Date(a.created_at))
}

export async function repondre({ demandeId, action, message }) {
  const db = charger()
  const s = await sessionCourante()
  const r = { id: uid(), demande_id: demandeId, pro_id: s?.pro?.id || null, action, message: message || null, created_at: maintenant() }
  db.reponses.push(r)
  const d = db.demandes.find((x) => x.id === demandeId)
  if (d) {
    if (action === 'resolu') { d.statut = 'resolu'; d.resolu_le = maintenant() }
    else if (['en_route', 'appelle', 'whatsapp'].includes(action)) {
      if (['nouveau', 'vu'].includes(d.statut)) d.statut = 'pris_en_charge'
    } else if (action === 'vu' && d.statut === 'nouveau') d.statut = 'vu'
  }
  sauver(); return r
}

export async function ordonnancesZone() {
  const db = charger()
  const s = await sessionCourante()
  if (!s) return []
  const villeId = s.pro?.ville_id ?? s.profil.ville_id
  return db.ordonnances
    .filter((o) => !o.masquee && (o.pharmacie_id === s.pro?.id || (o.diffusion && o.ville_id === villeId)))
    .map(({ contact_tel, ...o }) => ({
      ...o,
      ville_nom: villeParId(o.ville_id)?.nom_fr || null,
      quartier_nom: o.quartier_id ? REF.quartiers.find((q) => q.id === o.quartier_id)?.nom_fr : o.quartier_libre,
      a_contact: !!contact_tel,
      mes_reponses: db.reponsesOrdo.filter((r) => r.ordonnance_id === o.id && r.pharmacie_id === s.pro?.id),
      total_reponses: db.reponsesOrdo.filter((r) => r.ordonnance_id === o.id).length,
    }))
}

export async function repondreOrdonnance({ ordonnanceId, disponibilite, prix, livraison, message }) {
  const db = charger()
  const s = await sessionCourante()
  const r = {
    id: uid(), ordonnance_id: ordonnanceId, pharmacie_id: s?.pro?.id || null,
    disponibilite, prix_indicatif: prix || null, livraison: !!livraison,
    message: message || null, created_at: maintenant(),
  }
  db.reponsesOrdo.push(r); sauver(); return r
}

/* ===================== BACK-OFFICE =================================== */
function perimetre(s) {
  return {
    tout: s.profil.role === 'super_admin',
    provinceId: s.profil.province_id,
    villeId: s.profil.ville_id,
    role: s.profil.role,
  }
}
function dansPerimetre(p, o) {
  if (p.tout) return true
  if (p.role === 'admin_province') return o.province_id === p.provinceId
  return o.ville_id === p.villeId
}

export async function adminStats() {
  const db = charger()
  const s = await sessionCourante()
  const p = perimetre(s)
  const dem = db.demandes.filter((d) => dansPerimetre(p, d))
  const jour = Date.now() - 864e5
  return {
    demandes_ouvertes: dem.filter((d) => ['nouveau', 'vu'].includes(d.statut)).length,
    urgences_non_prises: dem.filter((d) => d.niveau === 1 && ['nouveau', 'vu'].includes(d.statut)).length,
    escalades: dem.filter((d) => d.escalade_le && ['nouveau', 'vu'].includes(d.statut)).length,
    demandes_24h: dem.filter((d) => new Date(d.created_at).getTime() > jour).length,
    pros_en_ligne: db.pros.filter((x) => dansPerimetre(p, x) && x.en_ligne && ['provisoire', 'verifie'].includes(x.statut)).length,
    pros_a_verifier: db.pros.filter((x) => dansPerimetre(p, x) && x.statut === 'provisoire' && !x.service_officiel).length,
    pros_expires: db.pros.filter((x) => dansPerimetre(p, x) && x.statut === 'expire').length,
    signalements_ouverts: db.signalements.filter((x) => x.statut === 'ouvert').length,
    numeros_a_confirmer: db.numeros.filter((n) => n.actif && !n.verifie).length,
    services_sans_numero: db.pros.filter((x) => x.service_officiel && !x.telephone && dansPerimetre(p, x)).length,
    numeros_valides_localement: !!db.reglages.numeros_verifies_localement,
  }
}

export async function adminPros({ statut, type, villeCode, recherche } = {}) {
  const db = charger()
  const s = await sessionCourante()
  const p = perimetre(s)
  const v = villeCode ? villeParCode(villeCode) : null
  let l = db.pros.filter((x) => dansPerimetre(p, x))
  if (statut) l = l.filter((x) => x.statut === statut)
  if (type) l = l.filter((x) => x.type === type)
  if (v) l = l.filter((x) => x.ville_id === v.id)
  if (recherche) {
    const r = recherche.toLowerCase()
    l = l.filter((x) => (x.nom + ' ' + (x.specialite || '') + ' ' + (x.telephone || '')).toLowerCase().includes(r))
  }
  return l.map(habiller).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function adminMajPro(id, patch) {
  const db = charger()
  const x = db.pros.find((y) => y.id === id)
  if (!x) return null
  Object.assign(x, patch)
  if (patch.statut === 'verifie') { x.verifie_le = maintenant(); x.numero_confirme = true }
  sauver(); return habiller(x)
}

export async function adminDemandes({ statut, niveau, villeCode, jours = 30 } = {}) {
  const db = charger()
  const s = await sessionCourante()
  const p = perimetre(s)
  const depuis = Date.now() - jours * 864e5
  const v = villeCode ? villeParCode(villeCode) : null
  let l = db.demandes.filter((d) => dansPerimetre(p, d) && new Date(d.created_at).getTime() > depuis)
  if (statut) l = l.filter((d) => d.statut === statut)
  if (niveau) l = l.filter((d) => d.niveau === Number(niveau))
  if (v) l = l.filter((d) => d.ville_id === v.id)
  return l.map(sansContact).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function adminMajDemande(id, patch) {
  const db = charger()
  const d = db.demandes.find((x) => x.id === id)
  if (!d) return null
  Object.assign(d, patch); sauver(); return d
}

export async function adminOrdonnances() {
  const db = charger()
  const s = await sessionCourante()
  const p = perimetre(s)
  return db.ordonnances.filter((o) => dansPerimetre(p, o)).map((o) => ({
    ...o, ville_nom: villeParId(o.ville_id)?.nom_fr || null,
    reponses: db.reponsesOrdo.filter((r) => r.ordonnance_id === o.id).length,
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function adminMajOrdonnance(id, patch) {
  const db = charger()
  const o = db.ordonnances.find((x) => x.id === id)
  if (!o) return null
  Object.assign(o, patch); sauver(); return o
}

export async function adminSignalements() {
  return charger().signalements.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function signaler({ cibleType, cibleId, motif, detail }) {
  const db = charger()
  db.signalements.push({ id: uid(), cible_type: cibleType, cible_id: cibleId, motif, detail: detail || '', statut: 'ouvert', created_at: maintenant() })
  sauver(); return true
}

export async function adminMajSignalement(id, patch) {
  const db = charger()
  const x = db.signalements.find((y) => y.id === id)
  if (x) { Object.assign(x, patch); sauver() }
  return x
}

export async function adminQuartiers(villeCode) {
  const db = charger()
  const v = villeParCode(villeCode)
  if (!v) return []
  return [
    ...REF.quartiers.filter((q) => q.ville_id === v.id),
    ...db.quartiersSup.filter((q) => q.ville_id === v.id),
  ].sort((a, b) => (a.groupe ?? 99) - (b.groupe ?? 99) || a.nom_fr.localeCompare(b.nom_fr, 'fr'))
}

export async function adminCreerQuartier({ villeCode, nom, groupe }) {
  const db = charger()
  const v = villeParCode(villeCode)
  if (!v) return null
  const q = { id: uid(), ville_id: v.id, nom_fr: nom, groupe: groupe ?? null, qualite: 'officiel', approuve: true, created_at: maintenant() }
  db.quartiersSup.push(q); sauver(); return q
}

export async function adminMajQuartier(id, patch) {
  const db = charger()
  const q = db.quartiersSup.find((x) => x.id === id)
  if (q) { Object.assign(q, patch); sauver(); return q }
  const fixe = REF.quartiers.find((x) => x.id === id)
  if (fixe) { Object.assign(fixe, patch); return fixe }   // non persistant en demo
  return null
}

export async function adminSupprimerQuartier(id) {
  const db = charger()
  db.quartiersSup = db.quartiersSup.filter((x) => x.id !== id)
  sauver(); return true
}

export async function adminNumeros() {
  return charger().numeros.slice().sort((a, b) => a.ordre - b.ordre)
}

export async function adminMajNumero(id, patch) {
  const db = charger()
  const n = db.numeros.find((x) => x.id === id)
  if (n) { Object.assign(n, patch); sauver() }
  return n
}

export async function adminCreerNumero(n) {
  const db = charger()
  const item = { id: Math.max(0, ...db.numeros.map((x) => x.id)) + 1, ordre: 999, actif: true, verifie: false, ...n }
  db.numeros.push(item); sauver(); return item
}

export async function adminSupprimerNumero(id) {
  const db = charger()
  db.numeros = db.numeros.filter((x) => x.id !== id); sauver(); return true
}

export async function adminReglages() { return charger().reglages }

export async function adminMajReglage(cle, valeur) {
  const db = charger(); db.reglages[cle] = valeur; sauver(); return db.reglages
}

export async function adminProfils() {
  const db = charger()
  return db.comptes.map((c) => ({
    ...c, motDePasse: undefined,
    ville_nom: c.ville_id ? villeParId(c.ville_id)?.nom_fr : null,
    province_nom: c.province_id ? REF.provinces.find((p) => p.id === c.province_id)?.nom_fr : null,
  }))
}

export async function adminMajProfil(id, patch) {
  const db = charger()
  const c = db.comptes.find((x) => x.id === id)
  if (!c) return null
  if ('villeCode' in patch) {
    const v = patch.villeCode ? villeParCode(patch.villeCode) : null
    patch.ville_id = v?.id ?? null
    patch.province_id = v?.province_id ?? null
    delete patch.villeCode
  }
  if ('provinceCode' in patch) {
    patch.province_id = patch.provinceCode
      ? REF.provinces.find((p) => p.code === patch.provinceCode)?.id ?? null
      : patch.province_id ?? null
    delete patch.provinceCode
  }
  Object.assign(c, patch); sauver(); return c
}

export async function adminCreerProfil({ telephone, motDePasse, nom, role, villeCode, provinceCode }) {
  const db = charger()
  const tel = String(telephone).replace(/\D/g, '')
  if (db.comptes.some((c) => c.telephone === tel)) throw new Error('COMPTE_EXISTANT')
  const v = villeCode ? villeParCode(villeCode) : null
  const c = {
    id: uid(), telephone: tel, motDePasse, nom, role, actif: true,
    ville_id: v?.id ?? null,
    province_id: v?.province_id ?? (provinceCode ? REF.provinces.find((p) => p.code === provinceCode)?.id : null) ?? null,
  }
  db.comptes.push(c); sauver(); return c
}

export async function adminEffacerDemo() {
  const db = charger()
  db.pros = db.pros.filter((p) => !p.demo)
  db.demandes = db.demandes.filter((d) => !d.demo)
  db.ordonnances = db.ordonnances.filter((o) => !o.demo)
  sauver(); return true
}

export async function escalader() {
  const db = charger()
  const delai = (db.reglages.delai_escalade?.minutes || 15) * 60000
  let n = 0
  for (const d of db.demandes) {
    if (d.niveau === 1 && ['nouveau', 'vu'].includes(d.statut) && !d.escalade_le &&
        Date.now() - new Date(d.created_at).getTime() > delai) { d.escalade_le = maintenant(); n++ }
  }
  for (const p of db.pros) {
    if (p.statut === 'provisoire' && !p.service_officiel && p.probation_fin &&
        new Date(p.probation_fin).getTime() < Date.now()) p.statut = 'expire'
  }
  if (n) sauver()
  return n
}

/* Temps reel simule : les autres onglets sont notifies par l'evenement
   "storage", et une verification d'escalade tourne en fond. */
export function abonnerDemandes(_zone, cb) {
  const f = () => cb()
  abonnes.add(f)
  const minuteur = setInterval(async () => { if (await escalader()) cb() }, 30000)
  return () => { abonnes.delete(f); clearInterval(minuteur) }
}
