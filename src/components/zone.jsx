/* Choix province -> ville -> quartier.
   Regle de conception : le GPS est un bonus, jamais une condition. Au
   Tchad la plupart des quartiers n'ont pas d'adresse formelle : le
   couple ville + repere decrit a la main reste la reference. */
import { useEffect, useRef, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { chargerGeo, grouperQuartiers, positionActuelle, villeLaPlusProche, villeParCode, detecterZone } from '../lib/geo'
import { Champ, Selecteur, Bouton, Alerte, Chargement } from './base'
import { Icone } from './pro'

export function useGeo() {
  const [geo, setGeo] = useState(null)
  useEffect(() => { let vif = true; chargerGeo().then((g) => vif && setGeo(g)); return () => { vif = false } }, [])
  return geo
}

export function SelecteurZone({ valeur, onChange, avecQuartier = true, avecGps = true, erreur }) {
  const { t, nom, langue } = useLangue()
  const geo = useGeo()
  const [gps, setGps] = useState({ etat: 'repos' })
  const [autreQuartier, setAutreQuartier] = useState(!!valeur?.quartierLibre)
  const [autreVille, setAutreVille] = useState(!!valeur?.villeLibre)
  const dejaTente = useRef(false)

  /* Si le telephone a deja accorde la localisation, on remplit la zone
     tout seul : le patient n'a plus qu'a preciser son quartier. Aucune
     demande de permission n'est declenchee ici. */
  useEffect(() => {
    if (!avecGps || dejaTente.current || valeur?.villeCode) return
    dejaTente.current = true
    let vif = true
    detecterZone().then((r) => {
      if (!vif || r.etat !== 'ok') return
      setGps({ etat: 'ok', ville: r.ville, precision: r.position.precision, auto: true, incertain: r.incertain, distance: r.distance })
      onChange({ ...valeur, ...r.zone })
    }).catch(() => {})
    return () => { vif = false }
  }, [avecGps, valeur?.villeCode])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!geo) return <Chargement />

  const province = geo.provinces.find((p) => p.code === valeur?.provinceCode) || null
  const ville = province?.cities.find((v) => v.code === valeur?.villeCode) || null
  const groupes = ville ? grouperQuartiers(geo, ville) : []

  /* Chaque changement recalcule le libelle lisible et le range dans la
     zone : l'accueil peut alors l'afficher sans charger le referentiel. */
  const maj = (patch) => {
    const z = { ...valeur, ...patch }
    const p = geo.provinces.find((x) => x.code === z.provinceCode)
    const v = p?.cities.find((x) => x.code === z.villeCode)
    z.libelle = [z.quartierNom || z.quartierLibre, z.villeLibre || (v ? nom(v) : null)]
      .filter(Boolean).join(', ') || null
    onChange(z)
  }

  const localiser = async () => {
    setGps({ etat: 'encours' })
    const r = await detecterZone({ forcer: true })
    if (r.etat !== 'ok') return setGps({ etat: 'erreur', raison: r.etat })
    setGps({
      etat: 'ok', ville: r.ville, precision: r.position.precision,
      incertain: r.incertain, distance: r.distance,
    })
    maj({ ...r.zone })
  }

  return (
    <div>
      <Champ etiquette={t('zone.province')} obligatoire>
        <Selecteur
          placeholder={t('zone.choisirProvince')}
          valeur={valeur?.provinceCode}
          onChange={(v) => { maj({ provinceCode: v, villeCode: '', quartierNom: '', quartierLibre: '' }); setAutreVille(false) }}
          options={geo.provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))}
        />
      </Champ>

      {province && (
        <Champ etiquette={t('zone.ville')} obligatoire erreur={erreur}>
          <Selecteur
            placeholder={t('zone.choisirVille')}
            valeur={autreVille ? '__autre' : valeur?.villeCode}
            onChange={(v) => {
              if (v === '__autre') { setAutreVille(true); maj({ villeCode: province.cities[0]?.code, quartierNom: '' }) }
              else { setAutreVille(false); maj({ villeCode: v, villeLibre: '', quartierNom: '', quartierLibre: '' }) }
            }}
            options={[
              ...province.cities.map((v) => ({ valeur: v.code, libelle: nom(v) + (v.cl ? '' : '') })),
              { valeur: '__autre', libelle: t('zone.autreVille') },
            ]}
          />
          {autreVille && (
            <input className="champ mt-2" placeholder={t('zone.autreVillePlaceholder')}
                   value={valeur?.villeLibre || ''} maxLength={60}
                   onChange={(e) => maj({ villeLibre: e.target.value })} />
          )}
        </Champ>
      )}

      {avecQuartier && ville && !autreVille && (
        <Champ etiquette={t('zone.quartier')}
               aide={groupes.length ? null : t('zone.aucunQuartier')}>
          {groupes.length > 0 && (
            <select
              className="champ"
              value={autreQuartier ? '__autre' : (valeur?.quartierNom || '')}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__autre') { setAutreQuartier(true); maj({ quartierNom: '' }) }
                else { setAutreQuartier(false); maj({ quartierNom: v, quartierLibre: '' }) }
              }}
            >
              <option value="">{t('zone.choisirQuartier')}</option>
              {groupes.map((g) => (
                g.libelle
                  ? <optgroup key={g.cle} label={langue === 'ar' ? g.libelle.ar : g.libelle.fr}>
                      {g.items.map((q) => <option key={q.fr} value={q.fr}>{q.fr}</option>)}
                    </optgroup>
                  : g.items.map((q) => <option key={q.fr} value={q.fr}>{q.fr}</option>)
              ))}
              <option value="__autre">{t('zone.autreQuartier')}</option>
            </select>
          )}
          {(autreQuartier || !groupes.length) && (
            <>
              <input className="champ mt-2" placeholder={t('zone.autreQuartierPlaceholder')}
                     value={valeur?.quartierLibre || ''} maxLength={60}
                     onChange={(e) => maj({ quartierLibre: e.target.value })} />
              <p className="aide mt-1.5">{t('zone.suggestion')}</p>
            </>
          )}
        </Champ>
      )}

      {avecGps && (
        <div>
          {gps.etat !== 'ok' ? (
            <Bouton variante="secondaire" className="w-full" onClick={localiser}
                    enCours={gps.etat === 'encours'} icone={<Icone nom="gps" />}>
              {gps.etat === 'encours' ? t('zone.detectionEnCours') : t('zone.detecterAuto')}
            </Bouton>
          ) : (
            <Alerte ton={gps.incertain ? 'attention' : 'succes'}>
              {gps.incertain
                ? t('zone.detecteIncertain', { km: Math.round(gps.distance), ville: nom(gps.ville) })
                : t('zone.detecte', { ville: nom(gps.ville) })}
              <button className="ms-2 underline"
                      onClick={() => { setGps({ etat: 'repos' }); maj({ lat: null, lng: null }) }}>
                {t('zone.detecteCorriger')}
              </button>
            </Alerte>
          )}
          {gps.etat === 'erreur' && (
            <p className="aide mt-1.5">
              {gps.raison === 'denied' ? t('zone.detectionRefusee')
                : gps.raison === 'indisponible' ? t('zone.detectionIndisponible')
                : t('zone.detectionEchec')}
            </p>
          )}
        </div>
      )}

      <p className="aide mt-3">{t('zone.obligatoire')}</p>
    </div>
  )
}

/* Resume court d'une zone, pour l'accueil et les entetes. */
export function libelleZone(geo, zone, nomFn) {
  if (zone?.libelle && !geo) return zone.libelle
  if (!geo || !zone?.villeCode) return zone?.libelle || null
  const v = villeParCode(geo, zone.villeCode)
  if (!v) return null
  const morceaux = [zone.quartierNom || zone.quartierLibre, zone.villeLibre || nomFn(v)]
  return morceaux.filter(Boolean).join(', ')
}
