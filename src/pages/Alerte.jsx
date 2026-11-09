/* Signalement communautaire d'un evenement sanitaire.
   ---------------------------------------------------------------------
   N'importe qui, sans compte, peut prevenir les autorites de sante :
   plusieurs malades aux memes signes, des deces inhabituels, des
   animaux morts, une eau suspecte. C'est la veille a base communautaire
   que recommande l'OMS, reduite a un formulaire de trente secondes.
   Le signalement n'est pas une demande d'aide : pour une urgence, c'est
   le bouton rouge de l'accueil. L'ecran le dit en premier. */
import { useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { prefs } from '../lib/store'
import { Lien } from '../lib/router'
import { Bouton, Entete, Champ, ChoixCartes, Alerte as Encart, Case } from '../components/base'
import { SelecteurZone } from '../components/zone'

const TYPES = ['malades_groupes', 'deces_inhabituels', 'animaux_morts', 'eau_suspecte', 'autre']
const EMOJI = { malades_groupes: '🤒', deces_inhabituels: '🕯️', animaux_morts: '🐄', eau_suspecte: '💧', autre: '❓' }

export default function Alerte({ requete }) {
  const { t } = useLangue()
  const contexteMapi = requete?.get('contexte') === 'mapi'
  const [type, setType] = useState(requete?.get('type') || (contexteMapi ? 'autre' : ''))
  const [zone, setZone] = useState(prefs.zone())
  const [nb, setNb] = useState('')
  const [description, setDescription] = useState(contexteMapi ? t('alerte.mapiPrefixe', { age: requete?.get('age') || '?' }) + ' ' : '')
  const [tel, setTel] = useState('')
  const [consent, setConsent] = useState(false)
  const [etat, setEtat] = useState('saisie')   // saisie | envoi | fait | erreur
  const [code, setCode] = useState(null)
  const [erreurs, setErreurs] = useState({})

  const envoyer = async () => {
    const e = {}
    if (!type) e.type = t('commun.obligatoire')
    if (!zone?.villeCode) e.zone = t('commun.obligatoire')
    if (description.trim().length < 10) e.description = t('alerte.descriptionCourte')
    if (!consent) e.consent = t('commun.obligatoire')
    setErreurs(e)
    if (Object.keys(e).length) return
    setEtat('envoi')
    try {
      const c = await db.signalerEvenement({
        ville_code: zone.villeCode, quartier_id: zone.quartierId || null, type,
        nb_personnes: nb ? Number(nb) : null, lieu_texte: [zone.quartierNom || zone.quartierLibre, zone.villeLibre].filter(Boolean).join(', ') || null,
        description: description.trim(), contact_tel: tel.trim() || null,
      })
      setCode(c); setEtat('fait')
    } catch { setEtat('erreur') }
  }

  if (etat === 'fait') {
    return (
      <div>
        <Entete titre={t('alerte.titre')} />
        <Encart ton="succes" titre={t('alerte.merciTitre')}>
          <p>{t('alerte.merciTexte')}</p>
          <p className="mt-2 font-bold nombres-latins">{t('alerte.reference')} : {code}</p>
        </Encart>
        <div className="mt-4 space-y-2">
          <Lien vers="/"><Bouton variante="secondaire" className="w-full">{t('commun.accueil')}</Bouton></Lien>
          <Lien vers="/aide"><Bouton variante="urgence" className="w-full">🆘 {t('accueil.aide')}</Bouton></Lien>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Entete titre={t(contexteMapi ? 'alerte.titreMapi' : 'alerte.titre')} sousTitre={t('alerte.sousTitre')} />

      <div className="mb-4">
        <Encart ton="attention">{t('alerte.pasUneUrgence')} <Lien vers="/aide" className="font-bold underline">{t('accueil.aide')}</Lien></Encart>
      </div>

      {!contexteMapi && (
        <Champ etiquette={t('alerte.quoi')} erreur={erreurs.type} obligatoire>
          <ChoixCartes valeur={type} onChange={setType}
                       options={TYPES.map((x) => ({ valeur: x, emoji: EMOJI[x], libelle: t('alerte.type.' + x), detail: t('alerte.typeDetail.' + x) }))} />
        </Champ>
      )}

      <Champ etiquette={t('alerte.ou')} erreur={erreurs.zone} obligatoire>
        <SelecteurZone valeur={zone} onChange={setZone} />
      </Champ>

      {type === 'malades_groupes' && (
        <Champ etiquette={t('alerte.combien')} aide={t('alerte.combienAide')}>
          <input className="champ" type="number" inputMode="numeric" min="1" max="10000" value={nb} onChange={(e) => setNb(e.target.value)} />
        </Champ>
      )}

      <Champ etiquette={t('alerte.description')} aide={t('alerte.descriptionAide')} erreur={erreurs.description} obligatoire>
        <textarea className="champ min-h-[7rem]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Champ>

      <Champ etiquette={t('alerte.telephone')} aide={t('alerte.telephoneAide')}>
        <input className="champ" type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="66 00 00 00" />
      </Champ>

      <Champ erreur={erreurs.consent}>
        <Case coche={consent} onChange={setConsent}>{t('alerte.consentement')}</Case>
      </Champ>

      {etat === 'erreur' && <div className="mb-3"><Encart ton="danger">{t('commun.erreurReseau')}</Encart></div>}

      <Bouton className="w-full" taille="grand" onClick={envoyer} enCours={etat === 'envoi'}>📣 {t('alerte.envoyer')}</Bouton>
      <p className="aide mt-3 text-center">{t('alerte.confidentialite')}</p>
    </div>
  )
}
