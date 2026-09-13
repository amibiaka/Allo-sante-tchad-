/* =====================================================================
 * VEILLE SANITAIRE
 * ---------------------------------------------------------------------
 * Ce que la plateforme peut rendre au systeme de sante : un comptage,
 * par ville et par motif, de ce que les habitants declarent eux-memes,
 * disponible a la minute plutot qu'au mois.
 *
 * Quatre regles gouvernent cet ecran, et aucune ne se negocie :
 *
 *  1. Rien de nominatif ne sort. L'agregation est faite dans la base,
 *     par des fonctions qui ne renvoient que des comptages, et qui
 *     refusent de repondre hors du perimetre du compte connecte.
 *  2. Les fiches de demonstration sont exclues, toujours.
 *  3. Une demande peut porter plusieurs motifs. Les totaux comptent donc
 *     des motifs declares, pas des personnes, et l'ecran le dit.
 *  4. Une anomalie n'est pas un diagnostic. C'est une invitation a
 *     regarder, rien de plus, et l'ecran le dit aussi.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { NIVEAUX } from '../../lib/config'
import { ilYA, versCSV, telechargerTexte } from '../../lib/format'
import { Bouton, Selecteur, Alerte, Chargement, Vide } from '../../components/base'

const PERIODES = [7, 30, 90]
const MOTIFS_AFFICHES = 6

export default function Veille() {
  const { t, langue } = useLangue()
  const [jours, setJours] = useState(30)
  const [lignes, setLignes] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [derniere, setDerniere] = useState(null)
  const [erreur, setErreur] = useState(false)
  const [, setTic] = useState(0)

  const charger = useCallback(() => {
    setLignes(null)
    Promise.all([db.veilleSyndromique(jours), db.veilleAnomalies(), db.veilleFraicheur()])
      .then(([l, a, d]) => {
        setLignes(Array.isArray(l) ? l : [])
        setAnomalies(Array.isArray(a) ? a : [])
        setDerniere(d || null)
        setErreur(false)
      })
      .catch(() => { setLignes([]); setAnomalies([]); setErreur(true) })
  }, [jours])

  useEffect(() => { charger() }, [charger])

  /* L'age de la derniere demande doit vieillir a l'ecran tout seul :
     c'est la seule chose que cet ecran demontre vraiment. */
  useEffect(() => {
    const id = setInterval(() => setTic((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const libMotif = useCallback(
    (c) => (c === 'non_precise' ? t('veille.nonPrecise') : t('cat.' + c)),
    [t],
  )

  const vue = useMemo(() => {
    const villes = new Map()
    const motifs = new Map()
    const parJour = new Map()
    const parNiveau = new Map()
    let total = 0
    for (const r of lignes || []) {
      const n = Number(r.nombre) || 0
      total += n
      const nom = r.villeNom || ('#' + r.ville_id)
      if (!villes.has(nom)) villes.set(nom, new Map())
      const m = villes.get(nom)
      m.set(r.categorie, (m.get(r.categorie) || 0) + n)
      motifs.set(r.categorie, (motifs.get(r.categorie) || 0) + n)
      parJour.set(r.jour, (parJour.get(r.jour) || 0) + n)
      parNiveau.set(Number(r.niveau), (parNiveau.get(Number(r.niveau)) || 0) + n)
    }
    const classes = [...motifs.entries()].sort((a, b) => b[1] - a[1])
    const colonnes = classes.slice(0, MOTIFS_AFFICHES).map(([c]) => c)
    const reste = classes.slice(MOTIFS_AFFICHES).map(([c]) => c)
    const rangs = [...villes.entries()]
      .map(([nom, m]) => ({
        nom,
        cellule: (c) => m.get(c) || 0,
        autres: reste.reduce((a, c) => a + (m.get(c) || 0), 0),
        total: [...m.values()].reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
    return { total, colonnes, reste, rangs, parJour, parNiveau }
  }, [lignes])

  const serie = useMemo(() => {
    const out = []
    const fin = Date.now()
    for (let i = jours - 1; i >= 0; i--) {
      const cle = new Date(fin - i * 864e5).toISOString().slice(0, 10)
      out.push([cle, vue.parJour.get(cle) || 0])
    }
    return out
  }, [vue, jours])

  const exporter = () => {
    telechargerTexte(
      versCSV(lignes || [], [
        { titre: 'jour', valeur: 'jour' },
        { titre: 'ville', valeur: (r) => r.villeNom || r.ville_id },
        { titre: 'code_ville', valeur: (r) => r.villeCode || '' },
        { titre: 'motif', valeur: (r) => libMotif(r.categorie) },
        { titre: 'motif_code', valeur: 'categorie' },
        { titre: 'niveau', valeur: 'niveau' },
        { titre: 'nombre', valeur: 'nombre' },
      ]),
      'veille-' + jours + 'j-' + new Date().toISOString().slice(0, 10) + '.csv',
    )
  }

  if (lignes === null) return <Chargement />

  const maxJour = Math.max(1, ...serie.map(([, n]) => n))

  return (
    <div>
      {erreur && (
        <div className="mb-3"><Alerte ton="danger">{t('commun.erreurReseau')}</Alerte></div>
      )}

      {/* --- Ce que cet ecran demontre : le delai, pas le volume ------- */}
      <div className="mb-4 rounded-xl border-2 border-nil-600 bg-nil-50 p-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-nil-700/70">
          {t('veille.fraicheurTitre')}
        </p>
        <p className="mt-1 text-2xl font-black text-nil-900">
          {derniere ? ilYA(derniere, langue) : t('veille.aucuneDemande')}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-nil-900/70">
          {t('veille.fraicheurNote')}
        </p>
      </div>

      {/* --- Periode et export ---------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[9rem] grow">
          <Selecteur
            valeur={String(jours)}
            onChange={(v) => setJours(Number(v) || 30)}
            options={PERIODES.map((p) => ({ valeur: String(p), libelle: t('admin.j' + p) }))}
          />
        </div>
        <Bouton taille="petit" variante="secondaire" onClick={charger}>
          {t('veille.actualiser')}
        </Bouton>
        <Bouton taille="petit" variante="secondaire" onClick={exporter}>
          {t('admin.exporter')}
        </Bouton>
      </div>

      {vue.total === 0 ? (
        <Vide emoji="📈" titre={t('veille.videTitre')} detail={t('veille.videDetail')} />
      ) : (
        <>
          {/* --- Comptages ------------------------------------------- */}
          <div className="mb-1 grid grid-cols-3 gap-2">
            <Chiffre valeur={vue.total} libelle={t('veille.motifsDeclares')} />
            <Chiffre valeur={vue.rangs.length} libelle={t('veille.villesTouchees')} />
            <Chiffre
              valeur={vue.parNiveau.get(1) || 0}
              libelle={t('veille.niveauVital')}
              ton={vue.parNiveau.get(1) ? 'attention' : null}
            />
          </div>
          <p className="mb-4 text-[12px] leading-snug text-nil-900/60">
            {t('veille.avertissementComptage')}
          </p>

          {/* --- Repartition par jour -------------------------------- */}
          <h3 className="mb-2 text-sm font-bold text-nil-900">{t('veille.parJour')}</h3>
          <div className="mb-4 rounded-xl border-2 border-sable-300 bg-white p-3">
            <div className="flex h-16 items-end gap-px" dir="ltr">
              {serie.map(([cle, n]) => (
                <div key={cle} className="flex-1" title={cle + ' : ' + n}>
                  <div
                    className={'w-full rounded-t ' + (n ? 'bg-nil-600' : 'bg-sable-300')}
                    style={{ height: Math.max(2, Math.round((n / maxJour) * 60)) + 'px' }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-nil-900/50" dir="ltr">
              <span>{serie[0]?.[0]}</span>
              <span>{serie[serie.length - 1]?.[0]}</span>
            </div>
          </div>

          {/* --- Ville x motif --------------------------------------- */}
          <h3 className="mb-2 text-sm font-bold text-nil-900">{t('veille.tableauTitre')}</h3>
          <div className="mb-4 overflow-x-auto rounded-xl border-2 border-sable-300 bg-white">
            <table className="w-full text-start text-[13px]">
              <thead>
                <tr className="border-b-2 border-sable-300 bg-sable-100">
                  <th className="p-2 text-start font-bold">{t('veille.ville')}</th>
                  {vue.colonnes.map((c) => (
                    <th key={c} className="p-2 text-start font-bold">{libMotif(c)}</th>
                  ))}
                  {vue.reste.length > 0 && (
                    <th className="p-2 text-start font-bold">{t('veille.autresMotifs')}</th>
                  )}
                  <th className="p-2 text-start font-bold">{t('veille.total')}</th>
                </tr>
              </thead>
              <tbody>
                {vue.rangs.map((r) => (
                  <tr key={r.nom} className="border-b border-sable-300 last:border-0">
                    <td className="p-2 font-bold">{r.nom}</td>
                    {vue.colonnes.map((c) => (
                      <td key={c} className="p-2 nombres-latins">
                        {r.cellule(c) || <span className="opacity-30">·</span>}
                      </td>
                    ))}
                    {vue.reste.length > 0 && (
                      <td className="p-2 nombres-latins">
                        {r.autres || <span className="opacity-30">·</span>}
                      </td>
                    )}
                    <td className="p-2 font-bold nombres-latins">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* --- Par niveau d'urgence -------------------------------- */}
          <h3 className="mb-2 text-sm font-bold text-nil-900">{t('veille.parNiveau')}</h3>
          <ul className="mb-4 space-y-1">
            {NIVEAUX.map((n) => {
              const v = vue.parNiveau.get(n.n) || 0
              const part = vue.total ? Math.round((v / vue.total) * 100) : 0
              return (
                <li key={n.n} className="flex items-center gap-2 text-[13px]">
                  <span className="w-40 shrink-0">{n.emoji} {t('niveau.' + n.n + '.titre')}</span>
                  <span className="h-2 grow rounded-full bg-sable-300" dir="ltr">
                    <span className="block h-2 rounded-full bg-nil-600" style={{ width: part + '%' }} />
                  </span>
                  <span className="w-16 shrink-0 text-end nombres-latins">{v} ({part}%)</span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* --- Signaux inhabituels ----------------------------------- */}
      <h3 className="mb-2 text-sm font-bold text-nil-900">{t('veille.anomaliesTitre')}</h3>
      {anomalies.length === 0 ? (
        <div className="mb-2"><Alerte ton="succes">{t('veille.aucuneAnomalie')}</Alerte></div>
      ) : (
        <ul className="mb-2 space-y-2">
          {anomalies.map((a, i) => (
            <li key={i} className="rounded-xl border-2 border-soleil-300 bg-soleil-100 p-3">
              <p className="text-sm font-bold text-soleil-700">
                {(a.villeNom || '#' + a.ville_id)} · {libMotif(a.categorie)}
              </p>
              <p className="text-[13px] text-soleil-700/90 nombres-latins">
                {t('veille.anomalieDetail', {
                  semaine: a.semaine,
                  moyenne: Number(a.moyenne_4sem).toFixed(1),
                  rapport: Number(a.rapport).toFixed(1),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mb-4 text-[12px] leading-snug text-nil-900/60">
        {t('veille.anomaliesAvertissement')}
      </p>

      {/* --- Ce qui ne sort pas ------------------------------------ */}
      <Alerte ton="info" titre={t('veille.confidentialiteTitre')}>
        <span className="text-[13px] leading-snug">{t('veille.confidentialite')}</span>
      </Alerte>
    </div>
  )
}

function Chiffre({ valeur, libelle, ton }) {
  const tons = { attention: 'border-soleil-300 bg-soleil-100 text-soleil-700' }
  return (
    <div className={'rounded-xl border-2 p-3 ' + (ton ? tons[ton] : 'border-sable-300 bg-white')}>
      <p className="text-2xl font-black nombres-latins">{valeur ?? 0}</p>
      <p className="text-[12px] leading-tight opacity-70">{libelle}</p>
    </div>
  )
}
