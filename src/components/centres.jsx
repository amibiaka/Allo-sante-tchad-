/* Centres de sante et hopitaux (liste officielle du ministere, 2020).
   Deux entrees : la position du telephone (les plus proches, avec la
   distance) ou, sans GPS, le district de la ville choisie. Fonctionne
   hors ligne une fois la liste chargee. */
import { useEffect, useMemo, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { chargerSante, plusProches, formationsDuDistrict, districtPourVille, libelleType, libelleAffiliation } from '../lib/sante'
import { positionActuelle } from '../lib/geo'
import { lienItineraire } from '../lib/links'
import { Bouton, Chargement, Vide, Alerte } from '../components/base'

const EMOJI = { CS: '🏠', HD: '🏥', HP: '🏥', HN: '🏛️' }

export function ListeCentres({ zone, villeNom, hopitauxSeuls = false, compact = false, maxi = 15 }) {
  const { t } = useLangue()
  const [sante, setSante] = useState(null)
  const [position, setPosition] = useState(null)
  const [etatGps, setEtatGps] = useState('repos')
  const [tous, setTous] = useState(false)

  useEffect(() => { chargerSante().then(setSante).catch(() => setSante(false)) }, [])

  const localiser = () => {
    setEtatGps('encours')
    positionActuelle().then((p) => { setPosition(p); setEtatGps('ok') }).catch(() => setEtatGps('echec'))
  }

  const nomV = villeNom || zone?.libelle?.split(',').pop()?.trim() || null

  const liste = useMemo(() => {
    if (!sante) return null
    const types = hopitauxSeuls ? ['HD', 'HP', 'HN'] : null
    if (position) return plusProches(sante, position, { types, n: tous ? 40 : maxi })
    const d = districtPourVille(sante, nomV)
    if (!d) return []
    return formationsDuDistrict(sante, d.id).filter((f) => !types || types.includes(f.type)).slice(0, tous ? 200 : maxi)
  }, [sante, position, nomV, hopitauxSeuls, tous, maxi])

  if (sante === null) return <Chargement />
  if (sante === false) return <Alerte ton="attention">{t('commun.erreurReseau')}</Alerte>

  const district = !position && nomV ? districtPourVille(sante, nomV) : null

  return (
    <div>
      {!compact && (
        <p className="aide mb-2">
          {position ? t('centres.triPosition') : district ? t('centres.triDistrict', { d: district.nom }) : t('centres.choisirZone')}
          {' · '}<span className="opacity-70">{t('centres.source')}</span>
        </p>
      )}
      {!position && (
        <Bouton variante="secondaire" className="mb-3 w-full" onClick={localiser} enCours={etatGps === 'encours'}>
          📍 {etatGps === 'echec' ? t('zone.detectionEchec') : t('centres.autourDeMoi')}
        </Bouton>
      )}
      {liste.length === 0 ? (
        <Vide emoji="🏥" titre={t('centres.aucun')} detail={t('centres.aucunDetail')} />
      ) : (
        <ul className="space-y-2">
          {liste.map((f) => <FicheCentre key={f.code} f={f} sante={sante} t={t} />)}
        </ul>
      )}
      {liste.length >= maxi && !tous && (
        <button className="lien mt-3 block w-full text-center text-sm" onClick={() => setTous(true)}>{t('commun.voirPlus')}</button>
      )}
    </div>
  )
}

function FicheCentre({ f, sante, t }) {
  return (
    <li className="carte p-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">{EMOJI[f.type] || '🏥'}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">{f.nom}</p>
          <p className="aide">
            {libelleType(sante, f.type)} · {libelleAffiliation(sante, f.affiliation)}
            {f.district ? ` · ${t('centres.district')} ${f.district.nom}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {f.distance != null && <span className="puce bg-nil-50 text-nil-700 nombres-latins">📍 {f.distance < 1 ? Math.round(f.distance * 1000) + ' m' : f.distance.toFixed(f.distance < 10 ? 1 : 0) + ' km'}</span>}
            {f.fonctionnelle !== 1 && <span className="puce bg-soleil-100 text-soleil-700">{sante.fonctionnalite[f.fonctionnelle]}</span>}
          </div>
        </div>
        <a href={lienItineraire({ lat: f.lat, lng: f.lng, libelle: f.nom })} target="_blank" rel="noopener noreferrer"
           className="shrink-0 rounded-xl border-2 border-sable-300 bg-white px-3 py-2 text-sm font-bold text-nil-700">
          🧭 {t('centres.itineraire')}
        </a>
      </div>
    </li>
  )
}
