/* =====================================================================
 * REFERENTIEL : CIRCONSCRIPTIONS ET FORMATIONS SANITAIRES
 * ---------------------------------------------------------------------
 * Le programme national de sante numerique (et l'autorite nationale,
 * et le super-administrateur) tient a jour la carte sanitaire :
 *   - les districts sanitaires (circonscriptions), par province
 *   - les formations sanitaires (centres de sante, hopitaux), rattachees
 *     a un district, avec leur position
 *   - le rattachement d'une ville a son district (c'est lui qui fait le
 *     lien entre une demande d'aide et le district dans les statistiques)
 * Les codes des nouvelles formations partent de 900 000 pour ne jamais
 * heurter les codes officiels du ministere.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { chargerGeo } from '../../lib/geo'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Vide, Modale, Case } from '../../components/base'

const TYPES_FS = ['CS', 'HD', 'HP', 'HR', 'HN', 'CL', 'PS', 'AUTRE']
const AFFILIATIONS = ['PUB', 'PRIV', 'CONF', 'ONG', 'MIL']

export default function SectionReferentiel() {
  const { t, nom } = useLangue()
  const [onglet, setOnglet] = useState('districts')
  const [geo, setGeo] = useState(null)
  const [districts, setDistricts] = useState(null)
  const [erreur, setErreur] = useState(null)
  useEffect(() => { chargerGeo().then(setGeo) }, [])
  const chargerDistricts = useCallback(() => db.adminDistricts().then(setDistricts).catch(() => setDistricts([])), [])
  useEffect(() => { chargerDistricts() }, [chargerDistricts])

  const lancer = async (promesse, apres) => {
    setErreur(null)
    try { await promesse; apres?.() }
    catch (e) { setErreur(/HORS_PERIMETRE|42501/.test(e?.message) ? t('admin.horsPerimetre') : (e?.message || t('commun.erreurReseau'))) }
  }

  return (
    <div className="mt-5 border-t border-sable-200 pt-4">
      <h3 className="mb-2 text-sm font-bold text-nil-900">{t('ref.titre')}</h3>
      <div className="mb-3"><Alerte ton="info">{t('ref.intro')}</Alerte></div>
      <div className="mb-3 flex gap-2">
        {['districts', 'formations', 'villes'].map((o) => (
          <button key={o} onClick={() => setOnglet(o)} aria-pressed={onglet === o}
                  className={`flex-1 rounded-full border-2 py-1.5 text-[13px] font-bold ${onglet === o ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>{t('ref.' + o)}</button>
        ))}
      </div>
      {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}
      {!geo || districts === null ? <Chargement /> : (
        <>
          {onglet === 'districts' && <Districts geo={geo} nom={nom} t={t} districts={districts} lancer={lancer} recharger={chargerDistricts} />}
          {onglet === 'formations' && <Formations geo={geo} nom={nom} t={t} districts={districts} lancer={lancer} />}
          {onglet === 'villes' && <Villes geo={geo} nom={nom} t={t} districts={districts} lancer={lancer} />}
        </>
      )}
    </div>
  )
}

function Districts({ geo, nom, t, districts, lancer, recharger }) {
  const [province, setProvince] = useState('')
  const [edition, setEdition] = useState(null)
  const liste = useMemo(() => districts.filter((d) => !province || d.province_code === province).sort((a, b) => a.nom.localeCompare(b.nom)), [districts, province])
  const ok = edition && edition.nom.trim().length >= 2 && edition.provinceCode
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <div className="grow"><Selecteur valeur={province} onChange={setProvince} placeholder={t('commun.tous')} options={geo.provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))} /></div>
        <Bouton onClick={() => setEdition({ nom: '', provinceCode: province, pcode: '' })}>➕ {t('ref.nouveauDistrict')}</Bouton>
      </div>
      <p className="aide mb-2 nombres-latins">{liste.length} {t('ref.districts').toLowerCase()}</p>
      <ul className="max-h-[24rem] space-y-1 overflow-y-auto">
        {liste.map((d) => (
          <li key={d.id}>
            <button onClick={() => setEdition({ id: d.id, nom: d.nom, provinceCode: d.province_code || '', pcode: d.pcode || '' })} className="carte block w-full p-2.5 text-start">
              <p className="text-sm font-bold">{d.nom}{d.corrige ? ' ✎' : ''}</p>
              <p className="aide">{d.province_nom || '—'}{d.pcode ? ` · ${d.pcode}` : ''} · #{d.id}</p>
            </button>
          </li>
        ))}
      </ul>
      <Modale ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? t('commun.modifier') : t('ref.nouveauDistrict')}>
        {edition && (
          <div>
            <Champ etiquette={t('ref.nomDistrict')} obligatoire><input className="champ" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} maxLength={120} /></Champ>
            <Champ etiquette={t('zone.province')} obligatoire>
              <Selecteur valeur={edition.provinceCode} onChange={(v) => setEdition({ ...edition, provinceCode: v })} placeholder="—" options={geo.provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))} />
            </Champ>
            <Champ etiquette={t('ref.pcode')} aide={t('ref.pcodeAide')}><input className="champ nombres-latins" value={edition.pcode} onChange={(e) => setEdition({ ...edition, pcode: e.target.value })} maxLength={20} /></Champ>
            <Bouton className="w-full" disabled={!ok} onClick={() => lancer(db.enregistrerDistrict(edition), () => { setEdition(null); recharger() })}>{t('commun.enregistrer')}</Bouton>
            <p className="aide mt-2">{t('ref.journal')}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}

function Formations({ geo, nom, t, districts, lancer }) {
  const [district, setDistrict] = useState('')
  const [recherche, setRecherche] = useState('')
  const [liste, setListe] = useState(null)
  const [edition, setEdition] = useState(null)
  const charger = useCallback(() => {
    if (!district && recherche.trim().length < 2) { setListe([]); return }
    setListe(null)
    db.adminFormations({ districtId: district || undefined, recherche: recherche.trim() || undefined }).then(setListe).catch(() => setListe([]))
  }, [district, recherche])
  useEffect(() => { const id = setTimeout(charger, 300); return () => clearTimeout(id) }, [charger])
  const nomDistrict = (id) => districts.find((d) => d.id === id)?.nom || (id ? '#' + id : '—')
  const ok = edition && edition.nom.trim().length >= 2 && edition.district_id
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Selecteur valeur={district} onChange={setDistrict} placeholder={t('ref.choisirDistrict')} options={[...districts].sort((a, b) => a.nom.localeCompare(b.nom)).map((d) => ({ valeur: String(d.id), libelle: `${d.nom} (${d.province_nom || '—'})` }))} />
        <input className="champ" placeholder={t('commun.rechercher')} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </div>
      <Bouton className="mb-3 w-full" onClick={() => setEdition({ nom: '', type: 'CS', affiliation: 'PUB', fonctionnelle: 1, lat: '', lng: '', district_id: district || '' })}>➕ {t('ref.nouvelleFormation')}</Bouton>
      {liste === null ? <Chargement /> : liste.length === 0 ? (
        <Vide emoji="🏥" titre={t('ref.aucuneFormation')} detail={t('ref.aucuneFormationDetail')} />
      ) : (
        <ul className="max-h-[24rem] space-y-1 overflow-y-auto">
          {liste.map((f) => (
            <li key={f.code_msp}>
              <button onClick={() => setEdition({ ...f, lat: f.lat ?? '', lng: f.lng ?? '', district_id: f.district_id || '' })} className="carte block w-full p-2.5 text-start">
                <p className="text-sm font-bold">{f.nom} <span className="puce bg-sable-100">{f.type}</span>{f.fonctionnelle ? '' : ' · ' + t('ref.nonFonctionnelle')}</p>
                <p className="aide">{nomDistrict(f.district_id)} · {f.affiliation} · #{f.code_msp}{f.source === 'cms' ? ' ✎' : ''}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modale ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.code_msp ? t('commun.modifier') : t('ref.nouvelleFormation')}>
        {edition && (
          <div>
            <Champ etiquette={t('ref.nomFormation')} obligatoire><input className="champ" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} maxLength={160} /></Champ>
            <div className="grid grid-cols-2 gap-2">
              <Champ etiquette={t('ref.typeFormation')}>
                <Selecteur valeur={edition.type} onChange={(v) => setEdition({ ...edition, type: v })} options={TYPES_FS.map((x) => ({ valeur: x, libelle: t('ref.typeFs.' + x) }))} />
              </Champ>
              <Champ etiquette={t('ref.affiliation')}>
                <Selecteur valeur={edition.affiliation} onChange={(v) => setEdition({ ...edition, affiliation: v })} options={AFFILIATIONS.map((x) => ({ valeur: x, libelle: t('ref.affil.' + x) }))} />
              </Champ>
            </div>
            <Champ etiquette={t('ref.district')} obligatoire>
              <Selecteur valeur={String(edition.district_id || '')} onChange={(v) => setEdition({ ...edition, district_id: v })} placeholder="—"
                         options={[...districts].sort((a, b) => a.nom.localeCompare(b.nom)).map((d) => ({ valeur: String(d.id), libelle: `${d.nom} (${d.province_nom || '—'})` }))} />
            </Champ>
            <div className="grid grid-cols-2 gap-2">
              <Champ etiquette="Latitude"><input className="champ nombres-latins" inputMode="decimal" value={edition.lat} onChange={(e) => setEdition({ ...edition, lat: e.target.value })} placeholder="12.11" /></Champ>
              <Champ etiquette="Longitude"><input className="champ nombres-latins" inputMode="decimal" value={edition.lng} onChange={(e) => setEdition({ ...edition, lng: e.target.value })} placeholder="15.04" /></Champ>
            </div>
            <Champ><Case coche={!!Number(edition.fonctionnelle)} onChange={(v) => setEdition({ ...edition, fonctionnelle: v ? 1 : 0 })}>{t('ref.fonctionnelle')}</Case></Champ>
            <Bouton className="w-full" disabled={!ok} onClick={() => lancer(db.enregistrerFormation(edition), () => { setEdition(null); charger() })}>{t('commun.enregistrer')}</Bouton>
            <p className="aide mt-2">{t('ref.journal')}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}

function Villes({ geo, nom, t, districts, lancer }) {
  const [province, setProvince] = useState('')
  const [ville, setVille] = useState('')
  const [district, setDistrict] = useState('')
  const [ok, setOk] = useState(false)
  const villes = useMemo(() => (province ? geo.provinces.find((p) => p.code === province)?.cities || [] : []), [geo, province])
  const dists = useMemo(() => districts.filter((d) => !province || d.province_code === province).sort((a, b) => a.nom.localeCompare(b.nom)), [districts, province])
  return (
    <div>
      <p className="aide mb-2">{t('ref.villesIntro')}</p>
      <Champ etiquette={t('zone.province')}><Selecteur valeur={province} onChange={(v) => { setProvince(v); setVille(''); setOk(false) }} placeholder="—" options={geo.provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))} /></Champ>
      <Champ etiquette={t('zone.ville')}><Selecteur valeur={ville} onChange={(v) => { setVille(v); setOk(false) }} placeholder="—" options={villes.map((v) => ({ valeur: v.code, libelle: nom(v) }))} disabled={!province} /></Champ>
      <Champ etiquette={t('ref.district')}><Selecteur valeur={district} onChange={setDistrict} placeholder="—" options={dists.map((d) => ({ valeur: String(d.id), libelle: d.nom }))} disabled={!ville} /></Champ>
      {ok && <div className="mb-2"><Alerte ton="succes">{t('commun.enregistrer')} ✓</Alerte></div>}
      <Bouton className="w-full" disabled={!ville || !district} onClick={() => lancer(db.majVilleDistrict(ville, district), () => setOk(true))}>{t('ref.rattacher')}</Bouton>
      <p className="aide mt-3">{t('ref.villesNote')}</p>
    </div>
  )
}
