/* =====================================================================
 * STATISTIQUES DU SECTEUR
 * ---------------------------------------------------------------------
 * L'ecran que le programme national, les autorites et les Ordres
 * utilisent pour lire la plateforme en chiffres :
 *   1. un resume (demandes, prise en charge, delais, soignants, doses...)
 *   2. des vues pretes (un clic)
 *   3. une requete libre : source, mesure, une ou deux dimensions,
 *      filtres geographiques ; le dessin le mieux adapte est choisi
 *      tout seul et peut etre change (barres, courbe, empilees,
 *      camembert, tableau)
 *   4. des exports : CSV ici meme ; Excel et Word (avec un texte en
 *      francais, en anglais ou en arabe) produits par la fonction
 *      Netlify « export »
 * Tout vient de fonctions SQL qui ne renvoient que des comptages ou des
 * medianes, bornees au perimetre du compte. La demonstration est exclue
 * tant que l'interrupteur n'est pas enclenche, et l'ecran le dit en
 * grand quand il l'est.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue, traducteur } from '../../lib/i18n'
import { db } from '../../lib/db'
import { chargerGeo } from '../../lib/geo'
import { versCSV, telechargerTexte } from '../../lib/format'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Vide, Case } from '../../components/base'
import { BarresH, Courbe, Empilees, Camembert, TableauStats, formatNombre } from '../../lib/graphiques'

export const PERIODES = [7, 30, 90, 365]
const TEMPS = ['jour', 'semaine', 'mois']
const GEO = ['province', 'ville', 'district', 'quartier']

/* Les dimensions que chaque source accepte : la meme liste blanche que
   la fonction SQL stats_requete (une cle inconnue y est refusee). */
export const SOURCES = {
  demandes: { dims: [...GEO, ...TEMPS, 'categorie', 'niveau', 'statut', 'sexe', 'tranche_age', 'pour_qui', 'escalade'], mesures: ['nombre', 'delai_median'] },
  reponses: { dims: ['province', 'ville', 'district', ...TEMPS, 'action', 'type_pro', 'categorie', 'niveau'], mesures: ['nombre'] },
  professionnels: { dims: [...GEO, 'type', 'statut', 'en_ligne', 'mois'], mesures: ['nombre'] },
  ordonnances: { dims: [...GEO, ...TEMPS, 'statut', 'diffusion', 'disponibilite'], mesures: ['nombre'] },
  vaccins: { dims: ['province', 'ville', 'district', 'semaine', 'mois', 'vaccin', 'dose', 'a_l_heure'], mesures: ['nombre'] },
  evenements: { dims: [...GEO, 'semaine', 'mois', 'type', 'statut'], mesures: ['nombre'] },
  entraide: { dims: ['province', 'ville', 'semaine', 'mois', 'specialite', 'urgence', 'statut'], mesures: ['nombre'] },
}

export const PRESETS = [
  { cle: 'demandesProvince', source: 'demandes', dim1: 'province' },
  { cle: 'motifsNiveau', source: 'demandes', dim1: 'categorie', dim2: 'niveau' },
  { cle: 'delaiProvince', source: 'demandes', mesure: 'delai_median', dim1: 'province' },
  { cle: 'sexeAge', source: 'demandes', dim1: 'tranche_age', dim2: 'sexe' },
  { cle: 'evolution', source: 'demandes', dim1: 'semaine', dim2: 'niveau' },
  { cle: 'quartiers', source: 'demandes', dim1: 'quartier', villeCode: 'NDJ-NDJ' },
  { cle: 'vaccins', source: 'vaccins', dim1: 'vaccin', dim2: 'a_l_heure' },
  { cle: 'soignants', source: 'professionnels', dim1: 'type', dim2: 'statut' },
  { cle: 'actions', source: 'reponses', dim1: 'type_pro', dim2: 'action' },
  { cle: 'ordonnances', source: 'ordonnances', dim1: 'province', dim2: 'disponibilite' },
  { cle: 'entraide', source: 'entraide', dim1: 'specialite', dim2: 'urgence' },
  { cle: 'evenements', source: 'evenements', dim1: 'type', dim2: 'statut' },
]

/* Libelle lisible d'une valeur de dimension, selon la source, pour un
   traducteur donne (celui de l'ecran, ou celui de la langue du document
   exporte). */
