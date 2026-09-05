/* =====================================================================
 * BACK-OFFICE
 * Invisible pour le public : aucun lien n'y mene depuis l'interface,
 * le chemin est configurable (VITE_ADMIN_PATH) et une cle d'acces
 * facultative (VITE_ADMIN_GATE_CODE) est demandee avant meme l'ecran
 * de connexion. La page se marque aussi noindex.
 * ===================================================================== */
import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db, MODE_DEMO, surSession } from '../../lib/db'
import { CONFIG } from '../../lib/config'
import { naviguer } from '../../lib/router'
import { Bouton, Entete, Champ, Alerte, Chargement } from '../../components/base'
import { SelecteurLangue, BoutonSortie } from '../../components/chrome'
import TableauAdmin from './TableauAdmin'
import { SectionDemandes, SectionSoignants, SectionGeographie, SectionModeration, SectionNumeros, SectionEquipe, SectionReglages } from './sections'

const CLE_SESSION = 'ast.admin.porte'

export default function Admin({ sousChemin }) {
  const { t } = useLangue()
  const [porte, setPorte] = useState(() => !CONFIG.cleAdmin || sessionStorage.getItem(CLE_SESSION) === '1')
  const [session, setSession] = useState(undefined)

  // Le back-office ne doit jamais etre indexe.
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex, nofollow, noarchive'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  const charger = useCallback(() => {
    db.sessionCourante().then(setSession).catch(() => setSession(null))
  }, [])
  useEffect(() => { charger(); return surSession(charger) }, [charger])

  if (!porte) return <Porte surOuverture={() => setPorte(true)} />
  if (session === undefined) return <Chargement />

  const estAdmin = session && session.profil.role !== 'pro'
  if (!estAdmin) return <ConnexionAdmin surConnexion={charger} deconnecte={!!session} />

  return <Coque session={session} sousChemin={sousChemin} surChangement={charger} />
}

/* --- 1. Porte d'entree (cle partagee) ------------------------------- */
function Porte({ surOuverture }) {
  const { t } = useLangue()
  const [cle, setCle] = useState('')
  const [erreur, setErreur] = useState(false)

  const ouvrir = () => {
    if (cle.trim() === CONFIG.cleAdmin) {
      sessionStorage.setItem(CLE_SESSION, '1')
      surOuverture()
    } else setErreur(true)
  }

  return (
    <div className="pt-16">
      <div className="carte mx-auto max-w-sm p-5">
        <p className="mb-1 text-center text-3xl" aria-hidden="true">🔐</p>
        <h1 className="mb-4 text-center text-lg font-bold">{t('admin.acces')}</h1>
        <Champ etiquette={t('admin.cle')} aide={t('admin.cleAide')} erreur={erreur ? t('admin.cleErreur') : null}>
          <input className="champ" type="password" autoFocus value={cle}
                 onChange={(e) => { setCle(e.target.value); setErreur(false) }}
                 onKeyDown={(e) => e.key === 'Enter' && ouvrir()} />
        </Champ>
        <Bouton className="w-full" onClick={ouvrir}>{t('commun.suivant')}</Bouton>
        <button onClick={() => naviguer('/')} className="mt-3 w-full text-center text-[12px] text-nil-900/40 underline">
          {t('app.nom')}
        </button>
      </div>
    </div>
  )
}

