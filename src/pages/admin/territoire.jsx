/* =====================================================================
 * TERRITOIRE : regions, villes, districts et formations sanitaires
 * ---------------------------------------------------------------------
 * Le super-administrateur, le programme national, l'autorite nationale
 * et les deux Ordres tiennent a jour la carte du pays telle que
 * l'application la connait :
 *   - les regions (table provinces) : creation et correction, jamais de
 *     suppression depuis un navigateur ;
 *   - les villes : creation, correction, chef-lieu, position, district ;
 *   - les districts sanitaires et les formations sanitaires (ecrans du
 *     referentiel, partages avec l'ecran Sante) ;
 *   - le rattachement d'une ville a son district.
 * Les listes viennent de la base, pas du fichier embarque : une region
 * creee ici est visible partout des le rafraichissement suivant.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Modale, Case } from '../../components/base'
import { Districts, Formations, RattachementVilles } from './referentiel'

const ONGLETS = ['regions', 'villes', 'districts', 'formations', 'rattachement']

export default function SectionTerritoire({ requete }) {
  const { t, nom } = useLangue()
  const demande = requete?.get?.('onglet')
  const [onglet, setOnglet] = useState(ONGLETS.includes(demande) ? demande : 'regions')
  const [provinces, setProvinces] = useState(null)
  const [villes, setVilles] = useState([])
  const [districts, setDistricts] = useState(null)
  const [erreur, setErreur] = useState(null)

  const chargerProvinces = useCallback(() => Promise.all([db.adminProvinces(), db.adminVilles()])
    .then(([p, v]) => { setProvinces(p); setVilles(v) }).catch(() => setProvinces([])), [])
  const chargerDistricts = useCallback(() => db.adminDistricts().then(setDistricts).catch(() => setDistricts([])), [])
  useEffect(() => { chargerProvinces(); chargerDistricts() }, [chargerProvinces, chargerDistricts])
  useEffect(() => { if (ONGLETS.includes(demande)) setOnglet(demande) }, [demande])

  const lancer = async (promesse, apres) => {
    setErreur(null)
    try { await promesse; apres?.() }
    catch (e) {
      const m = e?.message || ''
      setErreur(/HORS_PERIMETRE|42501/.test(m) ? t('admin.horsPerimetre')
        : /CODE_REGION/.test(m) ? t('terr.codeInvalide')
        : /duplicate|23505/.test(m) ? t('terr.codeExistant')
        : (m || t('commun.erreurReseau')))
    }
  }

  /* Les ecrans du referentiel attendent la forme du fichier geo.json
     (provinces[].code, .cities) : on la reconstruit depuis la base. */
  const geo = useMemo(() => {
    if (!provinces) return null
    return { provinces: provinces.map((p) => ({ ...p, fr: p.nom_fr, ar: p.nom_ar, cities: villes.filter((v) => v.province_id === p.id).map((v) => ({ ...v, fr: v.nom_fr, ar: v.nom_ar })) })) }
  }, [provinces, villes])

  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('terr.intro')}</Alerte></div>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {ONGLETS.map((o) => (
          <button key={o} onClick={() => setOnglet(o)} aria-pressed={onglet === o}
                  className={`shrink-0 rounded-full border-2 px-3 py-1.5 text-[13px] font-bold ${onglet === o ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
            {t('terr.' + o)}
          </button>
        ))}
      </div>
      {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}
      {!provinces || districts === null ? <Chargement /> : (
        <>
          {onglet === 'regions' && <Regions provinces={provinces} nom={nom} t={t} lancer={lancer} recharger={chargerProvinces} />}
          {onglet === 'villes' && <Villes provinces={provinces} toutes={villes} districts={districts} nom={nom} t={t} lancer={lancer} recharger={chargerProvinces} />}
          {onglet === 'districts' && <Districts geo={geo} nom={nom} t={t} districts={districts} lancer={lancer} recharger={chargerDistricts} />}
          {onglet === 'formations' && <Formations geo={geo} nom={nom} t={t} districts={districts} lancer={lancer} />}
          {onglet === 'rattachement' && <RattachementVilles geo={geo} districts={districts} nom={nom} t={t} lancer={lancer} />}
        </>
      )}
    </div>
  )
}

/* ---------------- Regions (provinces) -------------------------------- */
function Regions({ provinces, nom, t, lancer, recharger }) {
  const [edition, setEdition] = useState(null)
  const liste = useMemo(() => [...provinces].sort((a, b) => (a.ordre ?? 100) - (b.ordre ?? 100) || a.nom_fr.localeCompare(b.nom_fr)), [provinces])
  const ok = edition && edition.nom.trim().length >= 2 && /^[A-Za-z0-9]{2,6}$/.test(edition.code.trim())
  return (
    <div>
      <Bouton className="mb-3 w-full" onClick={() => setEdition({ code: '', nom: '', nomAr: '', ordre: '' })}>➕ {t('terr.nouvelleRegion')}</Bouton>
      <p className="aide mb-2 nombres-latins">{liste.length} {t('terr.regions').toLowerCase()}</p>
      <ul className="space-y-1">
        {liste.map((p) => (
          <li key={p.id}>
            <button onClick={() => setEdition({ id: p.id, code: p.code, nom: p.nom_fr, nomAr: p.nom_ar || '', ordre: p.ordre ?? '' })} className="carte block w-full p-2.5 text-start">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{nom(p)}</p>
                <span className="puce bg-sable-100 text-nil-900/60 nombres-latins">{p.code}</span>
              </div>
              <p className="aide nombres-latins">{p.nom_ar ? p.nom_ar + ' · ' : ''}{t('terr.nbVilles', { n: p.nb_villes ?? 0 })}</p>
            </button>
          </li>
        ))}
      </ul>
      <Modale ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? t('commun.modifier') : t('terr.nouvelleRegion')}>
        {edition && (
          <div>
            <Champ etiquette={t('terr.nomRegion')} obligatoire><input className="champ" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} maxLength={80} /></Champ>
            <Champ etiquette={t('terr.nomArabe')}><input className="champ" dir="rtl" value={edition.nomAr} onChange={(e) => setEdition({ ...edition, nomAr: e.target.value })} maxLength={80} /></Champ>
            <div className="grid grid-cols-2 gap-2">
              <Champ etiquette={t('terr.code')} aide={t('terr.codeAide')} obligatoire>
                <input className="champ nombres-latins uppercase" value={edition.code} onChange={(e) => setEdition({ ...edition, code: e.target.value.toUpperCase() })} maxLength={6} disabled={!!edition.id} />
              </Champ>
              <Champ etiquette={t('terr.ordre')} aide={t('terr.ordreAide')}>
                <input className="champ nombres-latins" inputMode="numeric" value={edition.ordre} onChange={(e) => setEdition({ ...edition, ordre: e.target.value.replace(/\D/g, '') })} />
              </Champ>
            </div>
            <Bouton className="w-full" disabled={!ok} onClick={() => lancer(db.enregistrerProvince(edition), () => { setEdition(null); recharger() })}>{t('commun.enregistrer')}</Bouton>
            <p className="aide mt-2">{t('terr.pasDeSuppression')}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}

/* ---------------- Villes ---------------------------------------------- */
function Villes({ provinces, toutes, districts, nom, t, lancer, recharger }) {
  const [province, setProvince] = useState('')
  const [edition, setEdition] = useState(null)
  const villes = useMemo(() => {
    const pid = provinces.find((p) => p.code === province)?.id
    return toutes.filter((v) => !pid || v.province_id === pid).sort((a, b) => (b.chef_lieu ? 1 : 0) - (a.chef_lieu ? 1 : 0) || a.nom_fr.localeCompare(b.nom_fr))
  }, [toutes, provinces, province])

  const dists = useMemo(() => {
    const pid = provinces.find((p) => p.code === (edition?.provinceCode || province))?.id
    return districts.filter((d) => !pid || d.province_id === pid).sort((a, b) => a.nom.localeCompare(b.nom))
  }, [districts, provinces, province, edition?.provinceCode])
  const ok = edition && edition.nom.trim().length >= 2 && edition.provinceCode
  const nomDistrict = (id) => districts.find((d) => d.id === id)?.nom || null

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="grow"><Selecteur valeur={province} onChange={setProvince} placeholder={t('commun.tous')} options={provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))} /></div>
        <Bouton onClick={() => setEdition({ provinceCode: province, nom: '', nomAr: '', lat: '', lng: '', chefLieu: false, districtId: '' })}>➕ {t('terr.nouvelleVille')}</Bouton>
      </div>
      {(
        <>
          <p className="aide mb-2 nombres-latins">{villes.length} {t('terr.villes').toLowerCase()}</p>
          <ul className="max-h-[26rem] space-y-1 overflow-y-auto">
            {villes.slice(0, 300).map((v) => (
              <li key={v.id}>
                <button onClick={() => setEdition({ id: v.id, provinceCode: provinces.find((p) => p.id === v.province_id)?.code || '', nom: v.nom_fr, nomAr: v.nom_ar || '', lat: v.lat ?? '', lng: v.lng ?? '', chefLieu: !!v.chef_lieu, districtId: v.district_id || '' })}
                        className="carte block w-full p-2.5 text-start">
                  <p className="text-sm font-bold">{nom(v)}{v.chef_lieu ? ' ★' : ''}</p>
                  <p className="aide">{nomDistrict(v.district_id) || t('terr.sansDistrict')} · <span className="nombres-latins">{v.code}</span></p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Modale ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? t('commun.modifier') : t('terr.nouvelleVille')}>
        {edition && (
          <div>
            <Champ etiquette={t('zone.province')} obligatoire>
              <Selecteur valeur={edition.provinceCode} onChange={(v) => setEdition({ ...edition, provinceCode: v, districtId: '' })} placeholder="—" options={provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))} />
            </Champ>
            <Champ etiquette={t('terr.nomVille')} obligatoire><input className="champ" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} maxLength={80} /></Champ>
            <Champ etiquette={t('terr.nomArabe')}><input className="champ" dir="rtl" value={edition.nomAr} onChange={(e) => setEdition({ ...edition, nomAr: e.target.value })} maxLength={80} /></Champ>
            <div className="grid grid-cols-2 gap-2">
              <Champ etiquette="Latitude"><input className="champ nombres-latins" inputMode="decimal" value={edition.lat} onChange={(e) => setEdition({ ...edition, lat: e.target.value })} placeholder="12.11" /></Champ>
              <Champ etiquette="Longitude"><input className="champ nombres-latins" inputMode="decimal" value={edition.lng} onChange={(e) => setEdition({ ...edition, lng: e.target.value })} placeholder="15.04" /></Champ>
            </div>
            <Champ etiquette={t('ref.district')}>
              <Selecteur valeur={String(edition.districtId || '')} onChange={(v) => setEdition({ ...edition, districtId: v })} placeholder="—" options={dists.map((d) => ({ valeur: String(d.id), libelle: d.nom }))} />
            </Champ>
            <Champ><Case coche={!!edition.chefLieu} onChange={(v) => setEdition({ ...edition, chefLieu: v })}>{t('terr.chefLieu')}</Case></Champ>
            <Bouton className="w-full" disabled={!ok} onClick={() => lancer(db.enregistrerVille(edition), () => { setEdition(null); recharger() })}>{t('commun.enregistrer')}</Bouton>
            <p className="aide mt-2">{t('ref.journal')}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}
