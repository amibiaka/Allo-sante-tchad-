/* Routeur minimaliste base sur le fragment (#/...).
   Choix volontaire : aucune configuration serveur, aucune dependance,
   et les liens partages sur WhatsApp fonctionnent partout — y compris
   depuis un fichier ouvert hors ligne. */
import { useSyncExternalStore, useCallback } from 'react'

const lire = () => {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/' + h
}
const abonnes = new Set()
const notifier = () => abonnes.forEach((f) => f())
window.addEventListener('hashchange', notifier)

export function useRoute() {
  const chemin = useSyncExternalStore(
    (f) => { abonnes.add(f); return () => abonnes.delete(f) },
    lire, () => '/'
  )
  const [base, requete] = chemin.split('?')
  return { chemin: base || '/', params: new URLSearchParams(requete || '') }
}

export function naviguer(vers, { remplacer = false } = {}) {
  const cible = '#' + (vers.startsWith('/') ? vers : '/' + vers)
  if (remplacer) window.location.replace(cible)
  else window.location.hash = cible
  window.scrollTo(0, 0)
}

export function retour() {
  if (window.history.length > 1) window.history.back()
  else naviguer('/')
}

export function Lien({ vers, children, className = '', remplacer, onClick, ...reste }) {
  const clic = useCallback((e) => {
    // On laisse le navigateur faire son travail pour ctrl/cmd-clic
    // (ouverture dans un nouvel onglet) et le clic du milieu.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    // Le gestionnaire externe passe en premier : s'il annule, on n'ouvre rien.
    onClick?.(e)
    if (e.defaultPrevented) return
    e.preventDefault()
    naviguer(vers, { remplacer })
  }, [vers, remplacer, onClick])
  return (
    <a href={'#' + (vers.startsWith('/') ? vers : '/' + vers)} onClick={clic} className={className} {...reste}>
      {children}
    </a>
  )
}

/* Compare un chemin a un motif du type "/suivi/:code". */
export function correspond(motif, chemin) {
  const m = motif.split('/').filter(Boolean)
  const c = chemin.split('/').filter(Boolean)
  if (m.length !== c.length) return null
  const params = {}
  for (let i = 0; i < m.length; i++) {
    if (m[i].startsWith(':')) params[m[i].slice(1)] = decodeURIComponent(c[i])
    else if (m[i].toLowerCase() !== c[i].toLowerCase()) return null
  }
  return params
}
