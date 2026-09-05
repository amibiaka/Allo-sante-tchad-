/* =====================================================================
 * Allo Sante Tchad — fabrique les icones de l'application.
 *   node scripts/generer-icones.mjs   (lance aussi par « npm run build »)
 * Aucune dependance : le PNG est ecrit a la main, zlib est dans Node.
 * On dessine a 2048 puis on reduit, pour des bords nets sans bibliotheque.
 *
 * Le motif : les trois bandes du drapeau tchadien, un disque blanc, un
 * stethoscope. Pas de croix — l'embleme de la Croix-Rouge est protege
 * par les Conventions de Geneve et deja utilise au Tchad.
 * ===================================================================== */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/* --- Couleurs du drapeau tchadien ---------------------------------- */
const BLEU  = [0, 38, 100]     // #002664
const OR    = [254, 203, 0]    // #FECB00
const ROUGE = [198, 12, 48]    // #C60C30
const BLANC = [255, 255, 255]
const ENCRE = [4, 34, 63]      // bleu nuit de l'application, pour le trait

/* --- Toile ---------------------------------------------------------- */
const toile = (n) => ({ n, px: new Float64Array(n * n * 4) })

function poser(t, x, y, c, a) {
  if (x < 0 || y < 0 || x >= t.n || y >= t.n || a <= 0) return
  const i = (y * t.n + x) * 4, ia = 1 - a
  t.px[i] = t.px[i] * ia + c[0] * a
  t.px[i + 1] = t.px[i + 1] * ia + c[1] * a
  t.px[i + 2] = t.px[i + 2] * ia + c[2] * a
  t.px[i + 3] = t.px[i + 3] * ia + 255 * a
}

function dansCarreArrondi(x, y, n, r) {
  const dx = Math.min(x, n - 1 - x), dy = Math.min(y, n - 1 - y)
  if (dx >= r || dy >= r) return true
  const ex = r - dx, ey = r - dy
  return ex * ex + ey * ey <= r * r
}

function fondDrapeau(t, r) {
  const n = t.n, bande = n / 3
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!dansCarreArrondi(x, y, n, r)) continue
    poser(t, x, y, x < bande ? BLEU : x < 2 * bande ? OR : ROUGE, 1)
  }
}

function disque(t, cx, cy, rayon, c) {
  const x0 = Math.max(0, Math.floor(cx - rayon - 1)), x1 = Math.min(t.n - 1, Math.ceil(cx + rayon + 1))
  const y0 = Math.max(0, Math.floor(cy - rayon - 1)), y1 = Math.min(t.n - 1, Math.ceil(cy + rayon + 1))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rayon) poser(t, x, y, c, 1)
  }
}

/* Trait epais a bouts ronds : une suite de disques le long du chemin. */
function trait(t, pts, largeur, c) {
  const r = largeur / 2
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
    const pas = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)))
    for (let k = 0; k <= pas; k++) {
      const u = k / pas
      disque(t, ax + (bx - ax) * u, ay + (by - ay) * u, r, c)
    }
  }
}

/* Courbe de Bezier quadratique, echantillonnee en segments. */
function bezier(a, ctrl, b, n = 48) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u
    pts.push([
      v * v * a[0] + 2 * v * u * ctrl[0] + u * u * b[0],
      v * v * a[1] + 2 * v * u * ctrl[1] + u * u * b[1],
    ])
  }
  return pts
}

/* --- Le dessin ------------------------------------------------------ */
function dessiner(n, maskable) {
  const t = toile(n)
  const u = n / 512                       // tout est exprime en unites de 512
  fondDrapeau(t, maskable ? 0 : 113 * u)

  /* Sur la version maskable, Android recadre en cercle : on resserre le
     motif dans la zone sure. */
  const ech = maskable ? 0.76 : 1
  const cx = n / 2, cy = n / 2
  const S = (v) => v * u * ech
  const X = (v) => cx + (v - 256) * u * ech
  const Y = (v) => cy + (v - 256) * u * ech

  disque(t, cx, cy, S(156), BLANC)

  const large = S(29)
  /* Les deux tubes descendent des embouts et se rejoignent. Tout le
     motif tient dans le disque avec une marge : un pavillon qui mord sur
     les bandes se lirait comme un defaut d'impression. */
  trait(t, bezier([X(190), Y(154)], [X(180), Y(266)], [X(256), Y(296)]), large, ENCRE)
  trait(t, bezier([X(322), Y(154)], [X(332), Y(266)], [X(256), Y(296)]), large, ENCRE)
  trait(t, [[X(256), Y(292)], [X(256), Y(322)]], large, ENCRE)

  /* Embouts auriculaires. */
  disque(t, X(190), Y(152), S(20), ENCRE)
  disque(t, X(322), Y(152), S(20), ENCRE)

  /* Pavillon : un anneau, plus lisible en petit qu'un disque plein. */
  disque(t, X(256), Y(356), S(46), ENCRE)
  disque(t, X(256), Y(356), S(24), BLANC)

  return t
}

/* --- Reduction et encodage ------------------------------------------ */
/* Moyenne de la zone source correspondante. Les bornes sont calculees
   en entiers : 2048 / 192 ne tombe pas juste, et un indice fractionnaire
   dans un tableau type ne renvoie rien du tout — l'icone sortait
   transparente deux pixels sur trois. */
function reduire(t, cible) {
  const f = t.n / cible
  const out = Buffer.alloc(cible * cible * 4)
  for (let y = 0; y < cible; y++) {
    const sy0 = Math.floor(y * f)
    const sy1 = Math.max(sy0 + 1, Math.min(t.n, Math.floor((y + 1) * f)))
    for (let x = 0; x < cible; x++) {
      const sx0 = Math.floor(x * f)
      const sx1 = Math.max(sx0 + 1, Math.min(t.n, Math.floor((x + 1) * f)))
      let r = 0, g = 0, b = 0, a = 0, k = 0
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const s = (sy * t.n + sx) * 4
        r += t.px[s]; g += t.px[s + 1]; b += t.px[s + 2]; a += t.px[s + 3]; k++
      }
      const d = (y * cible + x) * 4
      out[d] = Math.round(r / k); out[d + 1] = Math.round(g / k)
      out[d + 2] = Math.round(b / k); out[d + 3] = Math.round(a / k)
    }
  }
  return out
}

const TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
const crc = (b) => { let c = -1; for (const o of b) c = TABLE[(c ^ o) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }

function morceau(type, data) {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length)
  const t = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(t))
  return Buffer.concat([l, t, c])
}

function png(rgba, n) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4)
  ihdr[8] = 8; ihdr[9] = 6                 // 8 bits par canal, RGBA
  const brut = Buffer.alloc((n * 4 + 1) * n)
  for (let y = 0; y < n; y++) {
    brut[y * (n * 4 + 1)] = 0              // filtre 0 : aucun
    rgba.copy(brut, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ])
}

const dossier = join(dirname(fileURLToPath(import.meta.url)), '../public/icons')
mkdirSync(dossier, { recursive: true })

const grand = dessiner(2048, false)
for (const taille of [512, 192, 180, 32, 16]) {
  writeFileSync(join(dossier, `icon-${taille}.png`), png(reduire(grand, taille), taille))
}
writeFileSync(join(dossier, 'icon-maskable-512.png'), png(reduire(dessiner(2048, true), 512), 512))
console.log('icones ecrites dans public/icons')
