/* =====================================================================
 * SUIVI DEONTOLOGIQUE — ecran des Ordres
 * ---------------------------------------------------------------------
 * L'Ordre des medecins suit les medecins, infirmiers, sages-femmes et
 * aides-soignants ; l'Ordre des pharmaciens, les pharmacies et les
 * pharmaciens. Pour chaque inscrit : des comptages et des delais
 * (reponses, prises en charge, delai median, signalements), jamais une
 * demande, jamais un patient. Les signaux a regarder sont calcules ici,
 * a partir de ces comptages, et chaque decision (verifier, prolonger,
 * suspendre, refuser) passe par la fonction SQL journalisee.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { ilYA, dateCourte, joursRestants, versCSV, telechargerTexte } from '../../lib/format'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Vide, Modale, Case } from '../../components/base'
import { formatNombre } from '../../lib/graphiques'

const COMPETENCE = {
  ordre_medecins: ['medecin', 'infirmier', 'sage_femme', 'aide_soignant'],
  ordre_pharmaciens: ['pharmacie', 'pharmacien'],
}
const SEUIL_LENT_MIN = 45
const SEUIL_EXPIRATION_J = 7

export function signaux(p) {
  const s = []
  if (p.signalements_ouverts > 0) s.push('signale')
  if (p.statut === 'suspendu') s.push('suspendu')
  if (p.delai_median_min != null && Number(p.delai_median_min) > SEUIL_LENT_MIN) s.push('lent')
  if (['verifie', 'provisoire'].includes(p.statut) && Number(p.reponses) === 0) s.push('inactif')
  if (p.statut === 'provisoire' && p.probation_fin && (joursRestants(p.probation_fin) ?? 99) <= SEUIL_EXPIRATION_J) s.push('expire')
  return s
}
const EMOJI = { signale: '🚩', suspendu: '⏸', lent: '⏱', inactif: '💤', expire: '⌛' }

export default function SectionDeontologie({ session }) {
  const { t, langue } = useLangue()
  const role = session.profil.role
  const types = COMPETENCE[role] || ['medecin', 'infirmier', 'sage_femme', 'aide_soignant', 'pharmacie', 'pharmacien']
  const [jours, setJours] = useState(90)
  const [inclureDemo, setInclureDemo] = useState(false)
  const [liste, setListe] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [filtre, setFiltre] = useState({ type: '', statut: '', signal: '', recherche: '' })
  const [tri, setTri] = useState('reponses')
  const [choisi, setChoisi] = useState(null)
  const [export_, setExport] = useState(false)

  const charger = useCallback(() => {
    setListe(null)
    db.activiteProfessionnels(jours, inclureDemo)
      .then((l) => setListe((l || []).filter((p) => types.includes(p.type)).map((p) => ({ ...p, signaux: signaux(p) }))))
      .catch((e) => { setListe([]); setErreur(/HORS_PERIMETRE|42501/.test(e?.message) ? t('admin.horsPerimetre') : t('commun.erreurReseau')) })
  }, [jours, inclureDemo, t]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { charger() }, [charger])

  const visibles = useMemo(() => {
    const r = filtre.recherche.trim().toLowerCase()
    const l = (liste || []).filter((p) =>
      (!filtre.type || p.type === filtre.type) && (!filtre.statut || p.statut === filtre.statut)
      && (!filtre.signal || p.signaux.includes(filtre.signal)) && (!r || p.nom.toLowerCase().includes(r) || (p.ville || '').toLowerCase().includes(r)))
    const cmp = {
      reponses: (a, b) => b.reponses - a.reponses,
      delai: (a, b) => (b.delai_median_min ?? -1) - (a.delai_median_min ?? -1),
      signalements: (a, b) => b.signalements_ouverts - a.signalements_ouverts || b.signaux.length - a.signaux.length,
      nom: (a, b) => a.nom.localeCompare(b.nom),
      inscription: (a, b) => new Date(b.inscrit_le) - new Date(a.inscrit_le),
    }[tri]
    return l.sort(cmp)
  }, [liste, filtre, tri])

  const resume = useMemo(() => {
    const l = liste || []
    const delais = l.map((p) => p.delai_median_min).filter((x) => x != null).map(Number).sort((a, b) => a - b)
    return {
      total: l.length, verifies: l.filter((p) => p.statut === 'verifie').length, provisoires: l.filter((p) => p.statut === 'provisoire').length,
      suspendus: l.filter((p) => p.statut === 'suspendu').length, enLigne: l.filter((p) => p.en_ligne).length,
      signales: l.filter((p) => p.signalements_ouverts > 0).length, aSurveiller: l.filter((p) => p.signaux.length > 0).length,
      reponses: l.reduce((a, p) => a + Number(p.reponses || 0), 0),
      delai: delais.length ? delais[Math.floor(delais.length / 2)] : null,
    }
  }, [liste])

  const colonnes = () => [
    { titre: t('deon.col.nom'), valeur: 'nom' }, { titre: t('deon.col.type'), valeur: (p) => t('typePro.' + p.type) },
    { titre: t('deon.col.statut'), valeur: (p) => t('badge.' + p.statut) === 'badge.' + p.statut ? p.statut : t('badge.' + p.statut) },
    { titre: t('zone.ville'), valeur: 'ville' }, { titre: t('zone.province'), valeur: 'province' },
    { titre: t('deon.col.reponses'), valeur: 'reponses' }, { titre: t('deon.col.demandes'), valeur: 'demandes_distinctes' },
    { titre: t('deon.col.prises'), valeur: 'prises_en_charge' }, { titre: t('deon.col.delai'), valeur: 'delai_median_min' },
    { titre: t('deon.col.signalements'), valeur: 'signalements_ouverts' }, { titre: t('deon.col.signaux'), valeur: (p) => p.signaux.map((s) => t('deon.signal.' + s)).join(', ') },
    { titre: t('inst.inscritLe'), valeur: (p) => String(p.inscrit_le || '').slice(0, 10) },
  ]
  const exporterCSV = () => telechargerTexte(versCSV(visibles, colonnes()), `afiya-deontologie-${new Date().toISOString().slice(0, 10)}.csv`)
  const exporterExcel = async () => {
    setExport(true); setErreur(null)
    try {
      const cols = colonnes()
      await db.exporterFichier({
        format: 'xlsx', langue: ['fr', 'en', 'ar'].includes(langue) ? langue : 'fr', titre: t('deon.titre'),
        feuilles: [{ nom: t('deon.titre').slice(0, 28), titre: t('deon.titre') + ' · ' + t('admin.j' + jours), colonnes: cols.map((c) => c.titre),
          lignes: visibles.map((p) => cols.map((c) => (typeof c.valeur === 'function' ? c.valeur(p) : p[c.valeur]))) }],
        resume: { ...resume, periode_jours: jours, demo_inclus: inclureDemo, genere_par: t('admin.role.' + role) }, narration: false,
      })
    } catch (e) { setErreur(e?.message || t('commun.erreurReseau')) }
    finally { setExport(false) }
  }

  return (
    <div>
      {inclureDemo && <div className="mb-3 rounded-xl border-2 border-soleil-300 bg-soleil-100 p-2 text-center text-sm font-black uppercase text-soleil-700">🧪 {t('stats.demoIncluse')}</div>}
      <div className="mb-3"><Alerte ton="info">{t('deon.intro.' + (COMPETENCE[role] ? role : 'autre'))}</Alerte></div>
      {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}

      <div className="mb-3 grid grid-cols-3 gap-2">
        {[[resume.total, t('deon.k.inscrits')], [resume.verifies, t('badge.verifie')], [resume.provisoires, t('inst.enAttente')],
          [resume.suspendus, t('deon.k.suspendus'), 'attention'], [resume.aSurveiller, t('deon.k.aSurveiller'), 'attention'], [resume.delai, t('deon.k.delai'), null, t('commun.min')]].map(([v, l, ton, suffixe], i) => (
          <div key={i} className={`rounded-xl border-2 p-3 ${ton && v ? 'border-soleil-300 bg-soleil-100 text-soleil-700' : 'border-sable-300 bg-white'}`}>
            <p className="text-2xl font-black nombres-latins">{v == null ? '—' : formatNombre(v, langue)}{suffixe && v != null ? <span className="text-sm font-bold"> {suffixe}</span> : null}</p>
            <p className="text-[12px] leading-tight opacity-70">{l}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[8rem] grow">
          <Selecteur valeur={String(jours)} onChange={(v) => setJours(Number(v) || 90)} options={[30, 90, 365].map((p) => ({ valeur: String(p), libelle: p === 365 ? t('stats.j365') : t('admin.j' + p) }))} />
        </div>
        <Case coche={inclureDemo} onChange={setInclureDemo}>{t('stats.inclureDemo')}</Case>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Selecteur valeur={filtre.type} onChange={(v) => setFiltre({ ...filtre, type: v })} placeholder={t('admin.filtreType')} options={types.map((x) => ({ valeur: x, libelle: t('typePro.' + x) }))} />
        <Selecteur valeur={filtre.statut} onChange={(v) => setFiltre({ ...filtre, statut: v })} placeholder={t('admin.filtreStatut')}
                   options={['verifie', 'provisoire', 'suspendu', 'expire', 'refuse'].map((x) => ({ valeur: x, libelle: t('badge.' + x) === 'badge.' + x ? t('admin.' + (x === 'refuse' ? 'refuser' : 'suspendre')) : t('badge.' + x) }))} />
        <Selecteur valeur={filtre.signal} onChange={(v) => setFiltre({ ...filtre, signal: v })} placeholder={t('deon.tousSignaux')}
                   options={Object.keys(EMOJI).map((s) => ({ valeur: s, libelle: EMOJI[s] + ' ' + t('deon.signal.' + s) }))} />
        <Selecteur valeur={tri} onChange={setTri} options={['reponses', 'delai', 'signalements', 'nom', 'inscription'].map((x) => ({ valeur: x, libelle: t('deon.tri.' + x) }))} />
        <input className="champ col-span-2" placeholder={t('commun.rechercher')} value={filtre.recherche} onChange={(e) => setFiltre({ ...filtre, recherche: e.target.value })} />
      </div>
      <div className="mb-3 flex gap-2">
        <Bouton taille="petit" variante="secondaire" onClick={exporterCSV}>⬇️ CSV</Bouton>
        <Bouton taille="petit" variante="secondaire" onClick={exporterExcel} enCours={export_} disabled={export_}>⬇️ Excel</Bouton>
        <span className="aide self-center nombres-latins">{visibles.length} / {liste?.length ?? 0}</span>
      </div>

      {liste === null ? <Chargement /> : visibles.length === 0 ? (
        <Vide emoji="🩺" titre={t('deon.vide')} />
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => (
            <li key={p.id}>
              <button onClick={() => setChoisi(p)} className={`w-full rounded-2xl border-2 p-3 text-start ${p.signaux.includes('signale') || p.signaux.includes('suspendu') ? 'border-soleil-300 bg-soleil-100' : 'border-sable-300 bg-white'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{p.nom}{p.demo ? <span className="puce ms-2 bg-soleil-100 text-soleil-700">{t('badge.demo')}</span> : null}</p>
                  <span className="shrink-0 text-base" aria-label={p.signaux.map((s) => t('deon.signal.' + s)).join(', ')}>{p.signaux.map((s) => EMOJI[s]).join(' ')}</span>
                </div>
                <p className="aide">{t('typePro.' + p.type)} · {[p.ville, p.province].filter(Boolean).join(', ')} · {t('badge.' + p.statut) === 'badge.' + p.statut ? p.statut : t('badge.' + p.statut)}{p.en_ligne ? ' · 🟢' : ''}</p>
                <p className="aide nombres-latins">
                  {t('deon.col.reponses')} {formatNombre(p.reponses, langue)} · {t('deon.col.prises')} {formatNombre(p.prises_en_charge, langue)}
                  {p.delai_median_min != null ? ` · ${t('deon.col.delai')} ${formatNombre(p.delai_median_min, langue)} ${t('commun.min')}` : ''}
                  {p.signalements_ouverts ? ` · 🚩 ${p.signalements_ouverts}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!choisi} onFermer={() => setChoisi(null)} titre={choisi?.nom || ''}>
        {choisi && <Fiche p={choisi} t={t} langue={langue} surChangement={() => { setChoisi(null); charger() }} />}
      </Modale>
      <p className="aide mt-4">{t('deon.confidentialite')}</p>
    </div>
  )
}

function Fiche({ p, t, langue, surChangement }) {
  const [signalements, setSignalements] = useState(null)
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState(null)
  useEffect(() => { db.signalementsPro(p.id).then((l) => setSignalements(l || [])).catch(() => setSignalements([])) }, [p.id])
  const agir = async (promesse) => {
    setErreur(null)
    try { await promesse; surChangement() }
    catch (e) { setErreur(/HORS_PERIMETRE|42501/.test(e?.message) ? t('admin.horsPerimetre') : t('commun.erreurReseau')) }
  }
  const traiter = async (id, statut) => {
    setErreur(null)
    try { await db.adminMajSignalement(id, { statut }); setSignalements((l) => l.map((s) => (s.id === id ? { ...s, statut } : s))) }
    catch { setErreur(t('commun.erreurReseau')) }
  }
  const L = ({ l, v }) => <div className="flex justify-between gap-2 border-b border-sable-200 py-1 text-[13px]"><span className="opacity-70">{l}</span><span className="font-bold nombres-latins">{v}</span></div>
  return (
    <div>
      <p className="text-sm">{t('typePro.' + p.type)} · {[p.ville, p.province].filter(Boolean).join(', ')}</p>
      <p className="aide">{t('inst.inscritLe')} {dateCourte(p.inscrit_le, langue)}{p.derniere_activite ? ` · ${t('deon.derniereActivite')} ${ilYA(p.derniere_activite, langue)}` : ''}</p>
      {p.signaux.length > 0 && (
        <div className="my-2"><Alerte ton="attention">{p.signaux.map((s) => EMOJI[s] + ' ' + t('deon.signalDetail.' + s)).join(' · ')}</Alerte></div>
      )}
      <div className="my-3">
        <L l={t('deon.col.reponses')} v={formatNombre(p.reponses, langue)} />
        <L l={t('deon.col.demandes')} v={formatNombre(p.demandes_distinctes, langue)} />
        <L l={t('deon.col.prises')} v={formatNombre(p.prises_en_charge, langue)} />
        <L l={t('deon.col.delai')} v={p.delai_median_min != null ? formatNombre(p.delai_median_min, langue) + ' ' + t('commun.min') : '—'} />
        <L l={t('deon.col.statut')} v={t('badge.' + p.statut) === 'badge.' + p.statut ? p.statut : t('badge.' + p.statut)} />
        {p.probation_fin && p.statut === 'provisoire' && <L l={t('admin.kpi.aVerifier')} v={(joursRestants(p.probation_fin) ?? 0) + ' j'} />}
      </div>

      <p className="mb-1 text-[13px] font-bold">{t('deon.signalements')}</p>
      {signalements === null ? <Chargement /> : signalements.length === 0 ? <p className="aide mb-2">{t('deon.aucunSignalement')}</p> : (
        <ul className="mb-3 space-y-1.5">
          {signalements.map((s) => (
            <li key={s.id} className="rounded-lg border border-sable-300 bg-sable-50 p-2 text-[13px]">
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold">{t('signal.' + s.motif) === 'signal.' + s.motif ? s.motif : t('signal.' + s.motif)}</span>
                <span className="puce bg-white">{t('admin.' + (s.statut === 'traite' ? 'traite' : s.statut === 'rejete' ? 'rejete' : 'kpi.signalements')) === 'admin.kpi.signalements' ? s.statut : t('admin.' + s.statut)}</span>
              </div>
              {s.detail && <p className="mt-1 whitespace-pre-line">{s.detail}</p>}
              <p className="aide">{dateCourte(s.created_at, langue)}</p>
              {s.statut === 'ouvert' && (
                <div className="mt-1 flex gap-2">
                  <Bouton taille="petit" variante="secondaire" onClick={() => traiter(s.id, 'traite')}>{t('admin.traite')}</Bouton>
                  <Bouton taille="petit" variante="secondaire" onClick={() => traiter(s.id, 'rejete')}>{t('admin.rejete')}</Bouton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Champ etiquette={t('admin.noteAdmin')} aide={t('inst.noteAide')}>
        <textarea className="champ min-h-[4rem]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Champ>
      {erreur && <div className="mb-2"><Alerte ton="danger">{erreur}</Alerte></div>}
      <div className="grid grid-cols-2 gap-2">
        {p.statut !== 'verifie' && <Bouton variante="succes" onClick={() => agir(db.validerPro(p.id, 'verifie', note.trim() || null))}>✅ {t('admin.verifier')}</Bouton>}
        {p.statut === 'provisoire' && <Bouton variante="secondaire" onClick={() => agir(db.validerPro(p.id, 'prolonge', note.trim() || null))}>⏳ {t('admin.prolonger')}</Bouton>}
        {p.statut !== 'suspendu' && <Bouton variante="danger" onClick={() => agir(db.validerPro(p.id, 'suspendu', note.trim() || null))}>⏸ {t('admin.suspendre')}</Bouton>}
        {p.statut === 'suspendu' && <Bouton variante="secondaire" onClick={() => agir(db.validerPro(p.id, 'verifie', note.trim() || null))}>▶️ {t('admin.reactiver')}</Bouton>}
        <Bouton variante="danger" onClick={() => agir(db.validerPro(p.id, 'refuse', note.trim() || null))}>✕ {t('admin.refuser')}</Bouton>
      </div>
      <p className="aide mt-3">{t('inst.decisionJournal')}</p>
    </div>
  )
}
