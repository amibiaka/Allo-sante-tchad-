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

/* --- Carnet de vaccination -------------------------------------------
   Les enfants du telephone : un prenom (ou un surnom), une date de
   naissance, les doses faites. Rien d'autre, et rien ne quitte le
   telephone sans un geste explicite de la famille. */
export const carnet = {
  enfants: () => lire('carnet', []),
  ajouter(e) {
    const l = lire('carnet', [])
    const id = e.id || Math.random().toString(36).slice(2, 10)
    l.push({ id, prenom: String(e.prenom || '').trim().slice(0, 40), naissance: e.naissance, sexe: e.sexe || null, doses: {}, cree: new Date().toISOString() })
    ecrire('carnet', l); return id
  },
  modifier(id, patch) {
    ecrire('carnet', lire('carnet', []).map((e) => (e.id === id ? { ...e, ...patch } : e)))
  },
  retirer(id) { ecrire('carnet', lire('carnet', []).filter((e) => e.id !== id)) },
  marquer(id, cle, date) {
    ecrire('carnet', lire('carnet', []).map((e) => {
      if (e.id !== id) return e
      const doses = { ...(e.doses || {}) }
      if (date) doses[cle] = date; else delete doses[cle]
      return { ...e, doses }
    }))
  },
  /* Partage anonyme des doses pour la veille : null = jamais demande. */
  partage: () => lire('carnet.partage', null),
  definirPartage: (v) => ecrire('carnet.partage', v),
}
