import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { ilYA } from '../lib/format'
import { lienAppel, lienWhatsApp } from '../lib/links'
import { Lien } from '../lib/router'
import { Bouton, Entete, Alerte, Chargement, Vide } from '../components/base'

const TONS = {
  complete: 'bg-green-100 text-green-800',
  partielle: 'bg-soleil-100 text-soleil-700',
  indisponible: 'bg-sable-200 text-nil-900/60',
}

export default function SuiviOrdonnance({ code }) {
  const { t, langue } = useLangue()
  const [o, setO] = useState(undefined)

  const charger = useCallback(() => {
    db.suivreOrdonnance(code).then(setO).catch(() => setO(null))
  }, [code])

  useEffect(() => {
    charger()
    const i = setInterval(charger, 12000)
    return () => clearInterval(i)
  }, [charger])

  if (o === undefined) return <><Entete titre={t('ordo.reponses')} /><Chargement /></>
  if (o?.bloque) {
    return (
      <div>
        <Entete titre={t('ordo.reponses')} />
        <Alerte ton="attention" titre={t('suivi.bloque')}>{t('suivi.bloqueAide')}</Alerte>
      </div>
    )
  }
  if (o === null) {
    return (
      <div>
        <Entete titre={t('ordo.reponses')} />
        <Vide emoji="🔎" titre={t('suivi.introuvable')} />
      </div>
    )
  }

  const reponses = o.reponses || []
  const dispo = reponses.filter((r) => r.disponibilite !== 'indisponible')

  return (
    <div>
      <Entete titre={t('ordo.reponses')} sousTitre={`${t('suivi.code')} ${o.code}`}
              action={<button onClick={charger} className="rounded-full px-3 py-2 text-sm font-bold text-nil-600">↻</button>} />

      <div className="carte mb-4 p-3">
        <p className="font-bold">{t('statut.' + (o.statut || 'ouverte'))}</p>
        <p className="aide">{[o.ville, ilYA(o.created_at, langue)].filter(Boolean).join(' · ')}</p>
        {o.note && <p className="mt-2 text-[14px]">{o.note}</p>}
      </div>

      {reponses.length === 0 ? (
        <Vide emoji="⏳" titre={t('ordo.aucuneReponse')} />
      ) : (
        <ul className="space-y-2">
          {[...dispo, ...reponses.filter((r) => r.disponibilite === 'indisponible')].map((r, i) => (
            <li key={i} className="carte p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{r.pharmacie || '—'}</h3>
                <span className={`puce ${TONS[r.disponibilite]}`}>{t('ordo.' + r.disponibilite)}</span>
                {r.demo && <span className="puce bg-soleil-100 text-soleil-700">🧪 {t('badge.demo')}</span>}
              </div>
              <p className="aide">{[r.quartier, ilYA(r.created_at, langue)].filter(Boolean).join(' · ')}</p>
              {r.prix_indicatif && <p className="mt-1 text-[14px]"><b>{t('ordo.prix')} :</b> {r.prix_indicatif}</p>}
              {r.livraison && <p className="text-[14px]">🛵 {t('ordo.livraison')}</p>}
              {r.message && <p className="mt-1 text-[14px] text-nil-900/70">{r.message}</p>}
              {r.disponibilite !== 'indisponible' && (
                r.demo ? <p className="mt-2 text-[12px] text-soleil-700">{t('demo.contact')}</p> : (
                  <div className="mt-2 flex gap-2">
                    {r.tel && <a href={lienAppel(r.tel)} className="flex-1"><Bouton taille="petit" className="w-full">{t('annuaire.appeler')}</Bouton></a>}
                    {r.whatsapp && <a href={lienWhatsApp(r.whatsapp, `[${o.code}]`)} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Bouton taille="petit" variante="succes" className="w-full">{t('annuaire.whatsapp')}</Bouton></a>}
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4"><Alerte ton="info">{t('ordo.legal')}</Alerte></div>
      <div className="mt-4 text-center"><Lien vers="/" className="lien">{t('app.nom')}</Lien></div>
    </div>
  )
}
