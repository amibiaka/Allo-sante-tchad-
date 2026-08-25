/* Parcours pharmacie : photo d'ordonnance -> diffusion de voisinage ou
   envoi cible. La plateforme ne vend rien et ne gere aucun paiement :
   c'est ecrit noir sur blanc a l'ecran. */
import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { prefs, historique } from '../lib/store'
import { Lien } from '../lib/router'
import { Bouton, Entete, Champ, ChoixCartes, Case, Alerte, Selecteur, Chargement } from '../components/base'
import { SelecteurZone } from '../components/zone'
import { PhotoOrdonnance, SaisieVocale } from '../components/medias'

export default function Ordonnance() {
  const { t } = useLangue()
  const [pharmacies, setPharmacies] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [erreurs, setErreurs] = useState({})
  const [erreurGlobale, setErreurGlobale] = useState(null)

  const [f, setF] = useState(() => ({
    photo: null, vocal: null, note: '', mode: 'diffusion', pharmacieId: '',
    livraison: false, consentement: false,
    contactTel: prefs.contact()?.tel || '',
    zone: prefs.zone() || { provinceCode: '', villeCode: '' },
  }))
  const maj = (p) => setF((v) => ({ ...v, ...p }))

  useEffect(() => {
    if (!f.zone?.villeCode) { setPharmacies([]); return }
    setPharmacies(null)
    db.annuaire({ villeCode: f.zone.villeCode, type: 'pharmacie' })
      .then(setPharmacies).catch(() => setPharmacies([]))
  }, [f.zone?.villeCode])

  const envoyer = async () => {
    const e = {}
    if (!f.photo) e.photo = t('ordo.photoObligatoire')
    if (!f.zone?.villeCode) e.ville = t('aide.erreurLieu')
    if (!f.consentement) e.consentement = t('aide.erreurConsentement')
    setErreurs(e)
    if (Object.keys(e).length) return

    setEnvoi(true); setErreurGlobale(null)
    try {
      const imageChemin = (await db.televerser(f.photo.blob, 'ordonnances')).chemin
      let vocalChemin = null
      if (f.vocal?.blob) {
        try { vocalChemin = (await db.televerser(f.vocal.blob, 'vocaux')).chemin } catch { /* facultatif */ }
      }
      const tel = f.contactTel.replace(/\D/g, '')
      const r = await db.creerOrdonnance({
        imageChemin, vocalChemin, note: f.note,
        villeCode: f.zone.villeCode,
        villeLibre: f.zone.villeLibre || null,
        quartierNom: f.zone.quartierNom || f.zone.quartierLibre || null,
        pharmacieId: f.mode === 'ciblee' ? f.pharmacieId || null : null,
        contactTel: tel ? '+235' + tel : null, livraison: f.livraison,
      })
      prefs.definirZone(f.zone)
      if (f.contactTel) prefs.definirContact({ tel: f.contactTel })
      historique.ajouter({ code: r.code, type: 'ordonnance' })
      setResultat(r)
    } catch (err) {
      setErreurGlobale(err.message || t('commun.erreur'))
    } finally { setEnvoi(false) }
  }

  if (resultat) {
    return (
      <div>
        <Entete titre={t('ordo.envoyee')} sansRetour />
        <div className="carte p-4 text-center">
          <div className="mb-2 text-5xl" aria-hidden="true">💊</div>
          <p className="text-[15px] text-nil-900/70">{t('aide.codeSuivi')}</p>
          <p className="my-2 break-all text-3xl font-black tracking-[.1em] text-nil-700 nombres-latins" dir="ltr">{resultat.code}</p>
          <p className="aide">{t('aide.codeAide')}</p>
        </div>
        <Lien vers={`/ordonnance/${resultat.code}`} className="mt-4 block">
          <Bouton taille="grand" className="w-full">{t('ordo.reponses')}</Bouton>
        </Lien>
        <div className="mt-6 text-center"><Lien vers="/" className="lien">{t('app.nom')}</Lien></div>
      </div>
    )
  }

  return (
    <div>
      <Entete titre={t('ordo.titre')} />
      <p className="mb-4 text-[15px] text-nil-900/70">{t('ordo.intro')}</p>

      <Champ erreur={erreurs.photo}>
        <PhotoOrdonnance valeur={f.photo} onChange={(v) => maj({ photo: v })} />
      </Champ>

      <Champ etiquette={t('ordo.note')}>
        <textarea className="champ" rows={2} maxLength={300} placeholder={t('ordo.notePlaceholder')}
                  value={f.note} onChange={(e) => maj({ note: e.target.value })} />
        <div className="mt-2"><SaisieVocale valeur={f.vocal} onChange={(v) => maj({ vocal: v })} /></div>
      </Champ>

      <div className="mb-4 rounded-xl border-2 border-sable-300 bg-white p-3">
        <p className="etiquette">{t('aide.e3Zone')}</p>
        <SelecteurZone valeur={f.zone} onChange={(z) => maj({ zone: z })} erreur={erreurs.ville} avecGps={false} />
      </div>

      <Champ etiquette={t('ordo.mode')}>
        <ChoixCartes
          valeur={f.mode}
          onChange={(v) => maj({ mode: v })}
          options={[
            { valeur: 'diffusion', libelle: t('ordo.diffusion'), detail: t('ordo.diffusionAide'), emoji: '📢' },
            { valeur: 'ciblee', libelle: t('ordo.ciblee'), emoji: '🎯' },
          ]}
        />
        {f.mode === 'ciblee' && (
          pharmacies === null ? <Chargement /> :
          pharmacies.length === 0 ? <p className="aide mt-2">{t('ordo.sansPharmacie')}</p> : (
            <Selecteur
              className="mt-2"
              placeholder={t('ordo.choisirPharmacie')}
              valeur={f.pharmacieId}
              onChange={(v) => maj({ pharmacieId: v })}
              options={pharmacies.map((p) => ({
                valeur: p.id,
                libelle: `${p.nom}${p.quartier_nom ? ' — ' + p.quartier_nom : ''}${p.en_ligne ? ' 🟢' : ''}`,
              }))}
            />
          )
        )}
      </Champ>

      <Champ>
        <Case coche={f.livraison} onChange={(v) => maj({ livraison: v })}>
          <span className="font-semibold">🛵 {t('ordo.livraison')}</span>
          <span className="aide mt-1 block">{t('ordo.livraisonAide')}</span>
        </Case>
      </Champ>

      <Champ etiquette={t('aide.contact')} aide={t('aide.contactAide')}>
        <div className="flex gap-2" dir="ltr">
          <span className="grid min-w-[4.5rem] place-items-center rounded-xl border-2 border-sable-300 bg-sable-100 font-bold nombres-latins">+235</span>
          <input className="champ nombres-latins" inputMode="tel" maxLength={12} placeholder="66 00 00 00"
                 value={f.contactTel} onChange={(e) => maj({ contactTel: e.target.value.replace(/[^\d ]/g, '') })} />
        </div>
      </Champ>

      <div className="mb-4"><Alerte ton="info" titre="⚖️">{t('ordo.legal')}</Alerte></div>

      <Champ erreur={erreurs.consentement}>
        <Case coche={f.consentement} onChange={(v) => maj({ consentement: v })}>
          <span className="font-semibold">{t('aide.consentement')}</span>
          <span className="aide mt-1 block">{t('aide.consentementDetail', { jours: 30 })}</span>
        </Case>
      </Champ>

      {erreurGlobale && <Alerte ton="danger">{erreurGlobale}</Alerte>}

      <div className="barre-bas">
        <Bouton taille="grand" className="w-full" onClick={envoyer} enCours={envoi} disabled={envoi}>
          {envoi ? t('aide.envoiEnCours') : t('ordo.envoyer')}
        </Bouton>
      </div>
    </div>
  )
}
