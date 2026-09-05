/* Ecran d'accueil : trois decisions possibles, rien d'autre.
   Quelqu'un qui panique doit trouver le bon bouton en une seconde. */
import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { CONFIG } from '../lib/config'
import { prefs, historique } from '../lib/store'
import { detecterZone } from '../lib/geo'
import { lienWhatsApp, lienTelegram } from '../lib/links'
import { Lien, naviguer } from '../lib/router'
import { Bouton } from '../components/base'
import { SelecteurLangue, BandeauUrgence, EtatReseau, InstallerPWA, PiedDePage } from '../components/chrome'

export default function Accueil() {
  const { t } = useLangue()
  const [zone, setZone] = useState(prefs.zone())
  const [nbDemandes, setNbDemandes] = useState(0)
  const [detection, setDetection] = useState('repos')

  useEffect(() => { setNbDemandes(historique.tout().length) }, [])

  /* Detection silencieuse : uniquement si le telephone a deja accorde
     la localisation. Sinon on attend un geste — un ecran d'urgence ne
     doit pas s'ouvrir sur une demande de permission. */
  useEffect(() => {
    if (zone?.villeCode) return
    let vif = true
    detecterZone().then((r) => {
      if (vif && r.etat === 'ok') { prefs.definirZone(r.zone); setZone(r.zone) }
    }).catch(() => {})
    return () => { vif = false }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const localiser = async () => {
    setDetection('encours')
    const r = await detecterZone({ forcer: true })
    if (r.etat === 'ok') { prefs.definirZone(r.zone); setZone(r.zone); setDetection('repos') }
    else setDetection(r.etat === 'denied' ? 'refuse' : 'echec')
  }

  // Le libelle est memorise avec la zone : l'accueil n'a donc jamais
  // besoin de charger le referentiel geographique complet.
  const zoneTexte = zone?.libelle || null

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Logo officiel, au-dessus du nom plutot qu a cote : sur un
              telephone de 360 px le nom occupe deja toute la largeur, et le
              selecteur de langue tient la droite. Le SVG pese 1 Ko. */}
          <img
            src="./icons/icon.svg"
            alt=""
            width="56"
            height="56"
            className="mb-2 h-14 w-14 rounded-2xl"
          />
          <h1 className="text-2xl font-black leading-tight text-nil-700">{t('app.nom')}</h1>
          <p className="text-[15px] font-semibold text-nil-900/60" lang={t('app.sousTitre') === 'ألو صحة تشاد' ? 'ar' : 'fr'}>
            {t('app.sousTitre')}
          </p>
        </div>
        <SelecteurLangue compact />
      </div>

      <EtatReseau />

      <div className="mb-4">
        <BandeauUrgence />
      </div>

      {/* --- Les trois portes d'entree --------------------------------- */}
      <div className="space-y-3">
        <GrosBouton
          vers="/aide"
          emoji="🆘"
          titre={t('accueil.aide')}
          detail={t('accueil.aideDetail')}
          classe="bg-urgence-500 text-white"
          classeDetail="text-white/80"
        />
        <GrosBouton
          vers="/medicament"
          emoji="💊"
          titre={t('accueil.medicament')}
          detail={t('accueil.medicamentDetail')}
          classe="bg-nil-600 text-white"
          classeDetail="text-white/80"
        />
        <GrosBouton
          vers="/annuaire"
          emoji="🏥"
          titre={t('accueil.annuaire')}
          detail={t('accueil.annuaireDetail')}
          classe="bg-white text-nil-900 border-2 border-nil-200"
          classeDetail="text-nil-900/60"
        />
      </div>

      {/* --- Zone : detectee automatiquement, ou choisie a la main ------ */}
      {zoneTexte ? (
        <button
          onClick={() => naviguer('/zone')}
          className="mt-4 flex w-full items-center gap-2 rounded-xl border-2 border-sable-300 bg-white px-3 py-2.5 text-start"
        >
          <span aria-hidden="true">📍</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-nil-900/50">{t('accueil.zone')}</span>
            <span className="block truncate font-bold">{zoneTexte}</span>
          </span>
          <span className="shrink-0 text-[13px] font-bold text-nil-600 underline">{t('accueil.changerZone')}</span>
        </button>
      ) : (
        <div className="carte mt-4 p-3">
          <p className="mb-2 text-[13px] font-semibold text-nil-900/60">📍 {t('accueil.zone')}</p>
          <Bouton variante="secondaire" className="w-full" onClick={localiser}
                  enCours={detection === 'encours'}>
            {detection === 'encours' ? t('zone.detectionEnCours') : t('zone.detecterAuto')}
          </Bouton>
          {detection === 'refuse' && <p className="aide mt-2">{t('zone.detectionRefusee')}</p>}
          {detection === 'echec' && <p className="aide mt-2">{t('zone.detectionEchec')}</p>}
          <button onClick={() => naviguer('/zone')}
                  className="mt-2 w-full text-center text-[13px] font-bold text-nil-600 underline">
            {t('accueil.choisirZone')}
          </button>
        </div>
      )}

      {/* --- Suivi ------------------------------------------------------ */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Lien vers="/mes-demandes">
          <Bouton variante="discret" className="w-full">
            📋 {t('accueil.mesDemandes')}{nbDemandes ? ` (${nbDemandes})` : ''}
          </Bouton>
        </Lien>
        <Lien vers="/suivi">
          <Bouton variante="discret" className="w-full">🔎 {t('accueil.suivreCode')}</Bouton>
        </Lien>
      </div>

      {/* --- Canaux WhatsApp / Telegram --------------------------------- */}
      {(CONFIG.whatsappPlateforme || CONFIG.telegramPlateforme) && (
        <div className="carte mt-4 p-3">
          <p className="mb-2 text-[13px] font-bold text-nil-900/70">{t('lien.canal')}</p>
          <div className="flex flex-wrap gap-2">
            {CONFIG.whatsappPlateforme && (
              <a href={lienWhatsApp(CONFIG.whatsappPlateforme, 'AIDE')} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Bouton variante="succes" className="w-full" taille="petit">💬 {t('lien.aideWhatsapp')}</Bouton>
              </a>
            )}
            {CONFIG.telegramPlateforme && (
              <a href={lienTelegram(CONFIG.telegramPlateforme)} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Bouton variante="secondaire" className="w-full" taille="petit">✈️ Telegram</Bouton>
              </a>
            )}
          </div>
        </div>
      )}

      {/* --- Espace soignant -------------------------------------------- */}
      <Lien vers="/pro" className="mt-3 block">
        <div className="carte flex items-center gap-3 p-3">
          <span className="text-2xl" aria-hidden="true">🩺</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold leading-tight">{t('accueil.espacePro')}</span>
            <span className="aide block">{t('accueil.espaceProDetail')}</span>
          </span>
          <span aria-hidden="true" className="text-nil-600">›</span>
        </div>
      </Lien>

      <InstallerPWA />
      <PiedDePage />
    </div>
  )
}

function GrosBouton({ vers, emoji, titre, detail, classe, classeDetail }) {
  return (
    <Lien vers={vers} className="block">
      <div className={`flex items-center gap-4 rounded-2xl p-4 shadow-carte ${classe}`}>
        <span className="text-4xl leading-none" aria-hidden="true">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-black leading-tight">{titre}</span>
          <span className={`block text-[13px] ${classeDetail}`}>{detail}</span>
        </span>
        <span aria-hidden="true" className="text-2xl opacity-60">›</span>
      </div>
    </Lien>
  )
}
