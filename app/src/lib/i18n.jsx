/* Quatre langues, dont l'arabe avec RTL complet. Les dictionnaires sont
   embarques : basculer de langue doit etre instantane, y compris hors
   ligne. L'arabe tchadien en lettres latines ne couvre que les ecrans
   patients ; le reste retombe sur le francais, plutot que d'inventer du
   vocabulaire administratif dans une langue sans orthographe fixee. */
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import fr from '../i18n/fr.json'
import en from '../i18n/en.json'
import ar from '../i18n/ar.json'
import arTd from '../i18n/ar-td.json'

const DICOS = { fr, en, ar, 'ar-td': arTd }
export const LANGUES = [
  { cle: 'fr', nom: 'Français', court: 'FR', dir: 'ltr', balise: 'fr' },
  { cle: 'en', nom: 'English', court: 'EN', dir: 'ltr', balise: 'en' },
  { cle: 'ar', nom: 'العربية', court: 'ع', dir: 'rtl', balise: 'ar' },
  /* Ecrit en lettres latines : la balise le dit, sinon un lecteur d'ecran
     ou une traduction automatique le prend pour de l'arabe ecrit en arabe. */
  { cle: 'ar-td', nom: 'Arabi Tchadi', court: 'TD', dir: 'ltr', balise: 'ar-Latn-TD', essai: true },
]
const PARCLE = Object.fromEntries(LANGUES.map((l) => [l.cle, l]))

const CLE = 'ast.langue'
const Ctx = createContext(null)

function langueInitiale() {
  try {
    const enregistree = localStorage.getItem(CLE)
    if (enregistree && DICOS[enregistree]) return enregistree
  } catch { /* stockage indisponible */ }
  /* L'arabe tchadien n'est jamais choisi tout seul : c'est une graphie
     sans norme, on la propose, on ne l'impose pas. */
  const n = (navigator.language || 'fr').toLowerCase()
  if (n.startsWith('ar')) return 'ar'
  if (n.startsWith('en')) return 'en'
  return 'fr'
}

function resoudre(dico, chemin) {
  return chemin.split('.').reduce((o, c) => (o == null ? undefined : o[c]), dico)
}

export function FournisseurLangue({ children }) {
  const [langue, setLangue] = useState(langueInitiale)

  const dir = PARCLE[langue]?.dir || 'ltr'

  useEffect(() => {
    const h = document.documentElement
    h.lang = PARCLE[langue]?.balise || langue
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
    essai: Boolean(PARCLE[langue]?.essai),
    changer: (l) => setLangue(DICOS[l] ? l : 'fr'),
    basculer: () => setLangue((l) => {
      const i = LANGUES.findIndex((x) => x.cle === l)
      return LANGUES[(i + 1) % LANGUES.length].cle
    }),
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
