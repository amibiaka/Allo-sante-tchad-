/* =====================================================================
 * Carnet de vaccination : moteur de calendrier, sans reseau.
 * ---------------------------------------------------------------------
 * Le carnet vit dans le telephone (voir store.js, cle « carnet »). Rien
 * n'est envoye a la base, sauf si la famille accepte de declarer une
 * dose de facon anonyme (ville, vaccin, numero de dose, age en mois).
 *
 * Statuts d'une dose, dans l'ordre ou l'ecran les montre :
 *   fait      date enregistree
 *   en_retard l'age cible est depasse de plus que la periode de grace
 *   a_faire   l'age cible est atteint (ou l'est dans les 7 jours)
 *   a_venir   plus tard
 * Le calendrier est une donnee (data/vaccins.json), pas du code : la
 * Direction de la vaccination doit pouvoir le corriger sans toucher a
 * une ligne de JavaScript.
 * ===================================================================== */
import CAL from '../data/vaccins.json' with { type: 'json' }

export const CALENDRIER = CAL
const JOUR = 864e5

export const ageJours = (naissanceISO, auJourISO) => {
  const n = new Date(naissanceISO + 'T00:00:00')
  const a = auJourISO ? new Date(auJourISO + 'T00:00:00') : new Date()
  return Math.floor((a - n) / JOUR)
}

export const dateISO = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const ajouterJours = (iso, n) => dateISO(new Date(iso + 'T00:00:00').getTime() + n * JOUR)

export const cleDose = (code, n) => `${code}-${n}`

/* Age lisible : « 3 j », « 6 sem », « 9 mois », « 2 ans 3 mois ». */
export function ageLisible(naissanceISO, t) {
  const j = ageJours(naissanceISO)
  if (j < 0) return ''
  if (j < 28) return t('vac.ageJours', { n: j })
  if (j < 120) return t('vac.ageSemaines', { n: Math.floor(j / 7) })
  const mois = Math.floor(j / 30.44)
  if (mois < 24) return t('vac.ageMois', { n: mois })
  return t('vac.ageAns', { a: Math.floor(mois / 12), m: mois % 12 })
}

/* Toutes les doses d'un enfant avec leur statut. `faites` : { "PENTA-1": "2026-03-02", ... } */
export function evaluerCarnet(enfant, auJourISO) {
  const age = ageJours(enfant.naissance, auJourISO)
  const faites = enfant.doses || {}
  const sortie = []
  for (const v of CAL.vaccins) {
    for (const d of v.doses) {
      const cle = cleDose(v.code, d.n)
      const grace = d.age === 0 ? CAL.graceNaissanceJours : CAL.graceJours
      const prevue = ajouterJours(enfant.naissance, d.age)
      let statut
      if (faites[cle]) statut = 'fait'
      else if (age < d.age - 7) statut = 'a_venir'
      else if (age <= d.age + grace) statut = 'a_faire'
      else statut = 'en_retard'
      sortie.push({ cle, code: v.code, n: d.n, total: v.doses.length, age: d.age, prevue, statut,
        faitLe: faites[cle] || null, optionnelle: !!d.optionnelle, vaccin: v, dose: d })
    }
  }
  return sortie
}

/* Regroupement par rendez-vous (meme age cible) : c'est ainsi qu'une mere
   vit le calendrier, un rendez-vous = plusieurs piqures. */
export function parRendezVous(evaluation) {
  const groupes = new Map()
  for (const e of evaluation) {
    if (!groupes.has(e.age)) groupes.set(e.age, { age: e.age, prevue: e.prevue, doses: [] })
    groupes.get(e.age).doses.push(e)
  }
  return [...groupes.values()].sort((a, b) => a.age - b.age).map((g) => ({
    ...g,
    statut: g.doses.every((d) => d.statut === 'fait' || (d.optionnelle && d.statut !== 'en_retard' && d.statut !== 'a_faire')) ? 'fait'
      : g.doses.some((d) => d.statut === 'en_retard' && !d.optionnelle) ? 'en_retard'
      : g.doses.some((d) => d.statut === 'a_faire') ? 'a_faire'
      : g.doses.some((d) => d.statut === 'a_venir') ? 'a_venir' : 'fait',
  }))
}

