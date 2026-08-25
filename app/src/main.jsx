import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FournisseurLangue } from './lib/i18n'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FournisseurLangue>
      <App />
    </FournisseurLangue>
  </StrictMode>
)

/* Service worker : la 2e ouverture doit etre immediate meme en 2G.
   Volontairement silencieux — un echec ne doit jamais empecher
   l'application de fonctionner. */
/* La presence du manifeste distingue un vrai deploiement d'une version
   « fichier unique » (demo hors ligne, page hebergee), ou sw.js n'existe
   pas : sans ce test, la console affichait une erreur 404 a chaque
   ouverture. */
if ('serviceWorker' in navigator
    && location.protocol.startsWith('http')
    && document.querySelector('link[rel="manifest"]')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(
      new URL('sw.js', document.baseURI).pathname,
      { scope: './' }
    ).catch(() => {})
  })
}
