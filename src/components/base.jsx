/* Briques d'interface partagees. Grosses cibles, texte court, fort
   contraste : l'ecran doit rester utilisable par quelqu'un qui panique,
   en plein soleil, sur un petit telephone. */
import { useEffect, useRef } from 'react'
import { useLangue } from '../lib/i18n'
import { retour as retourNav, naviguer, Lien } from '../lib/router'

/* ---------------------------------------------------------------- */
export function Bouton({
  variante = 'principal', taille = 'normal', className = '',
  enCours, icone, children, ...reste
}) {
  const variantes = {
    principal: 'bg-nil-600 text-white active:bg-nil-700 disabled:bg-nil-600/40',
    urgence: 'bg-urgence-500 text-white active:bg-urgence-600 disabled:bg-urgence-500/40',
    secondaire: 'bg-white text-nil-700 border-2 border-nil-200 active:bg-nil-50',
    discret: 'bg-sable-200 text-nil-700 active:bg-sable-300',
    fantome: 'bg-transparent text-nil-600 active:bg-nil-50',
    danger: 'bg-white text-urgence-600 border-2 border-urgence-100 active:bg-urgence-50',
    succes: 'bg-planifie text-white active:brightness-95',
  }
  const tailles = {
    grand: 'min-h-touch px-5 py-4 text-lg',
    normal: 'min-h-[3rem] px-4 py-3 text-base',
    petit: 'min-h-[2.25rem] px-3 py-1.5 text-sm',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold
                  transition-colors disabled:cursor-not-allowed
                  ${variantes[variante]} ${tailles[taille]} ${className}`}
      {...reste}
    >
      {enCours ? <Rotation /> : icone}
      {children}
    </button>
  )
}

export function Rotation({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/* ---------------------------------------------------------------- */
/* Chaque ecran offre toujours deux sorties : revenir a l'ecran
   precedent, et revenir a l'accueil. Sur un ecran de confirmation il n'y
   a pas de « precedent » qui ait du sens, mais le retour a l'accueil
   reste la — personne ne doit se sentir coince. */
export function Entete({ titre, sousTitre, action, sansRetour, sansAccueil }) {
  const { t } = useLangue()
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-sable-200 bg-sable-100/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        {!sansRetour && (
          <button
            onClick={retourNav}
            aria-label={t('commun.retour')}
            title={t('commun.retour')}
            className="-ms-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-sable-200"
          >
            <svg className="h-6 w-6 miroir-rtl" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {!sansAccueil && (
          <button
            onClick={() => naviguer('/')}
            aria-label={t('commun.accueil')}
            title={t('commun.accueil')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-sable-200
              ${sansRetour ? '-ms-2' : ''}`}
          >
            <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight">{titre}</h1>
          {sousTitre && <p className="truncate text-[13px] text-nil-900/60">{sousTitre}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------- */
export function Champ({ etiquette, aide, erreur, obligatoire, children, id }) {
  return (
    <div className="mb-4">
      {etiquette && (
        <label className="etiquette" htmlFor={id}>
          {etiquette}
          {obligatoire && <span className="text-urgence-500"> *</span>}
        </label>
      )}
      {children}
      {aide && !erreur && <p className="aide mt-1.5">{aide}</p>}
      {erreur && <p className="mt-1.5 text-[13px] font-semibold text-urgence-600">{erreur}</p>}
    </div>
  )
}

export function Selecteur({ options, valeur, onChange, placeholder, ...reste }) {
  return (
    <select className="champ appearance-none bg-no-repeat pe-10" value={valeur ?? ''}
            onChange={(e) => onChange(e.target.value)} {...reste}
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23083A6B\' stroke-width=\'2.5\' stroke-linecap=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")',
              backgroundPosition: document.documentElement.dir === 'rtl' ? 'left .75rem center' : 'right .75rem center',
              backgroundSize: '1.25rem',
            }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.valeur} value={o.valeur} disabled={o.desactive}>{o.libelle}</option>
      ))}
    </select>
  )
}

/* Choix a gros boutons : plus lisible qu'une liste deroulante pour les
   decisions importantes (niveau d'urgence, type de situation). */
