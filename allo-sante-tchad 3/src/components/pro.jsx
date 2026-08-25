/* Fiches soignant : badges de confiance, boutons de contact.
   Regle : on n'ouvre jamais un appel vers un numero fictif ou absent. */
import { useState } from 'react'
import { useLangue } from '../lib/i18n'
import { typePro } from '../lib/config'
import { lienAppel, lienWhatsApp, lienSms, lienItineraire } from '../lib/links'
import { joursRestants } from '../lib/format'
import { Bouton, Modale, Alerte } from './base'

export function BadgePro({ pro, court }) {
  const { t } = useLangue()
  if (pro.demo) {
    return <span className="puce bg-soleil-100 text-soleil-700" title={t('badge.demoAide')}>🧪 {t('badge.demo')}</span>
  }
  if (pro.service_officiel) {
    return <span className="puce bg-nil-100 text-nil-700">🛡️ {t('badge.officiel')}</span>
  }
  if (pro.statut === 'verifie') {
    return <span className="puce bg-green-100 text-green-800" title={t('badge.verifieAide')}>✔ {t('badge.verifie')}</span>
  }
  if (pro.statut === 'provisoire') {
    const j = joursRestants(pro.probation_fin)
    return (
      <span className="puce bg-soleil-100 text-soleil-700"
            title={t('badge.provisoireAide', { j: j ?? '—' })}>
        ⏳ {court ? t('badge.provisoireCourt') : t('badge.provisoire')}
        {j != null && j >= 0 ? ` · J-${j}` : ''}
      </span>
    )
  }
  if (pro.statut === 'expire') {
    return <span className="puce bg-sable-200 text-nil-900/70">⌛ {t('badge.expire')}</span>
  }
  return null
}

export function PastilleDispo({ enLigne }) {
  const { t } = useLangue()
  return (
    <span className={`puce ${enLigne ? 'bg-green-100 text-green-800' : 'bg-sable-200 text-nil-900/60'}`}>
      <span className={`h-2 w-2 rounded-full ${enLigne ? 'bg-planifie' : 'bg-nil-900/30'}`} aria-hidden="true" />
      {enLigne ? t('annuaire.enLigne') : t('annuaire.horsLigne')}
    </span>
  )
}

/* Boutons Appeler / WhatsApp / SMS / Itineraire ---------------------- */
export function BoutonsContact({ pro, message, compact, surSignaler }) {
  const { t } = useLangue()
  const [modale, setModale] = useState(null)
  const tel = pro.telephone
  const wa = pro.whatsapp || pro.telephone

  const proteger = (e, action) => {
    if (pro.demo) { e.preventDefault(); setModale('demo'); return }
    if (!tel) { e.preventDefault(); setModale('manquant'); return }
    action?.()
  }

  const taille = compact ? 'petit' : 'normal'
  const indisponible = pro.demo || !tel

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <a href={indisponible ? '#' : lienAppel(tel)} onClick={(e) => proteger(e)} className="flex-1">
          <Bouton variante="principal" taille={taille} className="w-full"
                  icone={<Icone nom="tel" />}>{t('annuaire.appeler')}</Bouton>
        </a>
        {wa && (
          <a href={pro.demo ? '#' : (lienWhatsApp(wa, message) || '#')}
             onClick={(e) => proteger(e)}
             target="_blank" rel="noopener noreferrer" className="flex-1">
            <Bouton variante="succes" taille={taille} className="w-full"
                    icone={<Icone nom="whatsapp" />}>{t('annuaire.whatsapp')}</Bouton>
          </a>
        )}
        {!compact && tel && (
          <a href={pro.demo ? '#' : (lienSms(tel, message) || '#')} onClick={(e) => proteger(e)}>
            <Bouton variante="secondaire" taille={taille} icone={<Icone nom="sms" />}>{t('annuaire.sms')}</Bouton>
          </a>
        )}
        {!compact && (pro.lat != null || pro.adresse_texte) && (
          <a href={lienItineraire({ lat: pro.lat, lng: pro.lng, libelle: pro.adresse_texte || pro.nom })}
             target="_blank" rel="noopener noreferrer">
            <Bouton variante="secondaire" taille={taille} icone={<Icone nom="carte" />}>{t('annuaire.itineraire')}</Bouton>
          </a>
        )}
      </div>

      {!compact && surSignaler && (
        <button onClick={surSignaler} className="mt-2 text-[12px] text-nil-900/40 underline">
          {t('annuaire.signaler')}
        </button>
      )}

      <Modale ouverte={!!modale} onFermer={() => setModale(null)}
              titre={modale === 'demo' ? t('badge.demo') : t('annuaire.numeroManquant')}>
        <Alerte ton="attention">
          {modale === 'demo' ? t('demo.contact') : t('annuaire.numeroManquantAide')}
        </Alerte>
        <Bouton className="mt-4 w-full" onClick={() => setModale(null)}>{t('commun.fermer')}</Bouton>
      </Modale>
    </>
  )
}

export function FichePro({ pro, message, distance, surSignaler }) {
  const { t, nom } = useLangue()
  const T = typePro(pro.type)
  return (
    <article className="carte p-3">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sable-100 text-2xl"
              aria-hidden="true">{T.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-bold leading-tight">{pro.nom}</h3>
            <PastilleDispo enLigne={pro.en_ligne} />
          </div>
          {pro.specialite && <p className="text-[14px] text-nil-900/70">{pro.specialite}</p>}
          <p className="mt-0.5 text-[13px] text-nil-900/55">
            {[pro.quartier_nom, pro.ville_nom].filter(Boolean).join(' · ')}
            {distance != null && ' · ' + t('annuaire.distance', { km: distance.toFixed(distance < 10 ? 1 : 0) })}
          </p>
          {pro.horaires && <p className="text-[13px] text-nil-900/55">🕒 {pro.horaires}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <BadgePro pro={pro} court />
            {pro.service_officiel && !pro.telephone && (
              <span className="puce bg-urgence-50 text-urgence-600">☎ {t('annuaire.numeroManquant')}</span>
            )}
            {pro.telephone && pro.numero_confirme === false && (
              <span className="puce bg-soleil-100 text-soleil-700">☎ {t('annuaire.numeroAConfirmer')}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <BoutonsContact pro={pro} message={message} surSignaler={surSignaler} />
      </div>
    </article>
  )
}

export function Icone({ nom, className = 'h-5 w-5' }) {
  const chemins = {
    tel: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    sms: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    carte: 'M9 20l-6-3V4l6 3m0 13l6-3m-6 3V7m6 10l6 3V7l-6-3m0 13V4',
    whatsapp: 'M20.5 3.5A11 11 0 0 0 3.2 17L2 22l5.2-1.2A11 11 0 1 0 20.5 3.5zM12 20a8 8 0 0 1-4-1.1l-.3-.2-3 .7.7-2.9-.2-.3A8 8 0 1 1 12 20z',
    plus: 'M12 5v14M5 12h14',
    micro: 'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 19v3',
    appareil: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z',
    gps: 'M12 2v3m0 14v3M2 12h3m14 0h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={chemins[nom] || ''} />
      {nom === 'appareil' && <circle cx="12" cy="13" r="4" />}
    </svg>
  )
}
