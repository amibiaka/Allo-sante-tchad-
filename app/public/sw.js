/* =====================================================================
 * Allo Sante Tchad - service worker
 * Objectif : la 2e ouverture doit etre instantanee meme en 2G, et
 * l'interface doit rester consultable hors ligne.
 * Aucune donnee medicale n'est mise en cache par ce fichier : seules
 * les ressources statiques le sont. Les appels a Supabase passent
 * toujours par le reseau.
 * ===================================================================== */
/* IMPORTANT : VERSION doit changer a chaque mise en ligne. L'ancienne
   valeur ne bougeait jamais, donc les anciens caches survivaient. Un
   index.html garde en cache designe des fichiers /assets/ qui n'existent
   plus apres un nouveau deploiement : l'application restait alors bloquee
   sur "Chargement..." sans aucun moyen de s'en sortir. */
const VERSION = 'ast-v2'
const COQUE = `${VERSION}-coque`
const ASSETS = `${VERSION}-assets`
const PAGES = `${VERSION}-pages`

/* Le reseau tchadien est lent. L'ancienne limite de 4 s renvoyait la
   page hors ligne a des gens pourtant connectes, des la 1re visite. */
const DELAI_RESEAU = 15000

const BASE = new URL(self.registration.scope).pathname
const HORS_LIGNE = BASE + 'hors-ligne.html'
const PRECACHE = [
  BASE,
  BASE + 'index.html',
  HORS_LIGNE,
  BASE + 'manifest.webmanifest',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon.svg',
]

/* Fichiers jamais servis depuis le cache : ce sont eux qui reparent
   l'application quand quelque chose s'est fige. */
const TOUJOURS_RESEAU = new Set([BASE + 'sw.js', BASE + 'secours.js'])

function avecDelai(promesse, ms) {
  return Promise.race([
    promesse,
    new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), ms)),
  ])
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(COQUE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
  /* La page peut demander un nettoyage complet quand elle n'a pas reussi
     a demarrer (voir secours.js). */
  if (e.data === 'PURGER') {
    e.waitUntil(caches.keys().then((n) => Promise.all(n.map((x) => caches.delete(x)))))
  }
})

function estAsset(url) {
  return /\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico|json)$/i.test(url.pathname)
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Jamais de cache pour les donnees (Supabase, API tierces).
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return
  if (TOUJOURS_RESEAU.has(url.pathname)) return

  // 1. Navigation : reseau d'abord, cache seulement si le reseau echoue.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      if (navigator.onLine !== false) {
        try {
          const reseau = await avecDelai(fetch(req), DELAI_RESEAU)
          if (reseau && reseau.ok) {
            const c = await caches.open(PAGES)
            c.put(req, reseau.clone())
          }
          return reseau
        } catch { /* on retombe sur le cache ci-dessous */ }
      }
      return (await caches.match(req)) ||
             (await caches.match(BASE + 'index.html')) ||
             (await caches.match(HORS_LIGNE)) ||
             new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    })())
    return
  }

  // 2. Fichiers avec empreinte (/assets/) : cache d'abord, immuable.
  //    Un 404 ici signifie que la page vient d'un cache perime : on ne le
  //    garde pas, secours.js se charge de tout remettre a plat.
  if (url.pathname.includes('/assets/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const rep = await fetch(req)
      if (rep.ok) (await caches.open(ASSETS)).put(req, rep.clone())
      return rep
    })())
    return
  }

  // 3. Autres ressources statiques : on sert le cache et on rafraichit en fond.
  if (estAsset(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(ASSETS)
      const hit = await cache.match(req)
      const reseau = fetch(req).then((rep) => {
        if (rep.ok) cache.put(req, rep.clone())
        return rep
      }).catch(() => hit)
      return hit || reseau
    })())
  }
})
