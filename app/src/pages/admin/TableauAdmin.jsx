/* Tableau de bord temps reel. La premiere chose visible tant que ce
   n'est pas fait : l'avertissement sur les numeros d'urgence non
   testes. C'est le seul point bloquant avant une ouverture au public. */
import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db, abonnerDemandes } from '../../lib/db'
import { CONFIG } from '../../lib/config'
import { NIVEAUX } from '../../lib/config'
import { ilYA } from '../../lib/format'
import { naviguer } from '../../lib/router'
import { Bouton, Alerte, Chargement, Vide } from '../../components/base'

export default function TableauAdmin({ session }) {
  const { t, langue } = useLangue()
  const [s, setS] = useState(null)
  const [urgences, setUrgences] = useState([])
  const base = '/' + CONFIG.cheminAdmin

  const charger = useCallback(() => {
    db.adminStats().then(setS).catch(() => setS({}))
    db.adminDemandes({ niveau: 1, jours: 3 })
      .then((l) => setUrgences(l.filter((d) => ['nouveau', 'vu'].includes(d.statut))))
      .catch(() => setUrgences([]))
  }, [])

  useEffect(() => {
    charger()
    // Un seul minuteur : abonnerDemandes gere deja une cadence adaptee
    // (rapide a l'ecran, lente en arriere-plan, nulle hors ligne).
    return abonnerDemandes(null, charger)
  }, [charger])

  if (!s) return <Chargement />

  const valider = async () => {
    await db.adminMajReglage('numeros_verifies_localement', true)
    charger()
  }

  return (
    <div>
      {!s.numeros_valides_localement && (
        <div className="mb-4">
          <Alerte ton="danger" action={
            <div className="flex flex-wrap gap-2">
              <Bouton taille="petit" variante="secondaire" onClick={() => naviguer(base + '/numeros')}>
                {t('admin.alerteNumerosBouton')}
              </Bouton>
              {session.profil.role === 'super_admin' && (
                <Bouton taille="petit" onClick={valider}>{t('admin.validerNumeros')}</Bouton>
              )}
            </div>
          }>
            {t('admin.alerteNumeros')}
          </Alerte>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Kpi valeur={s.urgences_non_prises} libelle={t('admin.kpi.vitales')} ton={s.urgences_non_prises ? 'danger' : null} />
        <Kpi valeur={s.escalades} libelle={t('admin.kpi.escalades')} ton={s.escalades ? 'danger' : null} />
        <Kpi valeur={s.demandes_ouvertes} libelle={t('admin.kpi.ouvertes')} />
        <Kpi valeur={s.demandes_24h} libelle={t('admin.kpi.j24')} />
        <Kpi valeur={s.pros_en_ligne} libelle={t('admin.kpi.enLigne')} ton="ok" />
        <Kpi valeur={s.pros_a_verifier} libelle={t('admin.kpi.aVerifier')} ton={s.pros_a_verifier ? 'attention' : null}
             onClick={() => naviguer(base + '/soignants')} />
        <Kpi valeur={s.pros_expires} libelle={t('admin.kpi.expires')} onClick={() => naviguer(base + '/soignants')} />
        <Kpi valeur={s.signalements_ouverts} libelle={t('admin.kpi.signalements')}
             ton={s.signalements_ouverts ? 'attention' : null} onClick={() => naviguer(base + '/moderation')} />
        <Kpi valeur={s.numeros_a_confirmer} libelle={t('admin.kpi.numeros')}
             ton={s.numeros_a_confirmer ? 'attention' : null} onClick={() => naviguer(base + '/numeros')} />
        <Kpi valeur={s.services_sans_numero} libelle={t('admin.kpi.sansNumero')}
             ton={s.services_sans_numero ? 'attention' : null} onClick={() => naviguer(base + '/soignants')} />
      </div>

      <h2 className="mb-2 text-sm font-bold text-nil-900/60">🔴 {t('admin.kpi.vitales')}</h2>
      {urgences.length === 0 ? (
        <Vide emoji="✅" titre={t('pro.aucuneDemande')} />
      ) : (
        <ul className="space-y-2">
          {urgences.map((d) => {
            const n = NIVEAUX.find((x) => x.n === d.niveau) || NIVEAUX[0]
            return (
              <li key={d.id} className="carte overflow-hidden">
                <div className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold text-white ${n.couleur}`}>
                  <span className="nombres-latins">{d.code}</span>
                  <span className="ms-auto">{ilYA(d.created_at, langue)}</span>
                </div>
                <div className="p-3">
                  <p className="font-bold">📍 {[d.quartier_nom, d.ville_nom].filter(Boolean).join(', ')}</p>
                  {d.lieu_texte && <p className="text-[14px] text-nil-900/70">{d.lieu_texte}</p>}
                  <p className="mt-1 flex flex-wrap gap-1 text-[12px]">
                    <span className="puce bg-sable-100 text-nil-900/60">{t('statut.' + d.statut)}</span>
                    {d.escalade_le && <span className="puce bg-urgence-50 text-urgence-600">⚠️ {t('admin.kpi.escalades')}</span>}
                    <span className="puce bg-sable-100 text-nil-900/60">👁 {d.reponses?.length || 0}</span>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Kpi({ valeur, libelle, ton, onClick }) {
  const tons = {
    danger: 'border-urgence-100 bg-urgence-50 text-urgence-800',
    attention: 'border-soleil-300 bg-soleil-100 text-soleil-700',
    ok: 'border-green-200 bg-green-50 text-green-900',
  }
  const Balise = onClick ? 'button' : 'div'
  return (
    <Balise onClick={onClick}
            className={`rounded-xl border-2 p-3 text-start ${ton ? tons[ton] : 'border-sable-300 bg-white'}`}>
      <p className="text-2xl font-black nombres-latins">{valeur ?? 0}</p>
      <p className="text-[12px] leading-tight opacity-70">{libelle}</p>
    </Balise>
  )
}
