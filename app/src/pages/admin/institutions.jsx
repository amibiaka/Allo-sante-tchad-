/* =====================================================================
 * BACK-OFFICE INSTITUTIONNEL
 * Les ecrans que le ministere, les delegations provinciales, l'Ordre
 * des medecins, l'Ordre des pharmaciens et le centre national de sante
 * numerique utilisent pour gouverner la plateforme :
 *   - TableauInstitution : les chiffres du jour et ou cliquer
 *   - SectionValidations : verifier, prolonger, suspendre, refuser un
 *     soignant (chacun ne voit que ce qu'il a le droit de valider)
 *   - SectionPublications : actualites, directives, alertes
 *   - SectionCampagnes    : campagnes de vaccination
 *   - SectionAlertes      : signalements communautaires a trier
 *   - SectionSante        : referentiel des districts et formations
 * Chaque decision passe par une fonction SQL qui verifie le role de
 * l'appelant et l'inscrit au journal : l'ecran n'est qu'une fenetre.
 * ===================================================================== */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { CONFIG } from '../../lib/config'
import { chargerGeo } from '../../lib/geo'
import { CALENDRIER } from '../../lib/vaccins'
import { ilYA, dateCourte, joursRestants, versCSV, telechargerTexte } from '../../lib/format'
import { naviguer } from '../../lib/router'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Vide, Modale, Case } from '../../components/base'
import { BadgePro } from '../../components/pro'

function useAction() {
  const { t } = useLangue()
  const [erreur, setErreur] = useState(null)
  const lancer = async (promesse, apres) => {
    setErreur(null)
    try { await promesse; apres?.() }
    catch (e) { setErreur(/HORS_PERIMETRE|42501/.test(e?.message) ? t('admin.horsPerimetre') : t('commun.erreurReseau')) }
  }
  const Message = () => erreur ? <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div> : null
  return { lancer, Message }
}

const jourFR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')

