/* Archive ZIP minimale (methode « deflate »), sans dependance : un
   fichier .xlsx ou .docx n'est qu'un zip de fichiers XML. */
import { deflateRawSync } from 'node:zlib'

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function dateDos(d) {
  const temps = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { temps, date }
}

/* fichiers : [{ nom, contenu }] — contenu : chaine (UTF-8) ou Buffer. */
export function creerZip(fichiers) {
  const { temps, date } = dateDos(new Date())
  const locaux = [], centraux = []
  let offset = 0
  for (const f of fichiers) {
    const nom = Buffer.from(f.nom, 'utf8')
    const brut = Buffer.isBuffer(f.contenu) ? f.contenu : Buffer.from(f.contenu, 'utf8')
    const comp = deflateRawSync(brut, { level: 6 })
    const crc = crc32(brut)
    const entete = Buffer.alloc(30)
    entete.writeUInt32LE(0x04034b50, 0); entete.writeUInt16LE(20, 4); entete.writeUInt16LE(0x0800, 6); entete.writeUInt16LE(8, 8)
    entete.writeUInt16LE(temps, 10); entete.writeUInt16LE(date, 12); entete.writeUInt32LE(crc, 14)
    entete.writeUInt32LE(comp.length, 18); entete.writeUInt32LE(brut.length, 22); entete.writeUInt16LE(nom.length, 26); entete.writeUInt16LE(0, 28)
    locaux.push(entete, nom, comp)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10)
    central.writeUInt16LE(temps, 12); central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(brut.length, 24); central.writeUInt16LE(nom.length, 28)
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42)
    centraux.push(central, nom)
    offset += entete.length + nom.length + comp.length
  }
  const tailleCentral = centraux.reduce((a, b) => a + b.length, 0)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(0, 4); fin.writeUInt16LE(0, 6)
  fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10)
  fin.writeUInt32LE(tailleCentral, 12); fin.writeUInt32LE(offset, 16); fin.writeUInt16LE(0, 20)
  return Buffer.concat([...locaux, ...centraux, fin])
}

export const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
