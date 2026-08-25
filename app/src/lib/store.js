/* Petites preferences locales : langue, zone choisie, historique des
   demandes du telephone. Rien de medical n'est conserve en clair
   au-dela du code de suivi. */
const P = 'ast.'

function lire(cle, defaut) {
  try { const v = localStorage.getItem(P + cle); return v ? JSON.parse(v) : defaut }
  catch { return defaut }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(P + cle, JSON.stringify(valeur)) } catch { /* quota plein */ }
}
function effacer(cle) { try { localStorage.removeItem(P + cle) } catch { /* ignore */ } }

export const prefs = {
  zone: () => lire('zone', null),
  definirZone: (z) => ecrire('zone', z),
  contact: () => lire('contact', null),
  definirContact: (c) => ecrire('contact', c),
}

const MAX_HISTORIQUE = 25

export const historique = {
  tout: () => lire('historique', []),
  ajouter(entree) {
    const l = lire('historique', []).filter((e) => e.code !== entree.code)
    l.unshift({ ...entree, le: new Date().toISOString() })
    ecrire('historique', l.slice(0, MAX_HISTORIQUE))
  },
  retirer(code) {
    ecrire('historique', lire('historique', []).filter((e) => e.code !== code))
  },
  vider: () => effacer('historique'),
}

export { lire, ecrire, effacer }