/* =================== TABLEAU ======================================= */
export function TableauInstitution({ session }) {
  const { t } = useLangue()
  const [s, setS] = useState(null)
  const base = '/' + CONFIG.cheminAdmin
  useEffect(() => { db.institutionStats().then(setS).catch(() => setS({})) }, [])
  if (!s) return <Chargement />
  const role = session.profil.role
  const K = ({ v, l, vers, ton }) => (
    <button onClick={() => naviguer(base + vers)} className={`rounded-xl border-2 p-3 text-start ${ton === 'attention' && v ? 'border-soleil-300 bg-soleil-100 text-soleil-700' : 'border-sable-300 bg-white'}`}>
      <p className="text-2xl font-black nombres-latins">{v ?? 0}</p>
      <p className="text-[12px] leading-tight opacity-70">{l}</p>
    </button>
  )
  /* Les tuiles de pilotage (comptes, soignants, communication,
     territoire, donnees) sont au-dessus, dans <Pilotage/> ; ici ne
     restent que les chiffres du jour propres au perimetre. */
  return (
    <div>
      <h2 className="mb-1.5 text-sm font-bold text-nil-900/60">📅 {t('inst.kpi.titre')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {['autorite_nationale', 'autorite_provinciale', 'super_admin', 'centre_numerique'].includes(role) && (
          <K v={s.evenements_nouveaux} l={t('inst.kpi.evenements')} vers="/alertes" ton="attention" />)}
        <K v={s.cas_ouverts} l={t('inst.kpi.casOuverts')} vers="/statistiques" />
        <K v={s.doses_declarees_30j} l={t('inst.kpi.doses')} vers="/statistiques" />
      </div>
    </div>
  )
}

/* =================== VALIDATIONS =================================== */
export function SectionValidations() {
  const { t, langue } = useLangue()
  const { lancer, Message } = useAction()
  const [statut, setStatut] = useState('provisoire')
  const [liste, setListe] = useState(null)
  const [choisi, setChoisi] = useState(null)
  const [note, setNote] = useState('')

  const charger = useCallback(() => { setListe(null); db.prosAValider(statut).then(setListe).catch(() => setListe([])) }, [statut])
  useEffect(() => { charger() }, [charger])

  const decider = (decision) => lancer(db.validerPro(choisi.id, decision, note.trim() || null), () => { setChoisi(null); setNote(''); charger() })

  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('inst.validationsIntro')}</Alerte></div>
      <div className="mb-3 flex gap-2">
        {[['provisoire', t('inst.enAttente')], ['verifie', t('badge.verifie')], ['suspendu', t('admin.suspendre')], ['expire', t('badge.expire')]].map(([v, l]) => (
          <button key={v} onClick={() => setStatut(v)} aria-pressed={statut === v}
                  className={`flex-1 rounded-full border-2 py-1.5 text-[13px] font-bold ${statut === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>{l}</button>
        ))}
      </div>
      <Message />
      {liste === null ? <Chargement /> : liste.length === 0 ? (
        <Vide emoji="✅" titre={t('inst.rienAValider')} detail={t('inst.rienAValiderDetail')} />
      ) : (
        <ul className="space-y-2">
          {liste.map((p) => (
            <li key={p.id}>
              <button onClick={() => { setChoisi(p); setNote(p.note_admin || '') }} className="carte block w-full p-3 text-start">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{p.nom}</p>
                  <BadgePro pro={p} court />
                </div>
                <p className="aide">{t('typePro.' + p.type)}{p.specialite ? ` · ${p.specialite}` : ''} · {[p.quartier_nom, p.ville_nom || p.province_nom].filter(Boolean).join(', ')}</p>
                <p className="aide nombres-latins" dir="ltr">{p.telephone}{p.probation_fin && statut === 'provisoire' ? ` · ${t('admin.kpi.aVerifier')} : ${joursRestants(p.probation_fin) ?? 0} j` : ''} · {ilYA(p.created_at, langue)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!choisi} onFermer={() => setChoisi(null)} titre={choisi?.nom || ''}>
        {choisi && (
          <div>
            <p className="text-sm">{t('typePro.' + choisi.type)}{choisi.specialite ? ` · ${choisi.specialite}` : ''}</p>
            <p className="aide">{[choisi.adresse_texte, choisi.quartier_nom, choisi.ville_nom, choisi.province_nom].filter(Boolean).join(' · ')}</p>
            <p className="aide nombres-latins" dir="ltr">📞 {choisi.telephone}{choisi.whatsapp ? ` · 💬 ${choisi.whatsapp}` : ''}</p>
            <p className="aide">{t('inst.inscritLe')} {dateCourte(choisi.created_at, langue)}{choisi.verifie_le ? ` · ${t('inst.decideLe')} ${dateCourte(choisi.verifie_le, langue)}` : ''}</p>
            <Champ etiquette={t('admin.noteAdmin')} aide={t('inst.noteAide')}>
              <textarea className="champ min-h-[4rem]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Champ>
            <div className="grid grid-cols-2 gap-2">
              <Bouton variante="succes" onClick={() => decider('verifie')}>✅ {t('admin.verifier')}</Bouton>
              <Bouton variante="secondaire" onClick={() => decider('prolonge')}>⏳ {t('admin.prolonger')}</Bouton>
              <Bouton variante="danger" onClick={() => decider('suspendu')}>⏸ {t('admin.suspendre')}</Bouton>
              <Bouton variante="danger" onClick={() => decider('refuse')}>✕ {t('admin.refuser')}</Bouton>
            </div>
            <p className="aide mt-3">{t('inst.decisionJournal')}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}

/* =================== PUBLICATIONS ================================== */
const TYPES_PUB = ['actualite', 'vaccination', 'directive', 'alerte']
const AUDIENCES = ['public', 'soignants', 'medecins', 'pharmaciens']

export function SectionPublications({ session }) {
  const { t, nom, langue } = useLangue()
  const { lancer, Message } = useAction()
  const [liste, setListe] = useState(null)
  const [geo, setGeo] = useState(null)
  const [edition, setEdition] = useState(null)
  const national = ['super_admin', 'autorite_nationale', 'ordre_medecins', 'ordre_pharmaciens', 'centre_numerique'].includes(session.profil.role)

  const charger = useCallback(() => { db.adminPublications().then(setListe).catch(() => setListe([])) }, [])
  useEffect(() => { charger(); chargerGeo().then(setGeo) }, [charger])

  const vide = () => ({ type: 'actualite', audience: 'public', titre: '', corps: '', lien: '', provinceCode: national ? '' : (geo?.provinces.find((p) => p.id === session.profil.province_id)?.code || ''), publie: false, expire_le: '' })

  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('inst.publicationsIntro')}</Alerte></div>
      <Bouton className="mb-3 w-full" onClick={() => setEdition(vide())}>➕ {t('inst.nouvellePublication')}</Bouton>
      <Message />
      {liste === null ? <Chargement /> : liste.length === 0 ? (
        <Vide emoji="📢" titre={t('inst.aucunePublication')} />
      ) : (
        <ul className="space-y-2">
          {liste.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEdition({ ...p, provinceCode: geo?.provinces.find((x) => x.id === p.province_id)?.code || '', lien: p.lien || '', expire_le: p.expire_le ? p.expire_le.slice(0, 10) : '' })}
                      className="carte block w-full p-3 text-start">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{p.type === 'alerte' ? '⚠️ ' : ''}{p.titre}</p>
                  <span className={`puce shrink-0 ${p.publie ? 'bg-green-50 text-green-900' : 'bg-sable-200 text-nil-900/60'}`}>{t(p.publie ? 'inst.publiee' : 'inst.brouillon')}</span>
                </div>
                <p className="aide">{t('inst.typePub.' + p.type)} · {t('inst.audience.' + p.audience)} · {p.province_nom || t('vac.national')}{p.publie_le ? ` · ${dateCourte(p.publie_le, langue)}` : ''}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? t('commun.modifier') : t('inst.nouvellePublication')}>
        {edition && geo && (
          <FormPublication f={edition} setF={setEdition} geo={geo} national={national} nom={nom} t={t}
            surEnregistrer={() => lancer(db.enregistrerPublication({ ...edition, provinceCode: edition.provinceCode || null }), () => { setEdition(null); charger() })}
            surSupprimer={edition.id ? () => lancer(db.supprimerPublication(edition.id), () => { setEdition(null); charger() }) : null} />
        )}
      </Modale>
    </div>
  )
}

function FormPublication({ f, setF, geo, national, nom, t, surEnregistrer, surSupprimer }) {
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const ok = f.titre.trim().length >= 3 && f.corps.trim().length >= 3
  return (
    <div>
      <Champ etiquette={t('inst.typePubTitre')}>
        <Selecteur valeur={f.type} onChange={(v) => maj('type', v)} options={TYPES_PUB.map((x) => ({ valeur: x, libelle: t('inst.typePub.' + x) }))} />
      </Champ>
      <Champ etiquette={t('inst.audienceTitre')} aide={t('inst.audienceAide')}>
        <Selecteur valeur={f.audience} onChange={(v) => maj('audience', v)} options={AUDIENCES.map((x) => ({ valeur: x, libelle: t('inst.audience.' + x) }))} />
      </Champ>
      <Champ etiquette={t('zone.province')} aide={national ? t('inst.provinceAide') : null}>
        <Selecteur valeur={f.provinceCode} onChange={(v) => maj('provinceCode', v)} placeholder={national ? t('vac.national') : undefined}
                   options={geo.provinces.filter((p) => national || p.code === f.provinceCode).map((p) => ({ valeur: p.code, libelle: nom(p) }))} {...(national ? {} : { disabled: true })} />
      </Champ>
      <Champ etiquette={t('inst.titrePub')} obligatoire>
        <input className="champ" value={f.titre} onChange={(e) => maj('titre', e.target.value)} maxLength={160} />
      </Champ>
      <Champ etiquette={t('inst.corpsPub')} obligatoire>
        <textarea className="champ min-h-[8rem]" value={f.corps} onChange={(e) => maj('corps', e.target.value)} maxLength={4000} />
      </Champ>
      <Champ etiquette={t('inst.lienPub')} aide={t('inst.lienAide')}>
        <input className="champ" type="url" value={f.lien} onChange={(e) => maj('lien', e.target.value)} placeholder="https://" />
      </Champ>
      <Champ etiquette={t('inst.expirePub')}>
        <input className="champ" type="date" value={f.expire_le} onChange={(e) => maj('expire_le', e.target.value)} />
      </Champ>
      <Champ><Case coche={!!f.publie} onChange={(v) => maj('publie', v)}>{t('inst.publierMaintenant')}</Case></Champ>
      <div className="flex gap-2">
        <Bouton className="flex-1" onClick={surEnregistrer} disabled={!ok}>{t('commun.enregistrer')}</Bouton>
        {surSupprimer && <Bouton variante="danger" onClick={surSupprimer}>{t('commun.supprimer')}</Bouton>}
      </div>
    </div>
  )
}

/* =================== CAMPAGNES ===================================== */
export function SectionCampagnes({ session, requete }) {
  const { t, nom } = useLangue()
  const { lancer, Message } = useAction()
  const [liste, setListe] = useState(null)
  const [geo, setGeo] = useState(null)
  const [edition, setEdition] = useState(null)
  // National : tout le pays ou une province au choix. Les Ordres et le
  // programme national sont nationaux par nature (fichier SQL 17).
  const national = ['super_admin', 'autorite_nationale', 'ordre_medecins', 'ordre_pharmaciens', 'centre_numerique'].includes(session.profil.role)
  const auj = new Date().toISOString().slice(0, 10)

  const charger = useCallback(() => { db.adminCampagnes().then(setListe).catch(() => setListe([])) }, [])
  useEffect(() => { charger(); chargerGeo().then(setGeo) }, [charger])

  const vide = () => ({ nom: '', vaccins: [], age_min_mois: 0, age_max_mois: 59, provinceCode: national ? '' : (geo?.provinces.find((p) => p.id === session.profil.province_id)?.code || ''), debut: auj, fin: auj, lieux: '', message: '', statut: 'brouillon' })
  // Tuile « ➕ nouvelle campagne » du pilotage : le formulaire s'ouvre seul.
  const ouvrirDirect = requete?.get?.('nouveau') === '1'
  useEffect(() => { if (ouvrirDirect && geo && !edition) setEdition(vide()) }, [ouvrirDirect, geo]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('inst.campagnesIntro')}</Alerte></div>
      <Bouton className="mb-3 w-full" onClick={() => setEdition(vide())}>➕ {t('inst.nouvelleCampagne')}</Bouton>
      <Message />
      {liste === null ? <Chargement /> : liste.length === 0 ? (
        <Vide emoji="💉" titre={t('inst.aucuneCampagne')} />
      ) : (
        <ul className="space-y-2">
          {liste.map((c) => (
            <li key={c.id}>
              <button onClick={() => setEdition({ ...c, provinceCode: geo?.provinces.find((x) => x.id === c.province_id)?.code || '', lieux: c.lieux || '', message: c.message || '' })}
                      className="carte block w-full p-3 text-start">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{c.nom}</p>
                  <span className={`puce shrink-0 ${c.statut === 'publiee' ? 'bg-green-50 text-green-900' : 'bg-sable-200 text-nil-900/60'}`}>{t('inst.statutCampagne.' + c.statut)}</span>
                </div>
                <p className="aide">{(c.vaccins || []).join(', ') || t('inst.tousVaccins')} · {t('vac.campagneAge', { min: c.age_min_mois, max: c.age_max_mois })} · {c.province_nom || t('vac.national')}</p>
                <p className="aide nombres-latins">{jourFR(c.debut)} → {jourFR(c.fin)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? t('commun.modifier') : t('inst.nouvelleCampagne')}>
        {edition && geo && (
          <FormCampagne f={edition} setF={setEdition} geo={geo} national={national} nom={nom} t={t}
            surEnregistrer={() => lancer(db.enregistrerCampagne({ ...edition, provinceCode: edition.provinceCode || null }), () => { setEdition(null); charger() })} />
        )}
      </Modale>
    </div>
  )
}

function FormCampagne({ f, setF, geo, national, nom, t, surEnregistrer }) {
  const { langue } = useLangue()
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const basculer = (code) => maj('vaccins', f.vaccins.includes(code) ? f.vaccins.filter((x) => x !== code) : [...f.vaccins, code])
  const ok = f.nom.trim().length >= 3 && f.debut && f.fin && f.fin >= f.debut && Number(f.age_max_mois) >= Number(f.age_min_mois)
  return (
    <div>
      <Champ etiquette={t('inst.nomCampagne')} obligatoire>
        <input className="champ" value={f.nom} onChange={(e) => maj('nom', e.target.value)} maxLength={160} placeholder={t('inst.nomCampagneExemple')} />
      </Champ>
      <Champ etiquette={t('inst.vaccinsCampagne')} aide={t('inst.vaccinsAide')}>
        <div className="flex flex-wrap gap-1.5">
          {CALENDRIER.vaccins.map((v) => (
            <button key={v.code} type="button" onClick={() => basculer(v.code)} aria-pressed={f.vaccins.includes(v.code)}
                    className={`rounded-full border-2 px-3 py-1 text-[13px] font-bold ${f.vaccins.includes(v.code) ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
              {v.code}
            </button>
          ))}
        </div>
        {f.vaccins.length > 0 && <p className="aide mt-1">{f.vaccins.map((c) => CALENDRIER.vaccins.find((v) => v.code === c)?.nom[langue] || c).join(' · ')}</p>}
      </Champ>
      <div className="grid grid-cols-2 gap-2">
        <Champ etiquette={t('inst.ageMin')}><input className="champ" type="number" min="0" max="240" value={f.age_min_mois} onChange={(e) => maj('age_min_mois', e.target.value)} /></Champ>
        <Champ etiquette={t('inst.ageMax')}><input className="champ" type="number" min="0" max="240" value={f.age_max_mois} onChange={(e) => maj('age_max_mois', e.target.value)} /></Champ>
      </div>
      <Champ etiquette={t('zone.province')} aide={national ? t('inst.provinceAide') : null}>
        <Selecteur valeur={f.provinceCode} onChange={(v) => maj('provinceCode', v)} placeholder={national ? t('vac.national') : undefined}
                   options={geo.provinces.filter((p) => national || p.code === f.provinceCode).map((p) => ({ valeur: p.code, libelle: nom(p) }))} {...(national ? {} : { disabled: true })} />
      </Champ>
      <div className="grid grid-cols-2 gap-2">
        <Champ etiquette={t('inst.debut')} obligatoire><input className="champ" type="date" value={f.debut} onChange={(e) => maj('debut', e.target.value)} /></Champ>
        <Champ etiquette={t('inst.fin')} obligatoire><input className="champ" type="date" value={f.fin} min={f.debut} onChange={(e) => maj('fin', e.target.value)} /></Champ>
      </div>
      <Champ etiquette={t('inst.lieux')} aide={t('inst.lieuxAide')}>
        <input className="champ" value={f.lieux} onChange={(e) => maj('lieux', e.target.value)} maxLength={300} />
      </Champ>
      <Champ etiquette={t('inst.messageFamilles')}>
        <textarea className="champ min-h-[5rem]" value={f.message} onChange={(e) => maj('message', e.target.value)} maxLength={1000} />
      </Champ>
      <Champ etiquette={t('inst.statut')}>
        <Selecteur valeur={f.statut} onChange={(v) => maj('statut', v)} options={['brouillon', 'publiee', 'terminee', 'annulee'].map((x) => ({ valeur: x, libelle: t('inst.statutCampagne.' + x) }))} />
      </Champ>
      <Bouton className="w-full" onClick={surEnregistrer} disabled={!ok}>{t('commun.enregistrer')}</Bouton>
    </div>
  )
}

/* =================== ALERTES COMMUNAUTAIRES ======================== */
const STATUTS_EVT = ['nouveau', 'en_verification', 'confirme', 'transmis', 'ecarte']
const EMOJI_EVT = { malades_groupes: '🤒', deces_inhabituels: '🕯️', animaux_morts: '🐄', eau_suspecte: '💧', autre: '❓' }

export function SectionAlertes() {
  const { t, langue } = useLangue()
  const { lancer, Message } = useAction()
  const [filtre, setFiltre] = useState('ouverts')
  const [liste, setListe] = useState(null)
  const [choisi, setChoisi] = useState(null)
  const [note, setNote] = useState('')

  const charger = useCallback(() => { setListe(null); db.evenements({ statut: filtre === 'tous' ? undefined : filtre }).then(setListe).catch(() => setListe([])) }, [filtre])
  useEffect(() => { charger() }, [charger])

  const exporter = () => telechargerTexte(versCSV(liste || [], [
    { titre: 'code', valeur: 'code' }, { titre: 'type', valeur: 'type' }, { titre: 'personnes', valeur: 'nb_personnes' },
    { titre: 'ville', valeur: 'ville_nom' }, { titre: 'province', valeur: 'province_nom' }, { titre: 'lieu', valeur: 'lieu_texte' },
    { titre: 'description', valeur: 'description' }, { titre: 'statut', valeur: 'statut' }, { titre: 'recu_le', valeur: (e) => e.created_at.slice(0, 16) },
  ]), `alertes-${new Date().toISOString().slice(0, 10)}.csv`)

  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('inst.alertesIntro')}</Alerte></div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[['ouverts', t('inst.aTrier')], ['confirme', t('inst.statutEvt.confirme')], ['transmis', t('inst.statutEvt.transmis')], ['ecarte', t('inst.statutEvt.ecarte')], ['tous', t('commun.tous')]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)} aria-pressed={filtre === v}
                  className={`rounded-full border-2 px-3 py-1.5 text-[13px] font-bold ${filtre === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>{l}</button>
        ))}
        <Bouton taille="petit" variante="secondaire" onClick={exporter}>{t('admin.exporter')}</Bouton>
      </div>
      <Message />
      {liste === null ? <Chargement /> : liste.length === 0 ? (
        <Vide emoji="🟢" titre={t('inst.aucuneAlerte')} detail={t('inst.aucuneAlerteDetail')} />
      ) : (
        <ul className="space-y-2">
          {liste.map((e) => (
            <li key={e.id}>
              <button onClick={() => { setChoisi(e); setNote(e.note_autorite || '') }} className={`w-full rounded-2xl border-2 p-3 text-start ${e.statut === 'nouveau' ? 'border-soleil-300 bg-soleil-100' : 'border-sable-300 bg-white'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{EMOJI_EVT[e.type]} {t('alerte.type.' + e.type)}{e.nb_personnes ? ` · ${e.nb_personnes} ${t('inst.personnes')}` : ''}</p>
                  <span className="puce shrink-0 bg-sable-100 text-nil-900/70">{t('inst.statutEvt.' + e.statut)}</span>
                </div>
                <p className="aide">{[e.lieu_texte, e.ville_nom, e.province_nom].filter(Boolean).join(' · ')} · {ilYA(e.created_at, langue)} · {e.code}</p>
                <p className="mt-1 line-clamp-2 text-sm">{e.description}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!choisi} onFermer={() => setChoisi(null)} titre={choisi ? `${t('alerte.type.' + choisi.type)} · ${choisi.code}` : ''}>
        {choisi && (
          <div>
            <p className="aide">{[choisi.lieu_texte, choisi.ville_nom, choisi.province_nom].filter(Boolean).join(' · ')} · {dateCourte(choisi.created_at, langue)}</p>
            {choisi.nb_personnes != null && <p className="text-sm">{t('inst.personnes')} : <b className="nombres-latins">{choisi.nb_personnes}</b></p>}
            <p className="mt-2 whitespace-pre-line text-sm">{choisi.description}</p>
            {choisi.contact_tel && <p className="mt-2 text-sm nombres-latins" dir="ltr">📞 <a className="lien" href={'tel:' + choisi.contact_tel}>{choisi.contact_tel}</a></p>}
            <Champ etiquette={t('inst.noteAutorite')}>
              <textarea className="champ min-h-[4rem]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Champ>
            <div className="grid grid-cols-2 gap-2">
              {STATUTS_EVT.filter((s) => s !== choisi.statut).map((s) => (
                <Bouton key={s} variante={s === 'ecarte' ? 'danger' : s === 'confirme' ? 'urgence' : 'secondaire'} taille="petit"
                        onClick={() => lancer(db.trierEvenement(choisi.id, s, note.trim() || null), () => { setChoisi(null); charger() })}>
                  {t('inst.statutEvt.' + s)}
                </Bouton>
              ))}
            </div>
            <p className="aide mt-3">{t('inst.alerteJournal')}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}

/* =================== REFERENTIEL SANITAIRE ========================= */
export function SectionSante({ session }) {
  const { t } = useLangue()
  const { lancer, Message } = useAction()
  const [sante, setSante] = useState(null)
  const [enBase, setEnBase] = useState(null)
  const [progres, setProgres] = useState(null)
  const superAdmin = session.profil.role === 'super_admin'

  useEffect(() => {
    import('../../lib/sante').then((m) => m.chargerSante()).then(setSante).catch(() => setSante(false))
    db.compterFormations().then(setEnBase).catch(() => setEnBase(0))
  }, [])

  const stats = useMemo(() => {
    if (!sante) return null
    const f = sante.formations
    return { total: f.length, fonct: f.filter((x) => x.fonctionnelle === 1).length,
      hopitaux: f.filter((x) => x.type !== 'CS').length, districts: sante.districts.size, provinces: sante.provinces.length }
  }, [sante])

  const importer = () => lancer(
    db.importerFormations(sante.formations.map((f) => [f.code, f.nom, f.type, f.affiliation, f.fonctionnelle, f.lng, f.lat, f.districtId]),
      (fait, total) => setProgres({ fait, total })),
    () => { setProgres(null); db.compterFormations().then(setEnBase).catch(() => {}) })

  if (sante === null) return <Chargement />
  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('inst.santeIntro')}</Alerte></div>
      {stats && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[[stats.provinces, t('inst.santeProvinces')], [stats.districts, t('inst.santeDistricts')], [stats.total, t('inst.santeFormations')],
            [stats.fonct, t('inst.santeFonctionnelles')], [stats.hopitaux, t('inst.santeHopitaux')], [enBase ?? '…', t('inst.santeEnBase')]].map(([v, l]) => (
            <div key={l} className="rounded-xl border-2 border-sable-300 bg-white p-3">
              <p className="text-2xl font-black nombres-latins">{v}</p>
              <p className="text-[12px] leading-tight opacity-70">{l}</p>
            </div>
          ))}
        </div>
      )}
      <p className="aide mb-3">{sante.source}</p>
      <Message />
      {superAdmin && (
        <div>
          <Bouton className="w-full" onClick={importer} enCours={!!progres} disabled={!!progres}>
            {progres ? `${progres.fait} / ${progres.total}` : `⬆️ ${t('inst.santeImporter')}`}
          </Bouton>
          <p className="aide mt-2">{t('inst.santeImporterAide')}</p>
        </div>
      )}
      <p className="aide mt-3">{t('inst.santeCorrections')}</p>
      {['super_admin', 'autorite_nationale', 'centre_numerique', 'ordre_medecins', 'ordre_pharmaciens'].includes(session.profil.role) && (
        <Bouton className="mt-3 w-full" variante="secondaire" onClick={() => naviguer('/' + CONFIG.cheminAdmin + '/territoire?onglet=districts')}>
          🗺️ {t('terr.ouvrir')}
        </Bouton>
      )}
    </div>
  )
}
