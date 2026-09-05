import { Suspense, lazy, useEffect } from 'react'
import { useRoute, correspond } from './lib/router'
import { CONFIG } from './lib/config'
import { appliquerModeLeger } from './lib/net'
import { Chargement } from './components/base'
import { BandeauDemo, BandeauLangueEssai, LiseréDrapeau, PropositionInstallation } from './components/chrome'

const Accueil          = lazy(() => import('./pages/Accueil'))
const DemandeAide      = lazy(() => import('./pages/DemandeAide'))
const Suivi            = lazy(() => import('./pages/Suivi'))
const MesDemandes      = lazy(() => import('./pages/MesDemandes'))
const Annuaire         = lazy(() => import('./pages/Annuaire'))
const Ordonnance       = lazy(() => import('./pages/Ordonnance'))
const SuiviOrdonnance  = lazy(() => import('./pages/SuiviOrdonnance'))
const ChoixZone        = lazy(() => import('./pages/ChoixZone'))
const APropos          = lazy(() => import('./pages/APropos'))
const Transparence     = lazy(() => import('./pages/Transparence'))
const EspacePro        = lazy(() => import('./pages/pro/EspacePro'))
const Admin            = lazy(() => import('./pages/admin/Admin'))

const ROUTES = [
  ['/', Accueil],
  ['/aide', DemandeAide],
  ['/suivi', Suivi],
  ['/suivi/:code', Suivi],
  ['/mes-demandes', MesDemandes],
  ['/annuaire', Annuaire],
  ['/medicament', Ordonnance],
  ['/ordonnance/:code', SuiviOrdonnance],
  ['/zone', ChoixZone],
  ['/a-propos', APropos],
  ['/transparence', Transparence],
  ['/pro', EspacePro],
]

export default function App() {
  const { chemin, params } = useRoute()

  useEffect(() => { appliquerModeLeger() }, [])

  // Le back-office vit sur un chemin discret et n'est jamais lie depuis
  // l'interface publique.
  const racineAdmin = '/' + CONFIG.cheminAdmin
  if (chemin === racineAdmin || chemin.startsWith(racineAdmin + '/')) {
    return (
      <Cadre>
        <Suspense fallback={<Chargement />}>
          <Admin sousChemin={chemin.slice(racineAdmin.length) || '/'} />
        </Suspense>
      </Cadre>
    )
  }

  for (const [motif, Composant] of ROUTES) {
    const p = correspond(motif, chemin)
    if (p) {
      return (
        <Cadre>
          <Suspense fallback={<Chargement />}>
            <Composant {...p} requete={params} />
          </Suspense>
        </Cadre>
      )
    }
  }

  return (
    <Cadre>
      <Suspense fallback={<Chargement />}>
        <Accueil />
      </Suspense>
    </Cadre>
  )
}

function Cadre({ children }) {
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-sable-100">
      <LiseréDrapeau />
      <BandeauLangueEssai />
      <BandeauDemo />
      <main className="px-4 pb-8 pt-3">{children}</main>
      <PropositionInstallation />
    </div>
  )
}
