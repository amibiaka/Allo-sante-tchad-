import { useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db, MODE_DEMO } from '../../lib/db'
import { TYPES_PRO, CONFIG } from '../../lib/config'
import { Bouton, Entete, Champ, Selecteur, Alerte, ChoixCartes } from '../../components/base'
import { SelecteurZone } from '../../components/zone'
import { TYPE_LIBELLE } from '../Annuaire'

export default function Connexion({ surConnexion }) {
  const { t } = useLangue()
  const [mode, setMode] = useState('connexion')
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [f, setF] = useState({
    telephone: '', motDePasse: '', nom: '', type: 'medecin', specialite: '',
    horaires: '', adresse: '', whatsapp: '',
    zone: { provinceCode: '', villeCode: '' },
  })
  const maj = (p) => setF((v) => ({ ...v, ...p }))

  const [codeRecup, setCodeRecup] = useState(null)
  const libre = CONFIG.inscriptionLibre

  const messageErreur = (e) => ({
    IDENTIFIANTS: t('pro.erreurIdentifiants'),
    COMPTE_EXISTANT: t('pro.erreurExistant'),
    CONFIRMATION_EMAIL_ACTIVE: t('pro.erreurConfirmation'),
    CLE_ABSENTE: t('pro.cleAbsente'),
  }[e] || e || t('commun.erreur'))

  /* Raccourci de demonstration : on se connecte directement, sans passer
     par l'etat du formulaire (qui ne serait pas encore a jour). */
  const entrerDemo = async (num) => {
    setErreur(null); setEnCours(true)
    try { await db.connecter({ telephone: num, motDePasse: 'demo1234' }); surConnexion?.() }
    catch (e) { setErreur(messageErreur(e.message)) }
    finally { setEnCours(false) }
  }

  const soumettre = async () => {
    setErreur(null)
    const tel = f.telephone.replace(/\D/g, '')
    if (tel.length < 6) return setErreur(t('pro.erreurChamps'))
    if (!libre && f.motDePasse.length < 6) return setErreur(t('pro.erreurChamps'))
    if (mode === 'inscription' && (!f.nom.trim() || !f.zone.villeCode)) return setErreur(t('pro.erreurChamps'))
    setEnCours(true)
    try {
      if (mode === 'connexion') {
        await db.connecter({ telephone: tel, motDePasse: f.motDePasse })
      } else {
        const r = await db.inscrire({
          telephone: tel, motDePasse: f.motDePasse, nom: f.nom.trim(), type: f.type,
          specialite: f.specialite, horaires: f.horaires, adresse: f.adresse,
          whatsapp: f.whatsapp ? '+235' + f.whatsapp.replace(/\D/g, '') : null,
          villeCode: f.zone.villeCode,
          quartierNom: f.zone.quartierNom || f.zone.quartierLibre || null,
        })
        // Le code n'existe qu'en acces libre avec une vraie base : on le
        // montre une fois, puis on entre.
        if (r?.codeRecuperation) { setCodeRecup(r.codeRecuperation); setEnCours(false); return }
      }
      surConnexion?.()
    } catch (e) {
      setErreur(messageErreur(e.message))
    } finally { setEnCours(false) }
  }

  if (codeRecup) {
    return (
      <div>
        <Entete titre={t('pro.creerCompte')} sansRetour />
        <div className="carte p-4 text-center">
          <div className="mb-2 text-4xl" aria-hidden="true">🔑</div>
          <p className="text-[15px] text-nil-900/70">{t('pro.codeRecuperation')}</p>
          <p className="my-2 select-all text-3xl font-black tracking-[.15em] text-nil-700 nombres-latins" dir="ltr">
            {codeRecup}
          </p>
          <p className="aide">{t('pro.codeRecuperationAide')}</p>
        </div>
        <Bouton taille="grand" className="mt-4 w-full" onClick={() => surConnexion?.()}>
          {t('commun.suivant')}
        </Bouton>
      </div>
    )
  }

  return (
    <div>
      <Entete titre={t('pro.titre')} />

      <div className="mb-4 flex gap-2">
        {[['connexion', t('pro.connexion')], ['inscription', t('pro.inscription')]].map(([v, l]) => (
          <button key={v} onClick={() => { setMode(v); setErreur(null) }} aria-pressed={mode === v}
                  className={`flex-1 rounded-xl border-2 py-2.5 font-bold
                    ${mode === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {mode === 'inscription' && (
        <div className="mb-4">
          <Alerte ton="succes" titre={`⏳ ${t('badge.provisoire')} — 45 ${t('commun.jours')}`}>
            {t('pro.probationAide')}
          </Alerte>
        </div>
      )}

      <Champ etiquette={t('pro.telephone')} aide={t('pro.telephoneAide')} obligatoire>
        <div className="flex gap-2" dir="ltr">
          <span className="grid min-w-[4.5rem] place-items-center rounded-xl border-2 border-sable-300 bg-sable-100 font-bold nombres-latins">+235</span>
          <input className="champ nombres-latins" inputMode="tel" maxLength={12} placeholder="66 00 00 00"
                 autoComplete="username"
                 value={f.telephone} onChange={(e) => maj({ telephone: e.target.value.replace(/[^\d ]/g, '') })} />
        </div>
      </Champ>

      {libre ? (
        <p className="aide mb-4">🔓 {t('pro.sansMotDePasse')}</p>
      ) : (
        <Champ etiquette={t('pro.motDePasse')} aide={t('pro.motDePasseAide')} obligatoire>
          <input className="champ" type="password" autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
                 value={f.motDePasse} onChange={(e) => maj({ motDePasse: e.target.value })} />
        </Champ>
      )}

      {mode === 'inscription' && (
        <>
          <Champ etiquette={t('pro.nom')} obligatoire>
            <input className="champ" maxLength={120} value={f.nom} onChange={(e) => maj({ nom: e.target.value })} />
          </Champ>

          <Champ etiquette={t('pro.type')} obligatoire>
            <ChoixCartes
              colonnes={2}
              valeur={f.type}
              onChange={(v) => maj({ type: v })}
              options={TYPES_PRO.filter((x) => !x.secours && x.cle !== 'autre').map((x) => ({
                valeur: x.cle, libelle: TYPE_LIBELLE(x.cle), emoji: x.emoji,
              }))}
            />
          </Champ>

          <Champ etiquette={t('pro.specialite')}>
            <input className="champ" maxLength={120} placeholder={t('pro.specialitePlaceholder')}
                   value={f.specialite} onChange={(e) => maj({ specialite: e.target.value })} />
          </Champ>

          <div className="mb-4 rounded-xl border-2 border-sable-300 bg-white p-3">
            <p className="etiquette">{t('aide.e3Zone')}</p>
            <SelecteurZone valeur={f.zone} onChange={(z) => maj({ zone: z })} avecGps={false} />
          </div>

          <Champ etiquette={t('pro.horaires')}>
            <input className="champ" maxLength={120} placeholder={t('pro.horairesPlaceholder')}
                   value={f.horaires} onChange={(e) => maj({ horaires: e.target.value })} />
          </Champ>

          <Champ etiquette={t('pro.adresse')}>
            <input className="champ" maxLength={160} value={f.adresse} onChange={(e) => maj({ adresse: e.target.value })} />
          </Champ>

          <Champ etiquette={t('pro.whatsapp')} aide={t('pro.whatsappAide')}>
            <div className="flex gap-2" dir="ltr">
              <span className="grid min-w-[4.5rem] place-items-center rounded-xl border-2 border-sable-300 bg-sable-100 font-bold nombres-latins">+235</span>
              <input className="champ nombres-latins" inputMode="tel" maxLength={12}
                     value={f.whatsapp} onChange={(e) => maj({ whatsapp: e.target.value.replace(/[^\d ]/g, '') })} />
            </div>
          </Champ>
        </>
      )}

      {erreur && <div className="mb-4"><Alerte ton="danger">{erreur}</Alerte></div>}

      {MODE_DEMO && mode === 'connexion' && (
        <div className="carte mb-4 p-3">
          <p className="mb-2 text-[13px] font-bold text-nil-900/70">🧪 {t('demo.entrerComme')}</p>
          <div className="space-y-2">
            {[['66000001', t('demo.comptePro') + ' — Dr Démo Soignant'],
              ['66000003', t('demo.comptePharmacie') + ' — Pharmacie Démo']].map(([num, libelle]) => (
              <Bouton key={num} variante="secondaire" className="w-full" taille="petit"
                      onClick={() => entrerDemo(num)} enCours={enCours}>
                {libelle}
              </Bouton>
            ))}
          </div>
        </div>
      )}

      <div className="barre-bas">
        <Bouton taille="grand" className="w-full" onClick={soumettre} enCours={enCours} disabled={enCours}>
          {mode === 'connexion' ? (libre ? t('pro.entrer') : t('pro.connexion')) : t('pro.creerCompte')}
        </Bouton>
      </div>
    </div>
  )
}
