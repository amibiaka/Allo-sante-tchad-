/* =====================================================================
 * ACCES PAR LIEN — invitation a un compte de gestion ou mot de passe
 * oublie. Le lien envoye par Supabase ouvre une session ; cette page
 * demande de choisir un mot de passe, puis conduit au back-office.
 * ===================================================================== */
import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { CONFIG } from '../lib/config'
import { naviguer } from '../lib/router'
import { Bouton, Entete, Champ, Alerte, Chargement } from '../components/base'

export default function Acces() {
  const { t } = useLangue()
  const [etat, setEtat] = useState('chargement')   // chargement | formulaire | fait | sansLien
  const [session, setSession] = useState(null)
  const [f, setF] = useState({ a: '', b: '' })
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        await db.ouvrirSessionDepuisLien()
        const s = await db.sessionCourante()
        setSession(s)
        setEtat(s ? 'formulaire' : 'sansLien')
      } catch { setEtat('sansLien') }
    })()
  }, [])

  const enregistrer = async () => {
    setErreur(null)
    if (f.a.length < 8) { setErreur(t('acces.tropCourt')); return }
    if (f.a !== f.b) { setErreur(t('acces.differents')); return }
    setEnCours(true)
    try { await db.definirMotDePasse(f.a); setEtat('fait') }
    catch { setErreur(t('commun.erreurReseau')) }
    finally { setEnCours(false) }
  }

  const estGestion = session && session.profil && session.profil.role !== 'pro'

  return (
    <div>
      <Entete titre={t('acces.titre')} sansRetour />
      {etat === 'chargement' && <Chargement />}
      {etat === 'sansLien' && (
        <div className="carte p-4">
          <Alerte ton="attention">{t('acces.lienInvalide')}</Alerte>
          <Bouton className="mt-3 w-full" variante="secondaire" onClick={() => naviguer('/')}>{t('app.nom')}</Bouton>
        </div>
      )}
      {etat === 'formulaire' && (
        <div className="carte p-4">
          <p className="mb-1 text-sm">{t('acces.bonjour', { nom: session.profil?.nom || session.profil?.email || '' })}</p>
          {estGestion && <p className="mb-3 text-[13px] text-nil-900/70">{t('acces.roleAttribue')} <b>{t('admin.role.' + session.profil.role)}</b>.</p>}
          <Champ etiquette={t('acces.motDePasse')} aide={t('acces.motDePasseAide')}>
            <input className="champ" type="password" autoComplete="new-password" value={f.a} onChange={(e) => setF({ ...f, a: e.target.value })} />
          </Champ>
          <Champ etiquette={t('acces.confirmer')}>
            <input className="champ" type="password" autoComplete="new-password" value={f.b} onChange={(e) => setF({ ...f, b: e.target.value })}
                   onKeyDown={(e) => e.key === 'Enter' && enregistrer()} />
          </Champ>
          {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}
          <Bouton className="w-full" onClick={enregistrer} enCours={enCours}>{t('acces.enregistrer')}</Bouton>
        </div>
      )}
      {etat === 'fait' && (
        <div className="carte p-4">
          <Alerte ton="succes" titre={t('acces.faitTitre')}>{t('acces.faitTexte')}</Alerte>
          <Bouton className="mt-3 w-full" onClick={() => naviguer(estGestion ? '/' + CONFIG.cheminAdmin : '/pro')}>
            {estGestion ? t('acces.ouvrirGestion') : t('acces.ouvrirPro')}
          </Bouton>
          {estGestion && CONFIG.cleAdmin && <p className="aide mt-2">{t('acces.cleAdminNote')}</p>}
        </div>
      )}
    </div>
  )
}
