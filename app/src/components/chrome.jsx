/* Elements permanents : bascule de langue, bandeau des numeros
   d'urgence, bandeau demo, invitation a installer la PWA. */
import { useEffect, useState } from 'react'
import { useLangue, LANGUES } from '../lib/i18n'
import { CONFIG, MODE_DEMO, CONFIG_INVALIDE } from '../lib/config'
import { db } from '../lib/db'
import { prefs } from '../lib/store'
import { lienAppel } from '../lib/links'
import { modeLeger, definirModeLeger, estEnLigne, surChangementReseau } from '../lib/net'
import { Lien, naviguer } from '../lib/router'
import { Bouton, Modale, Alerte } from './base'

/* Un liseré aux couleurs du drapeau, en haut de chaque écran. Il reste
   confiné à cette bande : plus bas, le rouge veut dire « urgence
   vitale » et le jaune « sous 24 heures ». Répandre les couleurs
   nationales dans l'interface casserait ce code de lecture. */
export function LiseréDrapeau() {
  return (
    <div aria-hidden="true" className="flex h-[5px] w-full" dir="ltr">
      <span className="flex-1" style={{ background: '#002664' }} />
      <span className="flex-1" style={{ background: '#FECB00' }} />
      <span className="flex-1" style={{ background: '#C60C30' }} />
    </div>
  )
}

export function SelecteurLangue({ compact }) {
  const { langue, changer } = useLangue()
  return (
    <div className="inline-flex overflow-hidden rounded-full border-2 border-nil-200 bg-white" role="group">
      {LANGUES.map((l) => (
        <button
          key={l.cle}
          onClick={() => changer(l.cle)}
          aria-pressed={langue === l.cle}
          lang={l.cle}
          className={`px-3 py-1.5 text-sm font-bold transition-colors
            ${langue === l.cle ? 'bg-nil-600 text-white' : 'text-nil-700'}`}
        >
          {compact ? l.court : l.nom}
          {l.essai && <sup className="ms-0.5 text-[9px] font-normal opacity-70">essai</sup>}
        </button>
      ))}
    </div>
  )
}

/* Une traduction non relue ne doit jamais passer pour definitive, surtout
   dans une application ou l'on decrit une urgence medicale. Le bandeau le
   dit dans la langue concernee et en francais, et il ne se ferme pas. */
export function BandeauLangueEssai() {
  const { essai } = useLangue()
  if (!essai) return null
  return (
    <div role="note"
         className="w-full bg-soleil-300 px-3 py-1.5 text-center text-[12px] font-bold text-soleil-700">
      ⚠ Tarjama tajriba, lissa ma itraaja'at · Traduction d’essai, non encore relue
    </div>
  )
}

/* Bandeau permanent : les numeros non confirmes sont explicitement
   signales — afficher un mauvais numero d'urgence est pire que rien. */
export function BandeauUrgence({ compact }) {
  const { t, langue } = useLangue()
  const [numeros, setNumeros] = useState([])
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    const zone = prefs.zone()
    db.numerosUrgence({ villeCode: zone?.villeCode }).then(setNumeros).catch(() => {})
  }, [])

  const verifies = numeros.filter((n) => n.verifie && n.tel)
  const autres = numeros.filter((n) => !n.verifie && n.tel)
  const libelle = (n) => (langue === 'ar' ? n.libelle_ar || n.libelle_fr : n.libelle_fr)

  if (!numeros.length) return null

  return (
    <>
      <button
        onClick={() => setOuvert(true)}
        className="flex w-full items-center gap-2 rounded-xl border-2 border-urgence-100 bg-urgence-50 px-3 py-2 text-start"
      >
        <span className="text-lg" aria-hidden="true">🆘</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-urgence-800">{t('urgence.titre')}</span>
          <span className="block truncate text-[12px] text-urgence-600">
            {verifies.slice(0, 2).map(libelle).join(' · ') || t('urgence.aConfirmer')}
          </span>
        </span>
        <span className="text-urgence-600" aria-hidden="true">›</span>
      </button>

      <Modale ouverte={ouvert} onFermer={() => setOuvert(false)} titre={t('urgence.titre')}>
        {verifies.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-bold text-green-800">✔ {t('urgence.verifies')}</h3>
            <ul className="mb-4 space-y-2">
              {verifies.map((n) => <LigneNumero key={n.id} n={n} libelle={libelle(n)} t={t} />)}
            </ul>
          </>
        )}
        {autres.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-bold text-soleil-700">⚠️ {t('urgence.aConfirmer')}</h3>
            <Alerte ton="attention"><p className="text-[13px]">{t('urgence.avertissement')}</p></Alerte>
            <ul className="mt-2 space-y-2">
              {autres.map((n) => <LigneNumero key={n.id} n={n} libelle={libelle(n)} t={t} />)}
            </ul>
          </>
        )}
        <p className="aide mt-4">{t('urgence.rappel')}</p>
      </Modale>
    </>
  )
}

