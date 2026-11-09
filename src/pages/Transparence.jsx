/* Tableau public : uniquement des agregats. Aucune ligne ne permet de
   remonter a une personne. */
import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { Entete, Chargement, Vide, Alerte } from '../components/base'

export default function Transparence() {
  const { t } = useLangue()
  const [jours, setJours] = useState(30)
  const [s, setS] = useState(null)

  useEffect(() => {
    setS(null)
    db.statsPubliques(jours).then(setS).catch(() => setS({ total: 0, par_ville: [] }))
  }, [jours])

  const taux = s?.total ? Math.round((s.pris_en_charge / s.total) * 100) : null

  return (
    <div>
      <Entete titre={t('transparence.titre')} />
      <p className="mb-3 text-[14px] text-nil-900/70">{t('transparence.intro')}</p>

      <div className="mb-4 flex gap-2">
        {[7, 30, 90].map((j) => (
          <button key={j} onClick={() => setJours(j)} aria-pressed={jours === j}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold
                    ${jours === j ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
            {t('admin.j' + j)}
          </button>
        ))}
      </div>

      {!s ? <Chargement /> : s.total === 0 ? (
        <Vide emoji="📊" titre={t('transparence.aucune')} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Tuile valeur={s.total} libelle={t('transparence.total')} />
            <Tuile valeur={taux != null ? taux + ' %' : '—'} libelle={t('transparence.prises')} />
            <Tuile valeur={s.delai_median_minutes != null ? s.delai_median_minutes + ' ' + t('commun.min') : '—'}
                   libelle={t('transparence.delai')} />
            <Tuile valeur={s.pros_actifs ?? 0} libelle={t('transparence.prosActifs')} />
          </div>

          {s.par_ville?.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-nil-900/60">{t('transparence.parVille')}</h2>
              <ul className="space-y-1.5">
                {s.par_ville.map((v) => {
                  const pct = v.demandes ? Math.round((v.prises_en_charge / v.demandes) * 100) : 0
                  return (
                    <li key={v.ville} className="carte p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold">{v.ville}</span>
                        <span className="text-[13px] text-nil-900/60 nombres-latins">{v.prises_en_charge}/{v.demandes} · {pct} %</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sable-200">
                        <div className="h-full bg-planifie" style={{ width: pct + '%' }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="mt-6"><Alerte ton="info">{t('legal.avertissement')}</Alerte></div>
    </div>
  )
}

function Tuile({ valeur, libelle }) {
  return (
    <div className="carte p-3">
      <p className="text-2xl font-black text-nil-700 nombres-latins">{valeur}</p>
      <p className="text-[12px] leading-tight text-nil-900/60">{libelle}</p>
    </div>
  )
}
