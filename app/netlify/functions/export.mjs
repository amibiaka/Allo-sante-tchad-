/* =====================================================================
 *  POST /api/export — fichier Excel (.xlsx) ou Word (.docx) a partir de
 *  statistiques deja agregees par l'application.
 *
 *  Corps JSON : { format: 'xlsx' | 'docx', langue: 'fr' | 'en' | 'ar',
 *    titre, feuilles: [{ nom, titre, colonnes: [], lignes: [[]] }],
 *    resume: {...}, narration: true | false }
 *  En-tete Authorization: Bearer <jeton de session Supabase>. La base
 *  verifie que le compte est un lecteur (administration, autorite,
 *  Ordre, programme) ; sinon 401. Les donnees recues sont des comptages
 *  que ce compte a deja le droit de voir : la fonction ne lit rien
 *  d'autre dans la base.
 *
 *  Variables Netlify : SUPABASE_URL, SUPABASE_ANON_KEY (ou leurs
 *  jumelles VITE_*) ; facultatif ANTHROPIC_API_KEY (texte d'analyse
 *  redige par Claude, sinon texte compose a partir des chiffres) et
 *  ANTHROPIC_MODEL.
 * ===================================================================== */
import { config as configuration, lecteurDepuisRequete, reponseJson } from './lib/commun.mjs'
import { creerXlsx } from './lib/xlsx.mjs'
import { creerDocx, paragraphe, titre, puce, tableau } from './lib/docx.mjs'
import { narration, LIBELLES } from './lib/narration.mjs'

const MAX_FEUILLES = 14, MAX_LIGNES = 5000, MAX_COLONNES = 12

const propre = (v) => (typeof v === 'number' ? v : v === null || v === undefined ? '' : String(v).slice(0, 500))

function nettoyer(corps) {
  const format = corps.format === 'docx' ? 'docx' : 'xlsx'
  const langue = ['fr', 'en', 'ar'].includes(corps.langue) ? corps.langue : 'fr'
  const titreDoc = String(corps.titre || 'Afiya').slice(0, 160)
  const feuilles = (Array.isArray(corps.feuilles) ? corps.feuilles : []).slice(0, MAX_FEUILLES).map((f, i) => ({
    nom: String(f.nom || `Tableau ${i + 1}`).slice(0, 31),
    titre: String(f.titre || f.nom || `Tableau ${i + 1}`).slice(0, 200),
    colonnes: (Array.isArray(f.colonnes) ? f.colonnes : []).slice(0, MAX_COLONNES).map((c) => String(c).slice(0, 80)),
    lignes: (Array.isArray(f.lignes) ? f.lignes : []).slice(0, MAX_LIGNES).map((l) => (Array.isArray(l) ? l.slice(0, MAX_COLONNES).map(propre) : [propre(l)])),
  }))
  const resume = corps.resume && typeof corps.resume === 'object' ? corps.resume : {}
  return { format, langue, titreDoc, feuilles, resume, narrer: corps.narration !== false }
}

const dateLocale = (langue) => new Date().toLocaleDateString(langue === 'ar' ? 'ar-TD' : langue === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

function feuilleResume(langue, resume) {
  const L = LIBELLES[langue]
  const lignes = Object.entries(L.k).filter(([k]) => resume[k] !== undefined).map(([k, lib]) => [lib, typeof resume[k] === 'number' ? resume[k] : propre(resume[k])])
  lignes.push([L.periode, `${propre(resume.periode_jours || resume.jours)} ${L.jours}`], [L.perimetre, propre(resume.perimetre || L.national)], [L.genere, dateLocale(langue)],
    ['', resume.demo_inclus ? L.demoIncluse : L.demoExclue])
  return { nom: L.chiffres, titre: L.chiffres, colonnes: [L.indicateur, L.valeur], lignes }
}

export default async (req) => {
  if (req.method !== 'POST') return reponseJson({ erreur: 'POST attendu' }, 405)
  const cfg = configuration()
  if (!cfg.url || !cfg.anon) return reponseJson({ erreur: 'configuration Supabase absente' }, 503)
  const lecteur = await lecteurDepuisRequete(req, cfg)
  if (!lecteur) return reponseJson({ erreur: 'SESSION_REQUISE' }, 401)

  let corps
  try { corps = nettoyer(await req.json()) } catch { return reponseJson({ erreur: 'corps invalide' }, 400) }
  const { format, langue, titreDoc, feuilles, resume, narrer } = corps
  const L = LIBELLES[langue]
  const nomFichier = `afiya-${(titreDoc || 'rapport').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'rapport'}-${new Date().toISOString().slice(0, 10)}.${format}`
  const entetes = (type) => ({
    'content-type': type, 'content-disposition': `attachment; filename="${nomFichier}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`, 'cache-control': 'no-store',
  })

  if (format === 'xlsx') {
    const toutes = [feuilleResume(langue, resume), ...feuilles]
    return new Response(creerXlsx({ feuilles: toutes, langue }), { headers: entetes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') })
  }

  const texte = narrer ? await narration(cfg, { langue, titre: titreDoc, resume, feuilles }) : null
  const sousTitre = `${L.periode} : ${propre(resume.periode_jours || resume.jours)} ${L.jours} · ${L.perimetre} : ${propre(resume.perimetre || L.national)} · ${L.genere} ${dateLocale(langue)}${resume.genere_par ? ` ${L.par} ${propre(resume.genere_par)}` : ''}`
  let xmlCorps = ''
  xmlCorps += paragraphe(langue, titreDoc, { gras: true, taille: 40, couleur: '0B4C8C', espaceApres: 60 })
  xmlCorps += paragraphe(langue, sousTitre, { taille: 20, couleur: '555555', espaceApres: 240 })
  if (resume.demo_inclus) xmlCorps += paragraphe(langue, '⚠ ' + L.demoIncluse, { gras: true, couleur: '8A6400' })
  if (texte) {
    xmlCorps += titre(langue, L.synthese, 1) + paragraphe(langue, texte.synthese)
    if (texte.saillants?.length) xmlCorps += titre(langue, L.saillants, 2) + texte.saillants.map((s) => puce(langue, s)).join('')
    if (texte.vigilance?.length) xmlCorps += titre(langue, L.vigilance, 2) + texte.vigilance.map((s) => puce(langue, s)).join('')
    if (texte.recommandations?.length) xmlCorps += titre(langue, L.recommandations, 2) + texte.recommandations.map((s) => puce(langue, s)).join('')
  }
  const fr = feuilleResume(langue, resume)
  xmlCorps += titre(langue, L.chiffres, 1) + tableau(langue, fr.colonnes, fr.lignes)
  for (const f of feuilles) {
    xmlCorps += titre(langue, f.titre, 2) + tableau(langue, f.colonnes, f.lignes.slice(0, 200))
    if (f.lignes.length > 200) xmlCorps += paragraphe(langue, `… ${f.lignes.length - 200} +`, { taille: 18, couleur: '777777' })
  }
  if (texte) {
    xmlCorps += titre(langue, L.methode, 1) + paragraphe(langue, texte.methode)
    xmlCorps += paragraphe(langue, `${L.redige} ${texte.source === 'claude' ? 'Claude (Anthropic)' : L.auto}.`, { taille: 18, couleur: '777777' })
  }
  return new Response(creerDocx({ langue, titreDoc, corps: xmlCorps }), { headers: entetes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') })
}

export const config = { path: '/api/export', method: 'POST' }