function LigneNumero({ n, libelle, t }) {
  // Nom au-dessus, numero en pleine largeur en dessous : sur 360 px un
  // nom d'hopital ne doit pas etre tronque, et le bouton d'appel doit
  // rester une grande cible tactile.
  return (
    <li className="rounded-xl border border-sable-200 p-2">
      <p className="text-[14px] font-bold leading-tight">{libelle}</p>
      <p className="mb-1.5 text-[12px] text-nil-900/55">
        {n.h24 && t('urgence.h24')}{n.h24 && n.national ? ' · ' : ''}{n.national && t('urgence.national')}
      </p>
      <a href={lienAppel(n.tel)} className="block">
        <Bouton className="w-full" variante={n.verifie ? 'principal' : 'secondaire'}>
          <span className="nombres-latins" dir="ltr">📞 {n.tel}</span>
        </Bouton>
      </a>
      {n.tel2 && (
        <a href={lienAppel(n.tel2)} className="mt-1.5 block">
          <Bouton taille="petit" variante="secondaire" className="w-full">
            <span className="nombres-latins" dir="ltr">{n.tel2}</span>
          </Bouton>
        </a>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ */
export function BandeauDemo() {
  const { t, langue } = useLangue()
  const [ouvert, setOuvert] = useState(false)
  if (!MODE_DEMO) return null
  /* Cas particulier : des variables Supabase existent mais ne sont pas
     valables (gabarit non remplace, adresse mal recopiee). Sans ce
     bandeau, l'exploitant croit etre en production alors que tout est
     local. On le dit en clair, en rouge, avant le bandeau demo. */
  const alerteConfig = CONFIG_INVALIDE && (
    <div role="alert"
         className="w-full bg-vital px-3 py-1.5 text-center text-[12px] font-bold text-white">
      {langue === 'ar'
        ? '⚠ إعدادات Supabase غير صالحة — التطبيق يعمل محليًا فقط.'
        : '⚠ Variables Supabase invalides — l’application tourne en local.'}
    </div>
  )
  return (
    <>
      {alerteConfig}
      <button onClick={() => setOuvert(true)}
              className="w-full bg-soleil-300 px-3 py-1.5 text-center text-[12px] font-bold text-soleil-700">
        🧪 {t('demo.banniere')}
      </button>
      <Modale ouverte={ouvert} onFermer={() => setOuvert(false)} titre={t('demo.banniere')}>
        <p className="text-[15px]">{t('demo.detail')}</p>
        <h3 className="mt-4 mb-2 font-bold">{t('demo.comptes')}</h3>
        <ul className="space-y-1 text-[14px]">
          <li className="nombres-latins"><b>{t('demo.compteAdmin')}</b> : 66000000 / demo1234</li>
          <li className="nombres-latins"><b>{t('demo.comptePro')}</b> : 66000001 / demo1234</li>
          <li className="nombres-latins"><b>{t('demo.comptePharmacie')}</b> : 66000003 / demo1234</li>
        </ul>
        <Bouton className="mt-4 w-full" variante="secondaire"
                onClick={() => { setOuvert(false); naviguer('/' + CONFIG.cheminAdmin) }}>
          {t('admin.titre')}
        </Bouton>
      </Modale>
    </>
  )
}

/* ------------------------------------------------------------------ */
export function EtatReseau() {
  const { t } = useLangue()
  const [enLigne, setEnLigne] = useState(estEnLigne())
  const [leger, setLeger] = useState(modeLeger())
  useEffect(() => surChangementReseau(() => setEnLigne(estEnLigne())), [])
  if (enLigne && !leger) return null
  return (
    <div className="mb-3 space-y-2">
      {!enLigne && <Alerte ton="attention" titre={t('commun.horsLigne')}>{t('commun.horsLigneDetail')}</Alerte>}
      {leger && (
        <button onClick={() => { definirModeLeger(false); setLeger(false) }}
                className="w-full rounded-xl bg-sable-200 px-3 py-2 text-start text-[12px] text-nil-900/70">
          📉 {t('commun.modeLeger')} — <span className="underline">{t('commun.afficherQuandMeme')}</span>
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Beaucoup d'utilisateurs reviennent en cherchant le lien WhatsApp
   d'origine. On leur propose donc d'installer, mais pas a la premiere
   seconde de la premiere visite : une invitation qui arrive avant qu'on
   ait compris a quoi sert l'application se ferme sans etre lue. Elle
   apparait a la deuxieme ouverture, ou apres une minute sur place. */
const CLE_INSTALL = 'ast.install'
const estInstallee = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}
const estIOS = () => {
  try {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
  } catch { return false }
}

export function PropositionInstallation() {
  const { t } = useLangue()
  const [evt, setEvt] = useState(null)
  const [visible, setVisible] = useState(false)
  const ios = estIOS()

  useEffect(() => {
    if (estInstallee()) return
    let etat = {}
    try { etat = JSON.parse(localStorage.getItem(CLE_INSTALL) || '{}') } catch { /* stockage refuse */ }
    if (etat.refuse || etat.faite) return

    const visites = (etat.visites || 0) + 1
    try { localStorage.setItem(CLE_INSTALL, JSON.stringify({ ...etat, visites })) } catch { /* ignore */ }

    const h = (e) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', h)

    /* iOS ne fournit aucun evenement d'installation : on montre la marche
       a suivre, sinon ces utilisateurs ne l'apprennent jamais. */
    const delai = visites >= 2 ? 6000 : 60000
    const m = setTimeout(() => setVisible(true), delai)
    return () => { window.removeEventListener('beforeinstallprompt', h); clearTimeout(m) }
  }, [])

  const fermer = (definitif) => {
    setVisible(false)
    if (!definitif) return
    try {
      const etat = JSON.parse(localStorage.getItem(CLE_INSTALL) || '{}')
      localStorage.setItem(CLE_INSTALL, JSON.stringify({ ...etat, refuse: true }))
    } catch { /* ignore */ }
  }

  if (!visible || (!evt && !ios)) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3" role="dialog"
         aria-label={t('pwa.proposerTitre')}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border-2 border-nil-200 bg-white shadow-xl">
        <LiseréDrapeau />
        <div className="flex items-start gap-3 p-4">
          <img src="./icons/icon-192.png" alt="" width="52" height="52"
               className="h-[52px] w-[52px] shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug">{t('pwa.proposerTitre')}</p>
            <p className="aide mt-1">{ios ? t('pwa.iosAide') : t('pwa.proposerTexte')}</p>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <Bouton variante="secondaire" className="flex-1" taille="petit"
                  onClick={() => fermer(true)}>{t('pwa.plusTard')}</Bouton>
          {evt && (
            <Bouton className="flex-1" taille="petit"
                    onClick={async () => {
                      evt.prompt()
                      const r = await evt.userChoice.catch(() => null)
                      if (r && r.outcome === 'accepted') {
                        try {
                          const etat = JSON.parse(localStorage.getItem(CLE_INSTALL) || '{}')
                          localStorage.setItem(CLE_INSTALL, JSON.stringify({ ...etat, faite: true }))
                        } catch { /* ignore */ }
                      }
                      setEvt(null); setVisible(false)
                    }}>
              {t('pwa.installer')}
            </Bouton>
          )}
          {ios && !evt && (
            <Bouton className="flex-1" taille="petit" onClick={() => fermer(true)}>
              {t('commun.confirmer')}
            </Bouton>
          )}
        </div>
      </div>
    </div>
  )
}

export function InstallerPWA() {
  const { t } = useLangue()
  const [evt, setEvt] = useState(null)
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (!evt) return null
  return (
    <div className="carte si-donnees mt-4 p-3">
      <p className="font-bold">{t('pwa.installer')}</p>
      <p className="aide mt-0.5">{t('pwa.installerAide')}</p>
      <Bouton className="mt-2 w-full" variante="secondaire"
              onClick={async () => { evt.prompt(); await evt.userChoice; setEvt(null) }}>
        {t('pwa.installer')}
      </Bouton>
    </div>
  )
}

export function PiedDePage() {
  const { t } = useLangue()
  return (
    <footer className="sans-impression mt-8 space-y-2 border-t border-sable-200 pt-4 text-center">
      <p className="text-[12px] font-semibold text-urgence-600">{t('legal.avertissement')}</p>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px]">
        <Lien vers="/a-propos" className="lien">{t('legal.titre')}</Lien>
        {CONFIG.transparenceActive && <Lien vers="/transparence" className="lien">{t('transparence.titre')}</Lien>}
        <Lien vers="/pro" className="lien">{t('pro.titre')}</Lien>
      </div>
      <p className="text-[11px] text-nil-900/40">{CONFIG.nomApp} · {t('app.gratuit')}</p>
    </footer>
  )
}

/* Bouton de sortie compact : sur un ecran de 360 px, un libelle complet
   ecrase le titre de la page. */
export function BoutonSortie({ onClick }) {
  const { t } = useLangue()
  return (
    <button onClick={onClick} aria-label={t('pro.deconnexion')} title={t('pro.deconnexion')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-sable-300 bg-white active:bg-sable-200">
      <svg className="h-5 w-5 text-nil-700 miroir-rtl" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  )
}
