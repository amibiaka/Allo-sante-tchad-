/* =====================================================================
 * Allo Sante Tchad - service worker
 * Objectif : la 2e ouverture doit etre instantanee meme en 2G, et
 * l'interface doit rester consultable hors ligne.
 * Aucune donnee medicale n'est mise en cache par ce fichier : seules
 * les ressources statiques le sont. Les appels a Supabase passent
 * toujours par le reseau.
 * ===================================================================== */
const VERSION = 'ast-v1'
const COQUE = `${VERSION}-coque`
const ASSETS = `${VERSION}-assets`
const PAGES = `${VERSION}-pages`

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

  // 1. Navigation : reseau d'abord (4 s), puis cache, puis page hors ligne.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const reseau = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 4000)),
        ])
        const c = await caches.open(PAGES)
        c.put(req, reseau.clone())
        return reseau
      } catch {
        return (await caches.match(req)) ||
               (await caches.match(BASE + 'index.html')) ||
               (await caches.match(HORS_LIGNE)) ||
               new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })())
    return
  }

  // 2. Fichiers avec empreinte (/assets/) : cache d'abord, immuable.
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
