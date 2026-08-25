/* Fabrique dist-demo/allo-sante-demo.html : l'application entiere dans
   UN SEUL fichier HTML, utilisable sans serveur et sans reseau — pour
   montrer la plateforme sur le terrain, l'envoyer par WhatsApp ou la
   copier sur une cle USB. Le mode demonstration ne sort jamais du
   telephone.
      npm run build:demo
*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TMP = 'dist-demo-tmp'
const SORTIE = 'dist-demo'

if (!existsSync(join(TMP, 'index.html'))) {
  console.error('Lancez `npm run build:demo` (et non `node scripts/build-singlefile.mjs` seul).')
  process.exit(1)
}

const js = readFileSync(join(TMP, 'app.js'), 'utf8')
const css = existsSync(join(TMP, 'app.css')) ? readFileSync(join(TMP, 'app.css'), 'utf8') : ''

let html = readFileSync(join(TMP, 'index.html'), 'utf8')
html = html
  .replace(/<link[^>]*rel="stylesheet"[^>]*>\s*/g, '')
  .replace(/<link[^>]*rel="manifest"[^>]*>\s*/g, '')
  .replace(/<link[^>]*rel="(icon|apple-touch-icon)"[^>]*>\s*/g, '')
  .replace(/<script[^>]*src="[^"]*app\.js"[^>]*><\/script>\s*/g, '')
  .replace('</head>', `<style>\n${css}\n</style>\n</head>`)
  .replace('</body>', `<script type="module">\n${js}\n</script>\n</body>`)

mkdirSync(SORTIE, { recursive: true })
const chemin = join(SORTIE, 'allo-sante-demo.html')
writeFileSync(chemin, html)
rmSync(TMP, { recursive: true, force: true })

console.log(`${chemin} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} Ko`)
console.log('Un seul fichier : ouvrez-le dans un navigateur, sans serveur ni connexion.')
