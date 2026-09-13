import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { prefs } from '../lib/store'
import { Bouton, Entete, Champ, Selecteur, Case, Alerte } from '../components/base'
import { SelecteurZone } from '../components/zone'

/* Registre des donneurs de sang.

   Le ministere de la Sante publique a declare en decembre 2024 que le
   pays perd des femmes en couches chaque jour faute de poches de sang.
   Cet ecran ne fait qu une chose : recueillir un volontaire et sa zone.

   Deux regles qui ne se negocient pas. Le registre n est jamais lisible,
   ni par le public ni par un soignant : on ne peut qu y entrer, en
   sortir, et en compter les inscrits. Et un donneur n est jamais mis en
   relation directe avec un malade, l appel passe par le service de
   transfusion : du sang non qualifie tue autant que l absence de sang. */

const GROUPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export default function Donneur() {
  const { t } = useLangue()
  const [zone, setZone] = useState(prefs.zone() || { provinceCode: '', villeCode: '' })
  const [tel, setTel] = useState('')
  const [nom, setNom] = useState('')
  const [groupe, setGroupe] = useState('')
  const [accord, setAccord] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState('')
  const [combien, setCombien] = useState(null)

  /* Le compteur est un agregat, jamais une liste : il montre l elan sans
     exposer personne. Son echec ne doit rien bloquer. */
  useEffect(() => {
    let vivant = true
    if (!zone.villeCode) return undefined
    db.compteurDonneurs(zone.villeCode)
      .then((n) => { if (vivant) setCombien(Number(n) || 0) })
      .catch(() => {})
    return () => { vivant = false }
  }, [zone.villeCode])

  async function envoyer() {
    setErreur('')
    setEnvoi(true)
    try {
      const recu = await db.inscrireDonneur({
        telephone: tel,
        groupe: groupe || 'inconnu',
        villeCode: zone.villeCode,
        nom,
        quartierId: null,
      })
      prefs.definirZone(zone)
      setCode(String(recu || ''))
    } catch (e) {
      setErreur(t('don.erreur'))
    } finally {
      setEnvoi(false)
    }
  }

  if (code) {
    return (
      <div>
        <Entete titre={t('don.titre')} />
        <Alerte titre={t('don.merci')}>
          <p className="mt-1">{t('don.code')}</p>
          <p className="my-2 text-3xl font-black tracking-widest">{code}</p>
          <p className="aide">{t('don.codeAide')}</p>
        </Alerte>
        <p className="aide mt-4">{t('don.garantie')}</p>
      </div>
    )
  }

  const numeroOk = tel.replace(/[^0-9]/g, '').length >= 8
  const pret = numeroOk && !!zone.villeCode && accord && !envoi

  return (
    <div>
      <Entete titre={t('don.titre')} sousTitre={t('don.intro')} />

      <Champ etiquette={t('don.telephone')} obligatoire>
        <input
          className="champ"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="66 00 00 00"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
        />
      </Champ>

      <Champ etiquette={t('don.nom')}>
        <input
          className="champ"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
      </Champ>

      <Champ etiquette={t('don.groupe')}>
        <Selecteur
          valeur={groupe}
          onChange={setGroupe}
          options={[{ valeur: '', libelle: t('don.inconnu') }].concat(
            GROUPES.map((g) => ({ valeur: g, libelle: g }))
          )}
        />
      </Champ>

      <Champ etiquette={t('don.zone')} obligatoire>
        <SelecteurZone valeur={zone} onChange={setZone} />
      </Champ>

      {combien !== null && combien > 0 && (
        <p className="aide mt-2">{t('don.compteur').replace('{n}', String(combien))}</p>
      )}

      <div className="mt-4">
        <Case coche={accord} onChange={setAccord}>{t('don.consentement')}</Case>
      </div>

      <p className="aide mt-3">{t('don.garantie')}</p>

      {erreur && <p className="mt-3 text-rouge-600">{erreur}</p>}

      <div className="barre-bas">
        <Bouton taille="grand" className="w-full" disabled={!pret} onClick={envoyer}>
          {envoi ? t('don.envoi') : t('don.envoyer')}
        </Bouton>
      </div>
    </div>
  )
}
