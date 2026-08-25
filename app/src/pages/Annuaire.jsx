/* Annuaire consultable sans rien remplir : c'est la porte d'entree la
   plus rapide quand on sait deja ce qu'on cherche. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { prefs } from '../lib/store'
import { TYPES_PRO } from '../lib/config'
import { chargerGeo, distanceKm, positionActuelle, villeParCode } from '../lib/geo'
import { naviguer, Lien } from '../lib/router'
import { Bouton, Entete, Selecteur, Chargement, Vide, Modale, Champ, Alerte } from '../components/base'
import { FichePro } from '../components/pro'
import { libelleZone } from '../components/zone'

export default function Annuaire() {
  const { t, nom } = useLangue()
  const [geo, setGeo] = useState(null)
  const [zone, setZone] = useState(prefs.zone())
  const [type, setType] = useState('')
  const [recherche, setRecherche] = useState('')
  const [liste, setListe] = useState(null)
  const [position, setPosition] = useState(null)
  const [signalement, setSignalement] = useState(null)

  useEffect(() => { chargerGeo().then(setGeo) }, [])

  const charger = useCallback(() => {
    setListe(null)
    db.annuaire({ villeCode: zone?.villeCode, type: type || undefined, recherche: recherche || undefined })
      .then(setListe)
      .catch(() => setListe([]))
  }, [zone?.villeCode, type, recherche])

  useEffect(() => {
    const i = setTimeout(charger, recherche ? 350 : 0)
    return () => clearTimeout(i)
  }, [charger, recherche])

  const avecDistance = useMemo(() => {
    if (!liste) return null
    return liste.map((p) => ({
      ...p,
      _d: position && p.lat != null ? distanceKm(position, { lat: p.lat, lng: p.lng }) : null,
    })).sort((a, b) => {
      if (a._d != null && b._d != null && Math.abs(a._d - b._d) > 0.2) return a._d - b._d
      return 0
    })
  }, [liste, position])

  const secours = (avecDistance || []).filter((p) => p.service_officiel)
  const soignants = (avecDistance || []).filter((p) => !p.service_officiel)
  const zoneTexte = libelleZone(geo, zone, nom)

  return (
    <div>
      <Entete titre={t('annuaire.titre')} sousTitre={zoneTexte || undefined} />

      {/* Filtres */}
      <div className="mb-3 space-y-2">
        <button onClick={() => naviguer('/zone?retour=/annuaire')}
                className="flex w-full items-center gap-2 rounded-xl border-2 border-sable-300 bg-white px-3 py-2.5 text-start">
          <span aria-hidden="true">📍</span>
          <span className="min-w-0 flex-1 truncate font-bold">{zoneTexte || t('accueil.choisirZone')}</span>
          <span className="shrink-0 text-[13px] font-bold text-nil-600 underline">{t('accueil.changerZone')}</span>
        </button>

        <input className="champ" placeholder={t('annuaire.recherche')}
               value={recherche} onChange={(e) => setRecherche(e.target.value)} />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Filtre actif={!type} onClick={() => setType('')}>{t('commun.tous')}</Filtre>
          {TYPES_PRO.filter((x) => !x.secours && x.cle !== 'autre').map((x) => (
            <Filtre key={x.cle} actif={type === x.cle} onClick={() => setType(x.cle)}>
              {x.emoji} {TYPE_LIBELLE(x.cle)}
            </Filtre>
          ))}
        </div>
      </div>

      {liste === null ? <Chargement /> : (
        <>
          {soignants.length === 0 && secours.length === 0 ? (
            <Vide emoji="🏥" titre={t('annuaire.aucun')} detail={t('annuaire.aucunConseil')}
                  action={<Lien vers="/aide"><Bouton variante="urgence">{t('accueil.aide')}</Bouton></Lien>} />
          ) : (
            <>
              {soignants.length > 0 && (
                <section className="mb-6">
                  <h2 className="mb-2 text-sm font-bold text-nil-900/60">{t('annuaire.soignants')}</h2>
                  <ul className="space-y-2">
                    {soignants.map((p) => (
                      <li key={p.id}>
                        <FichePro pro={p} distance={p._d} surSignaler={() => setSignalement(p)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {secours.length > 0 && (
                <section>
                  <h2 className="mb-2 text-sm font-bold text-nil-900/60">{t('annuaire.secours')}</h2>
                  <ul className="space-y-2">
                    {secours.map((p) => (
                      <li key={p.id}><FichePro pro={p} distance={p._d} /></li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}

      {!position && (
        <div className="si-donnees mt-4">
          <Bouton variante="secondaire" className="w-full"
                  onClick={() => positionActuelle().then(setPosition).catch(() => {})}>
            📍 {t('annuaire.triDistance')}
          </Bouton>
        </div>
      )}

      <ModaleSignalement pro={signalement} onFermer={() => setSignalement(null)} />
    </div>
  )
}

/* Libelles courts des filtres : volontairement hors des fichiers de
   traduction, car ce sont des pluriels d'interface tres courts. */
export function TYPE_LIBELLE(cle) {
  const libelles = {
    fr: { medecin: 'Médecins', infirmier: 'Infirmiers', sage_femme: 'Sages-femmes', pharmacie: 'Pharmacies', centre_sante: 'Centres' },
    ar: { medecin: 'أطباء', infirmier: 'ممرضون', sage_femme: 'قابلات', pharmacie: 'صيدليات', centre_sante: 'مراكز' },
  }
  const lang = document.documentElement.lang === 'ar' ? 'ar' : 'fr'
  return libelles[lang][cle] || cle
}

function Filtre({ actif, onClick, children }) {
  return (
    <button onClick={onClick} aria-pressed={actif}
            className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-sm font-bold
              ${actif ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white text-nil-700'}`}>
      {children}
    </button>
  )
}

export function ModaleSignalement({ pro, onFermer }) {
  const { t } = useLangue()
  const [motif, setMotif] = useState('faux')
  const [detail, setDetail] = useState('')
  const [envoye, setEnvoye] = useState(false)

  useEffect(() => { if (pro) { setEnvoye(false); setDetail(''); setMotif('faux') } }, [pro])

  const envoyer = async () => {
    await db.signaler({ cibleType: 'professionnel', cibleId: pro.id, motif, detail }).catch(() => {})
    setEnvoye(true)
  }

  return (
    <Modale ouverte={!!pro} onFermer={onFermer} titre={t('signal.titre')}>
      {envoye ? (
        <>
          <Alerte ton="succes">{t('signal.envoye')}</Alerte>
          <Bouton className="mt-4 w-full" onClick={onFermer}>{t('commun.fermer')}</Bouton>
        </>
      ) : (
        <>
          <p className="mb-3 font-bold">{pro?.nom}</p>
          <Champ etiquette={t('signal.motif')}>
            <Selecteur valeur={motif} onChange={setMotif} options={[
              { valeur: 'faux', libelle: t('signal.faux') },
              { valeur: 'abus', libelle: t('signal.abus') },
              { valeur: 'contenu', libelle: t('signal.contenu') },
              { valeur: 'autre', libelle: t('signal.autre') },
            ]} />
          </Champ>
          <Champ etiquette={t('signal.detail')}>
            <textarea className="champ" rows={3} maxLength={400} value={detail}
                      onChange={(e) => setDetail(e.target.value)} />
          </Champ>
          <Bouton className="w-full" onClick={envoyer}>{t('signal.envoyer')}</Bouton>
        </>
      )}
    </Modale>
  )
}