export function ChoixCartes({ options, valeur, onChange, multiple, colonnes = 1 }) {
  const actif = (v) => (multiple ? (valeur || []).includes(v) : valeur === v)
  const basculer = (v) => {
    if (!multiple) return onChange(v)
    const l = valeur || []
    onChange(l.includes(v) ? l.filter((x) => x !== v) : [...l, v])
  }
  return (
    <div className={`grid gap-2 ${colonnes === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          onClick={() => basculer(o.valeur)}
          aria-pressed={actif(o.valeur)}
          className={`flex items-center gap-3 rounded-xl border-2 p-3 text-start transition-colors
            ${actif(o.valeur)
              ? 'border-nil-600 bg-nil-50 ring-2 ring-nil-200'
              : 'border-sable-300 bg-white'}`}
        >
          {o.emoji && <span className="text-2xl leading-none" aria-hidden="true">{o.emoji}</span>}
          {o.pastille && <span className={`h-4 w-4 shrink-0 rounded-full ${o.pastille}`} aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="block font-bold leading-tight">{o.libelle}</span>
            {o.detail && <span className="block text-[13px] text-nil-900/60">{o.detail}</span>}
          </span>
          {actif(o.valeur) && (
            <svg className="h-5 w-5 shrink-0 text-nil-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </button>
      ))}
    </div>
  )
}

export function Bascule({ actif, onChange, etiquette, aide, couleur = 'bg-planifie' }) {
  return (
    <button type="button" role="switch" aria-checked={actif} onClick={() => onChange(!actif)}
            className="flex w-full items-center gap-3 rounded-xl border-2 border-sable-300 bg-white p-3 text-start">
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${actif ? couleur : 'bg-sable-300'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all
          ${actif ? 'start-6' : 'start-1'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold leading-tight">{etiquette}</span>
        {aide && <span className="aide block">{aide}</span>}
      </span>
    </button>
  )
}

export function Case({ coche, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-sable-300 bg-white p-3">
      <input type="checkbox" checked={coche} onChange={(e) => onChange(e.target.checked)}
             className="mt-0.5 h-6 w-6 shrink-0 accent-nil-600" />
      <span className="min-w-0 flex-1 text-[15px] leading-snug">{children}</span>
    </label>
  )
}

/* ---------------------------------------------------------------- */
export function Alerte({ ton = 'info', titre, children, action }) {
  const tons = {
    info: 'bg-nil-50 border-nil-200 text-nil-900',
    attention: 'bg-soleil-100 border-soleil-300 text-soleil-700',
    danger: 'bg-urgence-50 border-urgence-100 text-urgence-800',
    succes: 'bg-green-50 border-green-200 text-green-900',
  }
  const icones = { info: 'ℹ️', attention: '⚠️', danger: '⚠️', succes: '✓' }
  return (
    <div className={`rounded-xl border-2 p-3 ${tons[ton]}`} role={ton === 'danger' ? 'alert' : undefined}>
      <div className="flex gap-2">
        <span aria-hidden="true" className="shrink-0">{icones[ton]}</span>
        <div className="min-w-0 flex-1 text-[14px] leading-snug">
          {titre && <p className="mb-0.5 font-bold">{titre}</p>}
          {children}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </div>
  )
}

export function Vide({ titre, detail, action, emoji = '🔍' }) {
  return (
    <div className="py-10 text-center">
      <div className="mb-3 text-4xl" aria-hidden="true">{emoji}</div>
      <p className="font-bold">{titre}</p>
      {detail && <p className="aide mx-auto mt-1 max-w-xs">{detail}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Chargement({ texte }) {
  const { t } = useLangue()
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-nil-900/60">
      <Rotation className="h-5 w-5" />
      <span>{texte || t('commun.chargement')}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- */
export function Modale({ ouverte, onFermer, titre, children, pied }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ouverte) return
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e) => e.key === 'Escape' && onFermer?.()
    window.addEventListener('keydown', esc)
    ref.current?.focus()
    return () => { document.body.style.overflow = avant; window.removeEventListener('keydown', esc) }
  }, [ouverte, onFermer])
  if (!ouverte) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-nil-900/50 sm:items-center"
         onClick={(e) => e.target === e.currentTarget && onFermer?.()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titre}
           className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        {titre && <h2 className="mb-3 pe-8 text-lg font-bold">{titre}</h2>}
        <button onClick={onFermer} aria-label="×"
                className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-sable-100 text-xl font-bold">×</button>
        {children}
        {pied && <div className="mt-4">{pied}</div>}
      </div>
    </div>
  )
}

export { Lien }