/* Resume pour la liste des enfants et pour l'accueil : combien de doses
   en retard, combien a faire, prochain rendez-vous. */
export function resumeEnfant(enfant, auJourISO) {
  const ev = evaluerCarnet(enfant, auJourISO).filter((d) => !d.optionnelle || d.statut === 'fait')
  const retard = ev.filter((d) => d.statut === 'en_retard').length
  const aFaire = ev.filter((d) => d.statut === 'a_faire').length
  const prochain = ev.filter((d) => d.statut === 'a_venir').sort((a, b) => a.age - b.age)[0] || null
  const faites = ev.filter((d) => d.statut === 'fait').length
  const total = ev.filter((d) => !d.optionnelle).length
  return { retard, aFaire, prochain, faites, total, aJour: retard === 0 && aFaire === 0 }
}

/* Une campagne concerne-t-elle cet enfant ? (age en mois dans la cible,
   vaccin non encore fait si la campagne en vise un precis) */
export function campagneConcerne(campagne, enfant, auJourISO) {
  const mois = Math.floor(ageJours(enfant.naissance, auJourISO) / 30.44)
  if (mois < (campagne.age_min_mois ?? 0) || mois > (campagne.age_max_mois ?? 999)) return false
  return true
}

/* Fichier .ics pour le calendrier du telephone : un evenement par
   rendez-vous a venir ou a faire. Aucune donnee ne sort : le fichier est
   fabrique et telecharge localement. */
export function icsRendezVous(enfant, t) {
  const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Afiya//Carnet//FR', 'CALSCALE:GREGORIAN']
  for (const rv of parRendezVous(evaluerCarnet(enfant))) {
    if (rv.statut === 'fait') continue
    const d = rv.prevue.replace(/-/g, '')
    const noms = rv.doses.filter((x) => x.statut !== 'fait').map((x) => x.vaccin.nom.fr).join(', ')
    lignes.push('BEGIN:VEVENT', `UID:afiya-${enfant.id}-${rv.age}@afiyatchad.com`, `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${t('vac.icsTitre', { nom: enfant.prenom })}`, `DESCRIPTION:${noms}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${t('vac.icsRappel')}`, 'END:VALARM', 'END:VEVENT')
  }
  lignes.push('END:VCALENDAR')
  return lignes.join('\r\n')
}

/* Texte a partager (WhatsApp) : l'etat du carnet, sans identite au-dela
   du prenom choisi par la famille. */
export function texteCarnet(enfant, t, langue = 'fr') {
  const ev = evaluerCarnet(enfant)
  const l = (x) => x.nom[langue] || x.nom.fr
  const faites = ev.filter((d) => d.statut === 'fait').map((d) => `${l(d.vaccin)} ${d.n}/${d.total} (${d.faitLe})`)
  const retard = ev.filter((d) => d.statut === 'en_retard' && !d.optionnelle).map((d) => `${l(d.vaccin)} ${d.n}/${d.total}`)
  const aFaire = ev.filter((d) => d.statut === 'a_faire').map((d) => `${l(d.vaccin)} ${d.n}/${d.total}`)
  return [
    `${t('vac.carnetDe', { nom: enfant.prenom })} (${enfant.naissance})`,
    faites.length ? `${t('vac.faits')} : ${faites.join(' ; ')}` : null,
    aFaire.length ? `${t('vac.aFaire')} : ${aFaire.join(' ; ')}` : null,
    retard.length ? `${t('vac.enRetard')} : ${retard.join(' ; ')}` : null,
    'afiyatchad.com',
  ].filter(Boolean).join('\n')
}