export function libelles(t) {
  const tt = (cle, repli) => { const v = t(cle); return v === cle ? repli : v }
  const valeur = (dim, k, source) => {
    if (k === null || k === undefined || k === '') return '—'
    const s = String(k)
    switch (dim) {
      case 'categorie': return s === 'non_precise' ? t('veille.nonPrecise') : tt('cat.' + s, s)
      case 'niveau': return tt('niveau.' + s + '.titre', s)
      case 'statut': return source === 'professionnels' ? tt('badge.' + s, tt('admin.' + s, s))
        : source === 'evenements' ? tt('inst.statutEvt.' + s, s)
        : source === 'entraide' ? tt('entraide.statut.' + s, s)
        : source === 'ordonnances' ? tt('statut.' + s, s) : tt('statut.' + s, s)
      case 'sexe': return s === 'H' ? t('aide.homme') : s === 'F' ? t('aide.femme') : t('stats.inconnu')
      case 'tranche_age': return s === 'inconnu' ? t('stats.inconnu') : s === '0' ? t('stats.moinsUnAn') : s + ' ' + t('stats.ans')
      case 'pour_qui': return tt('aide.' + s, s === 'inconnu' ? t('stats.inconnu') : s)
      case 'escalade': case 'a_l_heure': case 'en_ligne': return s === 'oui' ? t('commun.oui') : s === 'non' ? t('commun.non') : t('stats.inconnu')
      case 'action': return tt('stats.action.' + s, s)
      case 'type': return source === 'evenements' ? tt('alerte.type.' + s, s) : tt('typePro.' + s, s)
      case 'type_pro': return tt('typePro.' + s, s === 'inconnu' ? t('stats.inconnu') : s)
      case 'diffusion': return tt('stats.diffusion.' + s, s)
      case 'disponibilite': return tt('stats.disponibilite.' + s, s)
      case 'urgence': return tt('entraide.urgence.' + s, s)
      case 'specialite': return s === 'non_precisee' ? t('stats.inconnu') : tt('entraide.specialite.' + s, s)
      case 'dose': return t('stats.dose') + ' ' + s
      default: return s
    }
  }
  return { valeur, dimension: (d) => t('stats.dim.' + d), source: (s) => t('stats.source.' + s), mesure: (m) => t('stats.mesure.' + m) }
}
export function useLibelles() {
  const { t } = useLangue()
  return useMemo(() => libelles(t), [t])
}

export function useGeo() {
  const [geo, setGeo] = useState(null)
  useEffect(() => { chargerGeo().then(setGeo).catch(() => setGeo({ provinces: [] })) }, [])
  return geo
}

/* Ordre naturel des valeurs d'une dimension ordonnee (sinon : par
   valeur decroissante). Les cles sont les valeurs brutes de la base. */
const ORDRES = {
  niveau: ['1', '2', '3', '4'], urgence: ['1', '2', '3'], dose: ['1', '2', '3', '4', '5', '6'],
  tranche_age: ['0', '1-4', '5-14', '15-24', '25-49', '50-64', '65+', 'inconnu'],
  escalade: ['oui', 'non'], a_l_heure: ['oui', 'non', 'inconnu'], en_ligne: ['oui', 'non'],
  statut: { demandes: ['nouveau', 'vu', 'pris_en_charge', 'resolu', 'non_pris_en_charge', 'annule'], reponses: ['nouveau', 'vu', 'pris_en_charge', 'resolu', 'non_pris_en_charge', 'annule'],
    professionnels: ['verifie', 'provisoire', 'expire', 'suspendu', 'refuse'], evenements: ['nouveau', 'en_verification', 'confirme', 'transmis', 'ecarte'],
    entraide: ['ouvert', 'repondu', 'clos'], ordonnances: ['ouverte', 'servie', 'close'] },
}
export function ordreDe(dim, source, lignes, brut, libelle) {
  if (!dim) return null
  if (TEMPS.includes(dim)) return [...new Set(lignes.map((l) => l[brut]))].sort().map((k) => lignes.find((l) => l[brut] === k)[libelle])
  let o = ORDRES[dim]
  if (o && !Array.isArray(o)) o = o[source]
  if (!o) return null
  const parBrut = new Map(lignes.map((l) => [String(l[brut]), l[libelle]]))
  return o.filter((k) => parBrut.has(k)).map((k) => parBrut.get(k))
}

