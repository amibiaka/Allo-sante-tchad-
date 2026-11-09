/* Compression cote client : une ordonnance photographiee avec un
   telephone d'entree de gamme fait 2 a 5 Mo. En 2G c'est inenvoyable.
   On vise ~100 Ko en gardant le texte lisible. */

const CIBLE_KO = 100
const DIM_MAX = 1400      // largeur/hauteur max : suffisant pour lire une ordonnance
const DIM_MIN = 700       // en dessous, le texte devient illisible : on arrete

function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')) }
    img.src = url
  })
}

function dessiner(img, dimMax) {
  const r = Math.min(1, dimMax / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * r)
  c.height = Math.round(img.height * r)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c
}

const versBlob = (canvas, type, q) =>
  new Promise((r) => canvas.toBlob((b) => r(b), type, q))

export async function compresserImage(fichier, { cibleKo = CIBLE_KO } = {}) {
  if (!fichier || !fichier.type?.startsWith('image/')) throw new Error('fichier non image')
  const img = await chargerImage(fichier)
  const type = 'image/jpeg'
  let dim = DIM_MAX
  let meilleur = null

  while (dim >= DIM_MIN) {
    const canvas = dessiner(img, dim)
    for (const q of [0.72, 0.6, 0.5, 0.42, 0.35]) {
      const blob = await versBlob(canvas, type, q)
      if (!blob) continue
      meilleur = blob
      if (blob.size <= cibleKo * 1024) {
        return { blob, taille: blob.size, largeur: canvas.width, hauteur: canvas.height }
      }
    }
    dim = Math.round(dim * 0.75)
  }
  return { blob: meilleur, taille: meilleur?.size || 0, largeur: 0, hauteur: 0 }
}

/* ------------------------------------------------------------------ */
/* Enregistrement vocal : indispensable pour les personnes qui ne
   lisent pas. Debit tres bas (12 kbit/s) et 60 secondes maximum.      */
/* ------------------------------------------------------------------ */
export const DUREE_MAX = 60

export function vocalDisponible() {
  return typeof MediaRecorder !== 'undefined' &&
         !!navigator.mediaDevices?.getUserMedia
}

function meilleurFormat() {
  const candidats = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  for (const c of candidats) {
    if (MediaRecorder.isTypeSupported?.(c)) return c
  }
  return ''
}

export class EnregistreurVocal {
  constructor({ surDuree, surFin, surErreur } = {}) {
    this.surDuree = surDuree
    this.surFin = surFin
    this.surErreur = surErreur
    this.morceaux = []
    this.debut = 0
  }

  async demarrer() {
    this.flux = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    })
    const mimeType = meilleurFormat()
    this.rec = new MediaRecorder(this.flux, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 12000,
    })
    this.morceaux = []
    this.rec.ondataavailable = (e) => { if (e.data?.size) this.morceaux.push(e.data) }
    this.rec.onerror = (e) => this.surErreur?.(e.error || new Error('enregistrement interrompu'))
    this.rec.onstop = () => {
      const blob = new Blob(this.morceaux, { type: this.rec.mimeType || 'audio/webm' })
      this.flux.getTracks().forEach((p) => p.stop())
      clearInterval(this.minuteur)
      this.surFin?.({ blob, duree: Math.round((Date.now() - this.debut) / 1000) })
    }
    this.debut = Date.now()
    this.rec.start(1000)
    this.minuteur = setInterval(() => {
      const s = Math.round((Date.now() - this.debut) / 1000)
      this.surDuree?.(s)
      if (s >= DUREE_MAX) this.arreter()
    }, 500)
  }

  arreter() {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop()
  }

  annuler() {
    this.surFin = null
    this.arreter()
    this.flux?.getTracks().forEach((p) => p.stop())
    clearInterval(this.minuteur)
  }
}

export function extension(blob) {
  const t = blob?.type || ''
  if (t.includes('mp4')) return 'm4a'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('mpeg')) return 'mp3'
  if (t.includes('jpeg')) return 'jpg'
  if (t.includes('png')) return 'png'
  return 'webm'
}

export const poidsLisible = (o) =>
  o < 1024 ? `${o} o` : o < 1024 * 1024 ? `${Math.round(o / 1024)} Ko` : `${(o / 1048576).toFixed(1)} Mo`
