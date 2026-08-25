/* Formats courts : en 2G, chaque caractere compte, et beaucoup
   d'utilisateurs lisent mal les dates completes. */
export function ilYA(iso, lang = 'fr') {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  const ar = lang === 'ar'
  if (s < 60) return ar ? 'الآن' : "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return ar ? `منذ ${m} د` : `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return ar ? `منذ ${h} س` : `il y a ${h} h`
  const j = Math.round(h / 24)
  if (j < 30) return ar ? `منذ ${j} ي` : `il y a ${j} j`
  return new Date(iso).toLocaleDateString(ar ? 'ar' : 'fr')
}

export function joursRestants(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)
}

export function dateCourte(iso, lang = 'fr') {
  if (!iso) return ''
  return new Date(iso).toLocaleString(lang === 'ar' ? 'ar' : 'fr', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function versCSV(lignes, colonnes) {
  const echappe = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const entete = colonnes.map((c) => echappe(c.titre)).join(';')
  const corps = lignes.map((l) => colonnes.map((c) => echappe(
    typeof c.valeur === 'function' ? c.valeur(l) : l[c.valeur])).join(';'))
  return '﻿' + [entete, ...corps].join('\n')
}

export function telechargerTexte(contenu, nomFichier, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenu], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomFichier
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