/* Le dessin qui convient a la requete. */
export function formeAuto(req, lignes) {
  if (TEMPS.includes(req.dim1)) return 'courbe'
  if (req.dim2) return 'empilees'
  const n = new Set(lignes.map((l) => l.cle1)).size
  return n <= 6 && req.mesure !== 'delai_median' ? 'camembert' : 'barres'
}

export default function SectionStatistiques({ session }) {
  const { t, langue, nom } = useLangue()
  const lib = useLibelles()
  const geo = useGeo()
  const role = session.profil.role
  const peutRegler = ['super_admin', 'centre_numerique', 'autorite_nationale'].includes(role)

  const [jours, setJours] = useState(30)
  const [inclureDemo, setInclureDemo] = useState(false)
  const [resume, setResume] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [req, setReq] = useState({ source: 'demandes', mesure: 'nombre', dim1: 'province', dim2: '', provinceCode: '', villeCode: '', districtId: '' })
  const [lignes, setLignes] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [forme, setForme] = useState('auto')
  const [langueExport, setLangueExport] = useState(['fr', 'en', 'ar'].includes(langue) ? langue : 'fr')
  const [export_, setExport] = useState(null)

  /* L'interrupteur « demonstration dans les statistiques » est un reglage
     de la base : on part de sa valeur, chacun peut la changer pour sa
     session, le programme et le super-administrateur pour tout le monde. */
  useEffect(() => {
    db.adminReglages().then((r) => setInclureDemo(!!r?.stats_inclure_demo?.actif)).catch(() => {})
  }, [])

  useEffect(() => {
    setResume(null)
    db.statsResume(jours, inclureDemo).then(setResume).catch(() => { setResume({}); setErreur(t('commun.erreurReseau')) })
  }, [jours, inclureDemo, t])

  const lancer = useCallback(async (r = req) => {
    setEnCours(true); setErreur(null)
    try {
      const l = await db.statsRequete({ ...r, jours, inclureDemo, langue })
      setLignes(l)
      setForme('auto')
    } catch (e) {
      setLignes([])
      setErreur(/HORS_PERIMETRE|42501/.test(e?.message) ? t('admin.horsPerimetre') : (e?.message || t('commun.erreurReseau')))
    } finally { setEnCours(false) }
  }, [req, jours, inclureDemo, langue, t])

  useEffect(() => { lancer() }, [jours, inclureDemo, langue]) // eslint-disable-line react-hooks/exhaustive-deps

  const appliquerPreset = (p) => {
    const r = { source: p.source, mesure: p.mesure || 'nombre', dim1: p.dim1, dim2: p.dim2 || '', provinceCode: p.provinceCode || '', villeCode: p.villeCode || '', districtId: '' }
    setReq(r); lancer(r)
  }

  const majReq = (k, v) => setReq((r) => {
    const n = { ...r, [k]: v }
    if (k === 'source') {
      const s = SOURCES[v]
      if (!s.dims.includes(n.dim1)) n.dim1 = s.dims[0]
      if (n.dim2 && !s.dims.includes(n.dim2)) n.dim2 = ''
      if (!s.mesures.includes(n.mesure)) n.mesure = 'nombre'
    }
    if (k === 'dim1' && n.dim2 === v) n.dim2 = ''
    if (k === 'provinceCode') { n.villeCode = ''; n.districtId = '' }
    return n
  })

  const traduites = useMemo(() => (lignes || []).map((l) => ({
    cle1: lib.valeur(req.dim1, l.cle1, req.source), cle2: req.dim2 ? lib.valeur(req.dim2, l.cle2, req.source) : '',
    brut1: l.cle1, brut2: l.cle2, valeur: Number(l.valeur),
  })), [lignes, req, lib])

  const formeEffective = forme === 'auto' ? formeAuto(req, traduites) : forme
  const ordre1 = useMemo(() => ordreDe(req.dim1, req.source, traduites, 'brut1', 'cle1'), [req.dim1, req.source, traduites])
  const ordre2 = useMemo(() => ordreDe(req.dim2, req.source, traduites, 'brut2', 'cle2'), [req.dim2, req.source, traduites])
  const titreRequete = `${lib.source(req.source)} · ${req.mesure === 'delai_median' ? t('stats.mesure.delai_median') : t('stats.mesure.nombre')} · ${lib.dimension(req.dim1)}${req.dim2 ? ' × ' + lib.dimension(req.dim2) : ''}`

  const colonnesExport = () => [
    { titre: lib.dimension(req.dim1), valeur: 'cle1' },
    ...(req.dim2 ? [{ titre: lib.dimension(req.dim2), valeur: 'cle2' }] : []),
    { titre: lib.mesure(req.mesure), valeur: 'valeur' },
  ]
  const exporterCSV = () => telechargerTexte(versCSV(traduites, colonnesExport()), `afiya-stats-${req.source}-${new Date().toISOString().slice(0, 10)}.csv`)

  /* Une feuille de tableau dans la langue du document : les libelles des
     dimensions et des valeurs sont retraduits, pas seulement le texte. */
  const feuille = (tx, lx, r, lignesBrutes, titreF) => ({
    nom: lx.source(r.source).slice(0, 28), titre: titreF,
    colonnes: [lx.dimension(r.dim1), ...(r.dim2 ? [lx.dimension(r.dim2)] : []), lx.mesure(r.mesure || 'nombre')],
    lignes: lignesBrutes.map((x) => [lx.valeur(r.dim1, x.cle1, r.source), ...(r.dim2 ? [lx.valeur(r.dim2, x.cle2, r.source)] : []), Number(x.valeur)]),
  })

  const exporterFichier = async (format, complet) => {
    setExport(format + (complet ? '-complet' : '')); setErreur(null)
    try {
      const tx = traducteur(langueExport)
      const lx = libelles(tx)
      const titreX = `${lx.source(req.source)} · ${lx.mesure(req.mesure)} · ${lx.dimension(req.dim1)}${req.dim2 ? ' × ' + lx.dimension(req.dim2) : ''}`
      const l0 = (langueExport === 'ar') === (langue === 'ar') ? (lignes || []) : await db.statsRequete({ ...req, jours, inclureDemo, langue: langueExport })
      const feuilles = [feuille(tx, lx, req, l0, titreX)]
      if (complet) {
        for (const p of PRESETS.slice(0, 8)) {
          if (p.source === req.source && p.dim1 === req.dim1 && (p.dim2 || '') === (req.dim2 || '')) continue
          const l = await db.statsRequete({ ...p, mesure: p.mesure || 'nombre', jours, inclureDemo, langue: langueExport })
          feuilles.push({ ...feuille(tx, lx, { ...p, mesure: p.mesure || 'nombre' }, l, tx('stats.preset.' + p.cle)), nom: tx('stats.preset.' + p.cle).slice(0, 28) })
        }
      }
      const perimetreX = ['super_admin', 'autorite_nationale', 'ordre_medecins', 'ordre_pharmaciens', 'centre_numerique'].includes(role)
        ? tx('admin.national') : [session.profil.ville_nom, session.profil.province_nom].filter(Boolean).join(', ') || tx('admin.national')
      await db.exporterFichier({
        format, langue: langueExport, titre: complet ? tx('stats.rapportTitre') : titreX,
        feuilles, resume: { ...(resume || {}), periode_jours: jours, demo_inclus: inclureDemo, perimetre: perimetreX, genere_par: tx('admin.role.' + role) },
        narration: format === 'docx',
      })
    } catch (e) {
      setErreur(/SESSION_REQUISE/.test(e?.message) ? t('admin.acces') : /EXPORT_INDISPONIBLE/.test(e?.message) ? t('stats.exportIndisponible') : (e?.message || t('commun.erreurReseau')))
    } finally { setExport(null) }
  }

  const villes = useMemo(() => {
    if (!geo) return []
    const p = req.provinceCode ? geo.provinces.find((x) => x.code === req.provinceCode) : null
    return p ? p.cities : geo.provinces.flatMap((x) => x.cities)
  }, [geo, req.provinceCode])
  /* Les districts sanitaires viennent de la base (lecture publique). */
  const [tousDistricts, setTousDistricts] = useState([])
  useEffect(() => { db.adminDistricts().then((l) => setTousDistricts(l || [])).catch(() => {}) }, [])
  const districts = useMemo(() => tousDistricts
    .filter((d) => !req.provinceCode || d.province_code === req.provinceCode)
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom))), [tousDistricts, req.provinceCode])

  const basculerDemo = async (v) => {
    setInclureDemo(v)
    if (peutRegler) db.adminMajReglage('stats_inclure_demo', { actif: v }).catch(() => {})
  }

  return (
    <div>
      {inclureDemo && (
        <div className="mb-3 rounded-xl border-2 border-soleil-300 bg-soleil-100 p-3 text-center text-sm font-black uppercase tracking-wide text-soleil-700">
          🧪 {t('stats.demoIncluse')}
        </div>
      )}
      <div className="mb-3"><Alerte ton="info">{t('stats.intro.' + (['ordre_medecins', 'ordre_pharmaciens'].includes(role) ? 'ordre' : 'general'))}</Alerte></div>

      {/* --- Periode, demonstration ---------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[9rem] grow">
          <Selecteur valeur={String(jours)} onChange={(v) => setJours(Number(v) || 30)}
                     options={PERIODES.map((p) => ({ valeur: String(p), libelle: p === 365 ? t('stats.j365') : t('admin.j' + p) }))} />
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <Case coche={inclureDemo} onChange={basculerDemo}>{t('stats.inclureDemo')}</Case>
        </label>
      </div>
      {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}

      {/* --- Resume ---------------------------------------------------- */}
      <h3 className="mb-2 text-sm font-bold text-nil-900">{t('stats.resume')}</h3>
      {resume === null ? <Chargement /> : <Resume r={resume} langue={langue} t={t} lib={lib} />}

      {/* --- Vues pretes ----------------------------------------------- */}
      <h3 className="mb-2 mt-5 text-sm font-bold text-nil-900">{t('stats.vuesPretes')}</h3>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PRESETS.map((p) => {
          const actif = p.source === req.source && p.dim1 === req.dim1 && (p.dim2 || '') === (req.dim2 || '') && (p.mesure || 'nombre') === req.mesure
          return (
            <button key={p.cle} onClick={() => appliquerPreset(p)} aria-pressed={actif}
                    className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-[13px] font-bold ${actif ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white text-nil-700'}`}>
              {t('stats.preset.' + p.cle)}
            </button>
          )
        })}
      </div>

      {/* --- Requete --------------------------------------------------- */}
      <h3 className="mb-2 text-sm font-bold text-nil-900">{t('stats.requete')}</h3>
      <div className="mb-3 rounded-xl border-2 border-sable-300 bg-white p-3">
        <div className="grid grid-cols-2 gap-x-2">
          <Champ etiquette={t('stats.sourceTitre')}>
            <Selecteur valeur={req.source} onChange={(v) => majReq('source', v)} options={Object.keys(SOURCES).map((s) => ({ valeur: s, libelle: lib.source(s) }))} />
          </Champ>
          <Champ etiquette={t('stats.mesureTitre')}>
            <Selecteur valeur={req.mesure} onChange={(v) => majReq('mesure', v)} options={SOURCES[req.source].mesures.map((m) => ({ valeur: m, libelle: t('stats.mesure.' + m) }))} />
          </Champ>
          <Champ etiquette={t('stats.dim1')}>
            <Selecteur valeur={req.dim1} onChange={(v) => majReq('dim1', v)} options={SOURCES[req.source].dims.map((d) => ({ valeur: d, libelle: lib.dimension(d) }))} />
          </Champ>
          <Champ etiquette={t('stats.dim2')}>
            <Selecteur valeur={req.dim2} onChange={(v) => majReq('dim2', v)} placeholder={t('stats.aucune')}
                       options={SOURCES[req.source].dims.filter((d) => d !== req.dim1).map((d) => ({ valeur: d, libelle: lib.dimension(d) }))} />
          </Champ>
          <Champ etiquette={t('zone.province')}>
            <Selecteur valeur={req.provinceCode} onChange={(v) => majReq('provinceCode', v)} placeholder={t('admin.national')}
                       options={(geo?.provinces || []).map((p) => ({ valeur: p.code, libelle: nom(p) }))} />
          </Champ>
          <Champ etiquette={t('zone.ville')}>
            <Selecteur valeur={req.villeCode} onChange={(v) => majReq('villeCode', v)} placeholder={t('commun.tous')}
                       options={villes.map((v) => ({ valeur: v.code, libelle: nom(v) }))} />
          </Champ>
          {districts.length > 0 && (
            <Champ etiquette={t('stats.dim.district')}>
              <Selecteur valeur={String(req.districtId || '')} onChange={(v) => majReq('districtId', v)} placeholder={t('commun.tous')}
                         options={districts.map((d) => ({ valeur: String(d.id), libelle: d.nom }))} />
            </Champ>
          )}
        </div>
        <Bouton className="w-full" onClick={() => lancer()} enCours={enCours}>📊 {t('stats.afficher')}</Bouton>
      </div>

      {/* --- Resultat -------------------------------------------------- */}
      {lignes === null || enCours ? <Chargement /> : traduites.length === 0 ? (
        <Vide emoji="📊" titre={t('stats.vide')} detail={t('stats.videDetail')} />
      ) : (
        <div className="rounded-xl border-2 border-sable-300 bg-white p-3">
          <p className="mb-2 text-[13px] font-bold text-nil-900">{titreRequete}</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {['auto', 'barres', 'courbe', 'empilees', 'camembert', 'tableau'].filter((f) => f !== 'courbe' || TEMPS.includes(req.dim1)).filter((f) => f !== 'empilees' || req.dim2).map((f) => (
              <button key={f} onClick={() => setForme(f)} aria-pressed={forme === f}
                      className={`rounded-full border px-2.5 py-1 text-[12px] font-bold ${forme === f ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white text-nil-700'}`}>
                {t('stats.forme.' + f)}
              </button>
            ))}
          </div>
          <Dessin forme={formeEffective} req={req} lignes={traduites} langue={langue} t={t} ordre1={ordre1} ordre2={ordre2} />
          {formeEffective !== 'tableau' && <div className="mt-4" />}
          <TableauStats lignes={traduites} langue={langue} enteteCle1={lib.dimension(req.dim1)} enteteCle2={req.dim2 ? lib.dimension(req.dim2) : ''}
                        enteteValeur={req.mesure === 'delai_median' ? t('stats.mesure.delai_median') : t('stats.mesure.nombre')} libelleTotal={req.mesure === 'delai_median' ? t('stats.median') : t('veille.total')}
                        ordreLignes={ordre1} ordreColonnes={ordre2} />
          {req.mesure === 'delai_median' && <p className="aide mt-2">{t('stats.delaiNote')}</p>}
          <p className="aide mt-2">{t('stats.confidentialite')}</p>

          {/* --- Exports ------------------------------------------------ */}
          <div className="mt-3 border-t border-sable-200 pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold">{t('stats.langueExport')}</span>
              {['fr', 'en', 'ar'].map((l) => (
                <button key={l} onClick={() => setLangueExport(l)} aria-pressed={langueExport === l}
                        className={`rounded-full border px-2.5 py-1 text-[12px] font-bold ${langueExport === l ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
                  {{ fr: 'Français', en: 'English', ar: 'العربية' }[l]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Bouton variante="secondaire" taille="petit" onClick={exporterCSV}>⬇️ CSV</Bouton>
              <Bouton variante="secondaire" taille="petit" onClick={() => exporterFichier('xlsx', false)} enCours={export_ === 'xlsx'} disabled={!!export_}>⬇️ Excel</Bouton>
              <Bouton variante="secondaire" taille="petit" onClick={() => exporterFichier('docx', false)} enCours={export_ === 'docx'} disabled={!!export_}>⬇️ Word</Bouton>
              <Bouton taille="petit" onClick={() => exporterFichier('docx', true)} enCours={export_ === 'docx-complet'} disabled={!!export_}>📄 {t('stats.rapportComplet')}</Bouton>
            </div>
            <p className="aide mt-2">{t('stats.exportAide')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Dessin({ forme, req, lignes, langue, t, ordre1, ordre2 }) {
  const autres = t('stats.autres')
  if (forme === 'tableau') return null
  if (forme === 'courbe') {
    return <Courbe langue={langue} points={lignes.map((l) => ({ x: l.brut1, serie: req.dim2 ? l.cle2 : '', valeur: l.valeur }))} ordreSeries={ordre2} />
  }
  if (forme === 'empilees' && req.dim2) return <Empilees lignes={lignes} langue={langue} libelleAutres={autres} ordreGroupes={ordre1} ordreSeries={ordre2} />
  const agregees = agregerCle1(lignes)
  if (forme === 'camembert') return <Camembert lignes={agregees} langue={langue} libelleAutres={autres} />
  return <BarresH lignes={agregees} langue={langue} ordre={ordre1} format={(v) => formatNombre(v, langue) + (req.mesure === 'delai_median' ? ' ' + t('commun.min') : '')} />
}

function agregerCle1(lignes) {
  const m = new Map()
  for (const l of lignes) m.set(l.cle1, (m.get(l.cle1) || 0) + Number(l.valeur || 0))
  return [...m.entries()].map(([cle, valeur]) => ({ cle, valeur }))
}

/* Le resume chiffre : tuiles, puis deux repartitions. */
export function Resume({ r, langue, t, lib, compact }) {
  if (!r || r.demandes === undefined) return <div className="mb-2"><Alerte ton="attention">{t('stats.resumeIndisponible')}</Alerte></div>
  const K = ({ v, l, suffixe, ton }) => (
    <div className={`rounded-xl border-2 p-3 ${ton === 'attention' && v ? 'border-soleil-300 bg-soleil-100 text-soleil-700' : 'border-sable-300 bg-white'}`}>
      <p className="text-2xl font-black nombres-latins">{v === null || v === undefined ? '—' : formatNombre(v, langue)}{suffixe && v != null ? <span className="text-base font-bold"> {suffixe}</span> : null}</p>
      <p className="text-[12px] leading-tight opacity-70">{l}</p>
    </div>
  )
  const niveaux = Object.entries(r.demandes_par_niveau || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ cle: lib.valeur('niveau', k, 'demandes'), valeur: v }))
  const types = Object.entries(r.soignants_par_type || {}).map(([k, v]) => ({ cle: lib.valeur('type', k, 'professionnels'), valeur: v }))
  const statuts = Object.entries(r.demandes_par_statut || {}).map(([k, v]) => ({ cle: lib.valeur('statut', k, 'demandes'), valeur: v }))
  const ordreStatuts = ORDRES.statut.demandes.filter((k) => r.demandes_par_statut?.[k] !== undefined).map((k) => lib.valeur('statut', k, 'demandes'))
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <K v={r.demandes} l={t('stats.k.demandes')} />
        <K v={r.demandes_vitales} l={t('stats.k.vitales')} ton="attention" />
        <K v={r.taux_prise_en_charge} l={t('stats.k.taux')} suffixe="%" />
        <K v={r.delai_prise_en_charge_min} l={t('stats.k.delai')} suffixe={t('commun.min')} />
        <K v={r.escaladees} l={t('stats.k.escaladees')} ton="attention" />
        <K v={r.villes_actives} l={t('stats.k.villes')} />
        <K v={r.soignants_inscrits} l={t('stats.k.soignants')} />
        <K v={r.soignants_verifies} l={t('stats.k.verifies')} />
        <K v={r.soignants_actifs} l={t('stats.k.actifs')} />
        <K v={r.ordonnances} l={t('stats.k.ordonnances')} />
        <K v={r.ordonnances_servies} l={t('stats.k.servies')} />
        <K v={r.doses_declarees} l={t('stats.k.doses')} />
        <K v={r.evenements} l={t('stats.k.evenements')} />
        <K v={r.evenements_confirmes} l={t('stats.k.confirmes')} ton="attention" />
        <K v={r.cas_entraide} l={t('stats.k.entraide')} />
      </div>
      {!compact && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {niveaux.length > 0 && (
            <div className="rounded-xl border-2 border-sable-300 bg-white p-3">
              <p className="mb-2 text-[13px] font-bold">{t('stats.parNiveau')}</p>
              <Camembert lignes={niveaux} langue={langue} libelleAutres={t('stats.autres')} />
            </div>
          )}
          {types.length > 0 && (
            <div className="rounded-xl border-2 border-sable-300 bg-white p-3">
              <p className="mb-2 text-[13px] font-bold">{t('stats.parType')}</p>
              <BarresH lignes={types} langue={langue} />
            </div>
          )}
          {statuts.length > 0 && (
            <div className="rounded-xl border-2 border-sable-300 bg-white p-3 sm:col-span-2">
              <p className="mb-2 text-[13px] font-bold">{t('stats.parStatut')}</p>
              <BarresH lignes={statuts} langue={langue} ordre={ordreStatuts} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
