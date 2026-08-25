/* Liens profonds : aucune API payante, tout passe par les applications
   deja installees sur le telephone. */
export const numeroPropre = (t) => String(t || '').replace(/[^\d+]/g, '').replace(/^00/, '+')

export function lienAppel(tel) {
  const n = numeroPropre(tel)
  return n ? `tel:${n}` : null
}

export function lienSms(tel, texte = '') {
  const n = numeroPropre(tel)
  if (!n) return null
  const sep = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? '&' : '?'
  return `sms:${n}${texte ? sep + 'body=' + encodeURIComponent(texte) : ''}`
}

export function lienWhatsApp(tel, texte = '') {
  const n = numeroPropre(tel).replace(/^\+/, '')
  if (!n) return null
  return `https://wa.me/${n}${texte ? '?text=' + encodeURIComponent(texte) : ''}`
}

export function lienTelegram(pseudo) {
  const p = String(pseudo || '').replace(/^@/, '').trim()
  return p ? `https://t.me/${p}` : null
}

export function lienItineraire({ lat, lng, libelle }) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  if (libelle) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(libelle)}`
  return null
}

export function lienCarte({ lat, lng, zoom = 15 }) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`
}

/* URL publique de suivi, a coller dans un message. */
export function lienSuivi(code) {
  return `${window.location.origin}${window.location.pathname}#/suivi/${code}`
}

/* Message pre-rempli envoye au soignant. Court : il transite en 2G. */
export function messageDemande({ code, niveau, categories, lieu, ville, description }, t) {
  const l = []
  l.push(`${t('lien.entete')} [${code}]`)
  l.push(`${t('lien.niveau')} : ${t('niveau.' + niveau + '.titre')}`)
  if (categories?.length) l.push(`${t('lien.cas')} : ${categories.map((c) => t('cat.' + c)).join(', ')}`)
  if (description) l.push(`${t('lien.details')} : ${description.slice(0, 200)}`)
  if (lieu) l.push(`${t('lien.lieu')} : ${lieu}${ville ? ', ' + ville : ''}`)
  l.push(t('lien.suivi') + ' : ' + lienSuivi(code))
  return l.join('\n')
}

export function messageOrdonnance({ code, ville, note }, t) {
  const l = [`${t('lien.enteteOrdo')} [${code}]`]
  if (ville) l.push(`${t('lien.lieu')} : ${ville}`)
  if (note) l.push(note.slice(0, 200))
  l.push(t('lien.suivi') + ' : ' + `${window.location.origin}${window.location.pathname}#/ordonnance/${code}`)
  return l.join('\n')
}
