/* Verifie que la page d'accueil reste sous la limite de poids fixee.
   Objectif : < 100 Ko transferes (gzip) pour la premiere visite en 2G.
      npm run build && npm run check:size
*/
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const LIMITE_KO = 100
const DIST = 'dist'

let total = 0
const lignes = []

function ajouter(chemin, nom) {
  const brut = readFileSync(chemin)
  const gz = gzipSync(brut, { level: 9 }).length
  total += gz
  lignes.push([nom, brut.length, gz])
}

try {
  const assets = readdirSync(join(DIST, 'assets'))
  // Chargement initial : l'entree, le socle React et la feuille de style.
  // Les pages sont chargees a la demande et ne comptent pas.
  const index = readFileSync(join(DIST, 'index.html'), 'utf8')
  const references = [...index.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+)"/g)].map((m) => m[1])
  ajouter(join(DIST, 'index.html'), 'index.html')
  for (const f of references) ajouter(join(DIST, 'assets', f), f)
  // Les modules importes statiquement par l'entree comptent aussi.
  for (const f of references.filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(DIST, 'assets', f), 'utf8')
    for (const m of src.matchAll(/from"\.\/([^"]+\.js)"/g)) {
      if (assets.includes(m[1]) && !lignes.some((l) => l[0] === m[1])) {
        ajouter(join(DIST, 'assets', m[1]), m[1])
      }
    }
  }
} catch (e) {
  console.error('Lancez d\'abord `npm run build`. (' + e.message + ')')
  process.exit(1)
}

const ko = (o) => (o / 1024).toFixed(1).padStart(7) + ' Ko'
console.log('\nPoids de la premiere visite (gzip) :\n')
for (const [n, brut, gz] of lignes.sort((a, b) => b[2] - a[2])) {
  console.log(`  ${ko(gz)}  (brut ${ko(brut)})  ${n}`)
}
console.log(`  ${'-'.repeat(46)}`)
console.log(`  ${ko(total)}  TOTAL — limite ${LIMITE_KO} Ko\n`)

if (total / 1024 > LIMITE_KO) {
  console.error(`DEPASSEMENT de ${((total / 1024) - LIMITE_KO).toFixed(1)} Ko.`)
  console.error('Pistes : basculer sur Preact (voir vite.config.js), ou deplacer du code vers un import dynamique.')
  process.exit(1)
}
console.log('OK : la page d\'accueil tient dans le budget bas debit.')
