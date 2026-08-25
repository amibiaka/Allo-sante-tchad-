/* Bilingue francais / arabe avec RTL complet.
   Les deux dictionnaires sont embarques : basculer de langue doit etre
   instantane, y compris hors ligne. */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import fr from '../i18n/fr.json'
import ar from '../i18n/ar.json'

const DICOS = { fr, ar }
export const LANGUES = [
  { cle: 'fr', nom: 'Français', court: 'FR', dir: 'ltr' },
  { cle: 'ar', nom: 'العربية', court: 'ع', dir: 'rtl' },
]

const CLE = 'ast.langue'
const Ctx = createContext(null)

function langueInitiale() {
  try {
    const enregistree = localStorage.getItem(CLE)
    if (enregistree && DICOS[enregistree]) return enregistree
  } catch { /* stockage indisponible */ }
  const n = (navigator.language || 'fr').toLowerCase()
  return n.startsWith('ar') ? 'ar' : 'fr'
}

function resoudre(dico, chemin) {
  return chemin.split('.').reduce((o, c) => (o == null ? undefined : o[c]), dico)
}

export function FournisseurLangue({ children }) {
  const [langue, setLangue] = useState(langueInitiale)

  const dir = langue === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const h = document.documentElement
    h.lang = langue
    h.dir = dir
    try { localStorage.setItem(CLE, langue) } catch { /* ignore */ }
  }, [langue, dir])

  const t = useCallback((chemin, vars) => {
    let v = resoudre(DICOS[langue], chemin)
    if (v === undefined) v = resoudre(DICOS.fr, chemin)
    if (v === undefined) return chemin
    if (typeof v !== 'string') return v
    if (vars) for (const [k, val] of Object.entries(vars)) v = v.replaceAll(`{${k}}`, val)
    return v
  }, [langue])

  const valeur = useMemo(() => ({
    langue, dir, t,
    changer: (l) => setLangue(DICOS[l] ? l : 'fr'),
    basculer: () => setLangue((l) => (l === 'fr' ? 'ar' : 'fr')),
    /* Nom localise d'un element geographique, avec repli sur le francais :
       beaucoup de quartiers n'ont pas de graphie arabe etablie. */
    nom: (o) => (langue === 'ar' ? (o?.ar || o?.nom_ar) : null) || o?.fr || o?.nom_fr || '',
  }), [langue, dir, t])

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>
}

export function useLangue() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLangue hors du fournisseur')
  return c
}

export function useT() { return useLangue().t }
