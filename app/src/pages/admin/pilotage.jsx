/* =====================================================================
 * PILOTAGE : la premiere page du back-office pour les responsables.
 * ---------------------------------------------------------------------
 * Le super-administrateur, les Ordres, le programme national et les
 * autorites voient ici, groupes par theme, tout ce qu'ils peuvent faire
 * et ou en est la plateforme : comptes et acces, soignants,
 * communication (campagnes, publications, diffusion), territoire
 * (regions, districts, formations, villes), donnees. Chaque tuile mene
 * a l'ecran correspondant ; les tuiles « ➕ » ouvrent directement le
 * formulaire de creation. Les chiffres viennent de pilotage_resume(),
 * un seul appel, filtre par la base selon le role.
 * ===================================================================== */
import { useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { CONFIG } from '../../lib/config'
import { naviguer } from '../../lib/router'
import { Alerte, Chargement } from '../../components/base'

export default function Pilotage({ session, voit }) {
  const { t } = useLangue()
  const [r, setR] = useState(null)
  const role = session.profil.role
  const base = '/' + CONFIG.cheminAdmin
  const admin = ['super_admin', 'admin_province', 'admin_ville'].includes(role)

  useEffect(() => { db.pilotageResume().then((x) => setR(x || {})).catch(() => setR({})) }, [])
  if (!r) return <Chargement />

  const n = (k) => (r[k] == null ? null : Number(r[k]))
  const GROUPES = [
    { cle: 'comptes', emoji: '👥', tuiles: [
      { l: t('pilotage.comptesGestion'), v: n('comptes_gestion'), vers: '/equipe', si: voit('equipe'),
        detail: n('comptes_inactifs') ? t('pilotage.inactifs', { n: n('comptes_inactifs') }) : t('pilotage.comptesAide') },
      { l: t('pilotage.nouveauCompte'), emoji: '➕', vers: '/equipe?nouveau=1', si: voit('equipe'), action: true },
      { l: t('admin.reglages'), emoji: '🔐', vers: '/reglages', si: voit('reglages'), detail: t('pilotage.reglagesAide') },
    ] },
    { cle: 'soignants', emoji: '🩺', tuiles: [
      { l: t('inst.kpi.aValider'), v: n('a_valider'), vers: '/validations', si: voit('validations'), ton: 'attention' },
      { l: t('pilotage.verifies'), v: n('soignants_verifies'), vers: admin ? '/soignants' : '/statistiques' },
      { l: t('admin.deontologie'), emoji: '⚖️', vers: '/deontologie', si: voit('deontologie') },
      { l: t('pilotage.entraide'), v: n('cas_ouverts'), vers: '/statistiques', detail: t('pilotage.partages', { n: n('partages') || 0 }) },
    ] },
    { cle: 'communication', emoji: '📣', tuiles: [
      { l: t('inst.kpi.campagnes'), v: n('campagnes_actives'), vers: '/campagnes', si: voit('campagnes'),
        detail: n('campagnes_brouillons') ? t('pilotage.brouillons', { n: n('campagnes_brouillons') }) : null },
      { l: t('inst.nouvelleCampagne'), emoji: '➕', vers: '/campagnes?nouveau=1', si: voit('campagnes'), action: true },
      { l: t('inst.kpi.publications'), v: n('publications'), vers: '/publications', si: voit('publications') },
      { l: t('admin.diffusion'), emoji: '📣', vers: '/diffusion', si: voit('diffusion'), detail: t('pilotage.diffusionAide') },
    ] },
    { cle: 'territoire', emoji: '🗺️', tuiles: [
      { l: t('pilotage.regions'), v: n('provinces'), vers: '/territoire?onglet=regions', si: voit('territoire') },
      { l: t('pilotage.districts'), v: n('districts'), vers: '/territoire?onglet=districts', si: voit('territoire') },
      { l: t('pilotage.formations'), v: n('formations'), vers: '/territoire?onglet=formations', si: voit('territoire') },
      { l: t('pilotage.villes'), v: n('villes'), vers: '/territoire?onglet=villes', si: voit('territoire') },
      { l: t('pilotage.quartiersAttente'), v: n('quartiers_attente'), vers: '/geographie', si: voit('geographie'), ton: 'attention' },
    ] },
    { cle: 'donnees', emoji: '📊', tuiles: [
      { l: t('admin.statistiques'), emoji: '📊', vers: '/statistiques', detail: t('pilotage.demandes7j', { n: n('demandes_7j') || 0 }) },
      { l: t('admin.veille'), emoji: '📈', vers: '/veille', si: voit('veille') },
      { l: t('inst.kpi.evenements'), v: n('evenements_nouveaux'), vers: '/alertes', si: voit('alertes'), ton: 'attention' },
      { l: t('pilotage.journal'), v: n('journal_7j'), vers: '/reglages', si: voit('reglages'), detail: t('pilotage.journalAide') },
    ] },
  ].map((g) => ({ ...g, tuiles: g.tuiles.filter((x) => x.si !== false) })).filter((g) => g.tuiles.length)

  return (
    <div className="mb-5">
      <div className="mb-3"><Alerte ton="info">{t('inst.bienvenue.' + role)}</Alerte></div>
      {GROUPES.map((g) => (
        <section key={g.cle} className="mb-4">
          <h2 className="mb-1.5 text-sm font-bold text-nil-900/60">{g.emoji} {t('pilotage.groupe.' + g.cle)}</h2>
          <div className="grid grid-cols-2 gap-2">
            {g.tuiles.map((x) => <Tuile key={x.l + x.vers} {...x} onClick={() => naviguer(base + x.vers)} />)}
          </div>
        </section>
      ))}
      <p className="aide">{t('inst.journalNote')}</p>
    </div>
  )
}

function Tuile({ l, v, emoji, detail, ton, action, onClick }) {
  const alerte = ton === 'attention' && v > 0
  const classes = action
    ? 'border-dashed border-nil-300 bg-nil-50 text-nil-700'
    : alerte ? 'border-soleil-300 bg-soleil-100 text-soleil-700' : 'border-sable-300 bg-white'
  return (
    <button onClick={onClick} className={`rounded-xl border-2 p-3 text-start ${classes}`}>
      {v != null
        ? <p className="text-2xl font-black nombres-latins">{v}</p>
        : <p className="text-2xl leading-8">{emoji || '·'}</p>}
      <p className="text-[12px] font-bold leading-tight">{l}</p>
      {detail && <p className="mt-0.5 text-[11px] leading-tight opacity-60">{detail}</p>}
    </button>
  )
}
