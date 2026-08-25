/* Detection du bas debit : on coupe la carte et les images par defaut
   quand le reseau est lent ou que l'usager a active l'economiseur de
   donnees. Il peut toujours forcer l'affichage. */
const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection

export function reseauLent() {
  if (!c) return false
  if (c.saveData) return true
  return ['slow-2g', '2g'].includes(c.effectiveType)
}

const CLE = 'ast.mode_leger'

export function modeLeger() {
  const choix = localStorage.getItem(CLE)
  if (choix === '1') return true
  if (choix === '0') return false
  return reseauLent()
}

export function definirModeLeger(actif) {
  if (actif === null) localStorage.removeItem(CLE)
  else localStorage.setItem(CLE, actif ? '1' : '0')
  appliquerModeLeger()
}

export function appliquerModeLeger() {
  document.documentElement.setAttribute('data-lite', modeLeger() ? '1' : '0')
}

export function estEnLigne() { return navigator.onLine !== false }

export function surChangementReseau(f) {
  window.addEventListener('online', f)
  window.addEventListener('offline', f)
  c?.addEventListener?.('change', f)
  return () => {
    window.removeEventListener('online', f)
    window.removeEventListener('offline', f)
    c?.removeEventListener?.('change', f)
  }
}
