import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FournisseurLangue } from './lib/i18n'
import './styles/index.css'

/* Lien d'acces (invitation, mot de passe oublie) : Supabase renvoie sur
   le site avec « #access_token=…&type=invite|recovery ». On met le
   fragment de cote avant que le routeur ne le lise, la page #/acces le
   consommera (session ouverte, choix du mot de passe). */
if (/^#access_token=|[#&]type=(invite|recovery|magiclink|signup)\b/.test(location.hash) && location.hash.includes('access_token=')) {
  try { sessionStorage.setItem('ast.lien.acces', location.hash.slice(1)) } catch { /* stockage indisponible */ }
  history.replaceState(null, '', location.pathname + '#/acces')
}

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