/* --- 2. Connexion administrateur ------------------------------------ */
function ConnexionAdmin({ surConnexion, deconnecte }) {
  const { t } = useLangue()
  const [f, setF] = useState({ telephone: '', motDePasse: '' })
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const entrer = async () => {
    setErreur(null); setEnCours(true)
    try {
      /* Un administrateur se connecte comme un soignant : par numero s'il
         s'est inscrit avant la confirmation, par adresse sinon. */
      const s = await db.connecter({ identifiant: f.telephone.trim(), motDePasse: f.motDePasse })
      if (!s || s.profil.role === 'pro') { setErreur(t('admin.acces')); await db.deconnecter() }
      else surConnexion()
    } catch { setErreur(t('pro.erreurIdentifiants')) }
    finally { setEnCours(false) }
  }

  return (
    <div className="pt-10">
      <div className="carte mx-auto max-w-sm p-5">
        <h1 className="mb-4 text-center text-lg font-bold">{t('admin.titre')}</h1>
        {deconnecte && <div className="mb-3"><Alerte ton="attention">{t('admin.acces')}</Alerte></div>}
        <Champ etiquette={t('pro.telephone')}>
          <div className="flex gap-2" dir="ltr">
            <span className="grid min-w-[4.5rem] place-items-center rounded-xl border-2 border-sable-300 bg-sable-100 font-bold nombres-latins">+235</span>
            <input className="champ nombres-latins" inputMode="tel" autoComplete="username"
                   value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
          </div>
        </Champ>
        <Champ etiquette={CONFIG.inscriptionLibre ? t('pro.motDePasseFacultatif') : t('pro.motDePasse')}>
          <input className="champ" type="password" autoComplete="current-password"
                 value={f.motDePasse} onChange={(e) => setF({ ...f, motDePasse: e.target.value })}
                 onKeyDown={(e) => e.key === 'Enter' && entrer()} />
        </Champ>
        {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}
        <Bouton className="w-full" onClick={entrer} enCours={enCours}>{t('pro.connexion')}</Bouton>

        {MODE_DEMO && (
          <div className="mt-4 border-t border-sable-200 pt-3">
            <p className="mb-2 text-[13px] font-bold text-nil-900/70">🧪 {t('demo.entrerComme')}</p>
            <div className="space-y-2">
              {[['66000000', t('admin.role.super_admin')],
                ['66000002', t('admin.role.admin_ville') + " — N'Djamena"]].map(([num, libelle]) => (
                <Bouton key={num} variante="secondaire" taille="petit" className="w-full" enCours={enCours}
                        onClick={async () => {
                          setErreur(null); setEnCours(true)
                          try { await db.connecter({ telephone: num, motDePasse: 'demo1234' }); surConnexion() }
                          catch { setErreur(t('pro.erreurIdentifiants')) }
                          finally { setEnCours(false) }
                        }}>
                  {libelle}
                </Bouton>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* --- 3. Coque du back-office ---------------------------------------- */
const SECTIONS = [
  ['/', 'tableau', '📊'],
  ['/demandes', 'demandes', '🆘'],
  ['/soignants', 'soignants', '🩺'],
  ['/geographie', 'geographie', '🗺️'],
  ['/moderation', 'moderation', '🛡️'],
  ['/numeros', 'numeros', '☎️'],
  ['/equipe', 'equipe', '👥'],
  ['/reglages', 'reglages', '⚙️'],
]

function Coque({ session, sousChemin, surChangement }) {
  const { t } = useLangue()
  const base = '/' + CONFIG.cheminAdmin
  const superAdmin = session.profil.role === 'super_admin'
  const visibles = SECTIONS.filter(([, cle]) => superAdmin || !['equipe', 'reglages'].includes(cle))

  const perimetre = session.profil.role === 'super_admin'
    ? t('admin.national')
    : [session.profil.ville_nom, session.profil.province_nom].filter(Boolean).join(', ') || '—'

  return (
    <div>
      <Entete
        titre={t('admin.titre')}
        sousTitre={`${t('admin.role.' + session.profil.role)} · ${perimetre}`}
        sansRetour
        action={<BoutonSortie onClick={() => db.deconnecter().then(surChangement)} />}
      />

      <nav className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        <span className="shrink-0"><SelecteurLangue compact /></span>
        {visibles.map(([chemin, cle, emoji]) => {
          const actif = sousChemin === chemin
          return (
            <button key={cle} onClick={() => naviguer(base + (chemin === '/' ? '' : chemin))}
                    aria-current={actif ? 'page' : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-sm font-bold
                      ${actif ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white text-nil-700'}`}>
              {emoji} {t('admin.' + cle)}
            </button>
          )
        })}
      </nav>

      {sousChemin === '/' && <TableauAdmin session={session} />}
      {sousChemin === '/demandes' && <SectionDemandes />}
      {sousChemin === '/soignants' && <SectionSoignants />}
      {sousChemin === '/geographie' && <SectionGeographie />}
      {sousChemin === '/moderation' && <SectionModeration />}
      {sousChemin === '/numeros' && <SectionNumeros />}
      {sousChemin === '/equipe' && superAdmin && <SectionEquipe />}
      {sousChemin === '/reglages' && superAdmin && <SectionReglages />}
    </div>
  )
}
