/* Sections du back-office. Chacune tient sur un telephone : les
   administrateurs de province travaillent souvent depuis un mobile. */
import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db, MODE_DEMO } from '../../lib/db'
import { TYPES_PRO, NIVEAUX } from '../../lib/config'
import { chargerGeo } from '../../lib/geo'
import { ilYA, dateCourte, joursRestants, versCSV, telechargerTexte } from '../../lib/format'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Vide, Modale, Case } from '../../components/base'
import { BadgePro } from '../../components/pro'
import { TYPE_LIBELLE } from '../Annuaire'

/* Toute ecriture d'administration peut echouer silencieusement si
   l'element est hors du perimetre du compte. On le dit a l'ecran. */
function useAction() {
  const { t } = useLangue()
  const [erreur, setErreur] = useState(null)
  const lancer = async (promesse, apres) => {
    setErreur(null)
    try { await promesse; apres?.() }
    catch (e) {
      setErreur(e?.message === 'HORS_PERIMETRE' ? t('admin.horsPerimetre') : t('commun.erreurReseau'))
    }
  }
  const Message = () => erreur ? <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div> : null
  return { lancer, Message }
}

/* =================== DEMANDES ====================================== */
export function SectionDemandes() {
  const { t, langue } = useLangue()
  const [filtres, setFiltres] = useState({ statut: '', niveau: '', jours: 30 })
  const [liste, setListe] = useState(null)
  const [choisie, setChoisie] = useState(null)

  const charger = useCallback(() => {
    setListe(null)
    db.adminDemandes(filtres).then(setListe).catch(() => setListe([]))
  }, [filtres])
  useEffect(() => { charger() }, [charger])

  const exporter = () => {
    telechargerTexte(versCSV(liste || [], [
      { titre: 'code', valeur: 'code' },
      { titre: 'date', valeur: (d) => dateCourte(d.created_at, 'fr') },
      { titre: 'niveau', valeur: (d) => t(`niveau.${d.niveau}.titre`) },
      { titre: 'statut', valeur: (d) => t('statut.' + d.statut) },
      { titre: 'ville', valeur: 'ville_nom' },
      { titre: 'quartier', valeur: 'quartier_nom' },
      { titre: 'lieu', valeur: 'lieu_texte' },
      { titre: 'categories', valeur: (d) => (d.categories || []).join('|') },
      { titre: 'reponses', valeur: (d) => (d.reponses || []).length },
      { titre: 'escaladee', valeur: (d) => (d.escalade_le ? 'oui' : 'non') },
    ]), `demandes-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Selecteur valeur={filtres.niveau} onChange={(v) => setFiltres({ ...filtres, niveau: v })}
                   placeholder={t('commun.tous')}
                   options={NIVEAUX.map((n) => ({ valeur: String(n.n), libelle: n.emoji + ' ' + t(`niveau.${n.n}.titre`) }))} />
        <Selecteur valeur={filtres.statut} onChange={(v) => setFiltres({ ...filtres, statut: v })}
                   placeholder={t('admin.filtreStatut')}
                   options={['nouveau', 'vu', 'pris_en_charge', 'resolu', 'annule'].map((s) => ({ valeur: s, libelle: t('statut.' + s) }))} />
        <Selecteur valeur={String(filtres.jours)} onChange={(v) => setFiltres({ ...filtres, jours: Number(v) })}
                   options={[7, 30, 90].map((j) => ({ valeur: String(j), libelle: t('admin.j' + j) }))} />
      </div>

      {liste === null ? <Chargement /> : liste.length === 0 ? <Vide emoji="📭" titre={t('commun.aucunResultat')} /> : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] text-nil-900/60 nombres-latins">{liste.length}</span>
            <Bouton taille="petit" variante="secondaire" onClick={exporter}>⬇ {t('admin.exporter')}</Bouton>
          </div>
          <ul className="space-y-2">
            {liste.map((d) => {
              const n = NIVEAUX.find((x) => x.n === d.niveau) || NIVEAUX[3]
              return (
                <li key={d.id}>
                  <button onClick={() => setChoisie(d)} className="carte block w-full overflow-hidden text-start">
                    <div className={`flex items-center gap-2 px-3 py-1 text-[12px] font-bold text-white ${n.couleur}`}>
                      <span className="nombres-latins">{d.code}</span>
                      <span className="ms-auto">{ilYA(d.created_at, langue)}</span>
                    </div>
                    <div className="p-3">
                      <p className="text-[14px] font-bold">📍 {[d.quartier_nom, d.ville_nom].filter(Boolean).join(', ')}</p>
                      <p className="mt-1 flex flex-wrap gap-1 text-[12px]">
                        <span className="puce bg-sable-100 text-nil-900/60">{t('statut.' + d.statut)}</span>
                        <span className="puce bg-sable-100 text-nil-900/60">👁 {d.reponses?.length || 0}</span>
                        {d.escalade_le && <span className="puce bg-urgence-50 text-urgence-600">⚠️</span>}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Modale ouverte={!!choisie} onFermer={() => setChoisie(null)} titre={choisie?.code}>
        {choisie && <DetailDemandeAdmin d={choisie} surAction={() => { setChoisie(null); charger() }} />}
      </Modale>
    </div>
  )
}

function DetailDemandeAdmin({ d, surAction }) {
  const { t, langue } = useLangue()
  const { lancer, Message } = useAction()
  return (
    <div>
      <Message />
      <dl className="space-y-1 text-[14px]">
        <p><b>{t('niveau.' + d.niveau + '.titre')}</b> · {t('statut.' + d.statut)}</p>
        <p>{dateCourte(d.created_at, langue)}</p>
        <p>📍 {[d.quartier_nom, d.ville_nom].filter(Boolean).join(', ')}</p>
        {d.lieu_texte && <p>🧭 {d.lieu_texte}</p>}
        {d.description && <p>💬 {d.description}</p>}
        {d.contact_tel && <p className="nombres-latins" dir="ltr">☎ {d.contact_tel}</p>}
      </dl>

      {d.reponses?.length > 0 && (
        <ol className="mt-3 space-y-1 border-s-2 border-sable-300 ps-3 text-[13px]">
          {d.reponses.map((r, i) => (
            <li key={i}><b>{r.pro_nom || '—'}</b> {t('action.' + r.action)} · {ilYA(r.created_at, langue)}</li>
          ))}
        </ol>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Bouton taille="petit" variante="secondaire"
                onClick={() => lancer(db.adminMajDemande(d.id, { statut: 'resolu', resolu_le: new Date().toISOString() }), surAction)}>
          ✅ {t('statut.resolu')}
        </Bouton>
        <Bouton taille="petit" variante="secondaire"
                onClick={() => lancer(db.adminMajDemande(d.id, { statut: 'non_pris_en_charge' }), surAction)}>
          ⛔ {t('statut.non_pris_en_charge')}
        </Bouton>
        <Bouton taille="petit" variante="secondaire" className="col-span-2"
                onClick={() => lancer(db.adminMajDemande(d.id, { escalade_le: new Date().toISOString() }), surAction)}>
          ⚠️ {t('admin.kpi.escalades')}
        </Bouton>
      </div>
    </div>
  )
}

/* =================== SOIGNANTS ===================================== */
const STATUTS_PRO = ['provisoire', 'verifie', 'expire', 'suspendu', 'refuse']

const LIBELLE_STATUT = (t, s) => ({
  provisoire: '⏳ ' + t('badge.provisoire'),
  verifie: '✔ ' + t('badge.verifie'),
  expire: '⌛ ' + t('badge.expire'),
  suspendu: '⏸ ' + t('admin.suspendre'),
  refuse: '⛔ ' + t('admin.refuser'),
}[s] || s)

export function SectionSoignants() {
  const { t } = useLangue()
  const [filtres, setFiltres] = useState({ statut: 'provisoire', type: '', recherche: '' })
  const [liste, setListe] = useState(null)
  const [choisi, setChoisi] = useState(null)

  const charger = useCallback(() => {
    setListe(null)
    db.adminPros(filtres).then(setListe).catch(() => setListe([]))
  }, [filtres])
  useEffect(() => { const i = setTimeout(charger, filtres.recherche ? 300 : 0); return () => clearTimeout(i) }, [charger, filtres.recherche])

  return (
    <div>
      <div className="mb-3 space-y-2">
        <input className="champ" placeholder={t('commun.rechercher')} value={filtres.recherche}
               onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Selecteur valeur={filtres.statut} onChange={(v) => setFiltres({ ...filtres, statut: v })}
                     placeholder={t('commun.tous')}
                     options={STATUTS_PRO.map((s) => ({ valeur: s, libelle: LIBELLE_STATUT(t, s) }))} />
          <Selecteur valeur={filtres.type} onChange={(v) => setFiltres({ ...filtres, type: v })}
                     placeholder={t('admin.filtreType')}
                     options={TYPES_PRO.filter((x) => x.cle !== 'autre').map((x) => ({ valeur: x.cle, libelle: x.emoji + ' ' + (TYPE_LIBELLE(x.cle) || x.cle) }))} />
        </div>
      </div>

      {liste === null ? <Chargement /> : liste.length === 0 ? <Vide emoji="🩺" titre={t('commun.aucunResultat')} /> : (
        <ul className="space-y-2">
          {liste.map((p) => (
            <li key={p.id}>
              <button onClick={() => setChoisi(p)} className="carte block w-full p-3 text-start">
                <div className="flex items-start gap-2">
                  <span className="text-xl" aria-hidden="true">{TYPES_PRO.find((x) => x.cle === p.type)?.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{p.nom}</p>
                    <p className="aide">{[p.specialite, p.quartier_nom, p.ville_nom].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 flex flex-wrap gap-1"><BadgePro pro={p} court /></p>
                  </div>
                  {p.service_officiel && !p.telephone && <span className="puce bg-urgence-50 text-urgence-600">☎</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!choisi} onFermer={() => setChoisi(null)} titre={choisi?.nom}>
        {choisi && <FicheAdminPro pro={choisi} surAction={() => { setChoisi(null); charger() }} />}
      </Modale>
    </div>
  )
}

function FicheAdminPro({ pro, surAction }) {
  const { t } = useLangue()
  const [tel, setTel] = useState(pro.telephone || '')
  const [note, setNote] = useState(pro.note_admin || '')
  const [enCours, setEnCours] = useState(false)
  const { lancer, Message } = useAction()

  const agir = async (patch) => {
    setEnCours(true)
    await lancer(db.adminMajPro(pro.id, patch), surAction)
    setEnCours(false)
  }

  return (
    <div>
      <Message />
      <p className="mb-2 flex flex-wrap gap-1"><BadgePro pro={pro} /></p>
      <dl className="space-y-1 text-[14px]">
        {pro.specialite && <p>{pro.specialite}</p>}
        <p>📍 {[pro.quartier_nom, pro.ville_nom, pro.province_nom].filter(Boolean).join(', ')}</p>
        {pro.horaires && <p>🕒 {pro.horaires}</p>}
        {pro.statut === 'provisoire' && (
          <p className="text-soleil-700">⏳ {t('pro.probation', { j: joursRestants(pro.probation_fin) ?? '—' })}</p>
        )}
      </dl>

      <Champ etiquette={t('pro.telephone')}>
        <input className="champ nombres-latins" dir="ltr" value={tel} onChange={(e) => setTel(e.target.value)}
               placeholder="+235 ..." />
      </Champ>
      <Champ etiquette={t('admin.noteAdmin')}>
        <textarea className="champ" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Champ>
      <Bouton taille="petit" variante="secondaire" className="mb-4 w-full" enCours={enCours}
              onClick={() => agir({ telephone: tel || null, note_admin: note, numero_confirme: !!tel })}>
        {t('commun.enregistrer')}
      </Bouton>

      <div className="grid grid-cols-2 gap-2">
        <Bouton taille="petit" variante="succes" onClick={() => agir({ statut: 'verifie' })}>✔ {t('admin.verifier')}</Bouton>
        <Bouton taille="petit" variante="secondaire"
                onClick={() => agir({ statut: 'provisoire', probation_fin: new Date(Date.now() + 45 * 864e5).toISOString() })}>
          ⏳ {t('admin.prolonger')}
        </Bouton>
        <Bouton taille="petit" variante="secondaire" onClick={() => agir({ statut: 'suspendu' })}>⏸ {t('admin.suspendre')}</Bouton>
        <Bouton taille="petit" variante="danger" onClick={() => agir({ statut: 'refuse' })}>⛔ {t('admin.refuser')}</Bouton>
      </div>
    </div>
  )
}

/* =================== GEOGRAPHIE ==================================== */
export function SectionGeographie() {
  const { t, nom, langue } = useLangue()
  const { lancer, Message } = useAction()
  const [geo, setGeo] = useState(null)
  const [villeCode, setVilleCode] = useState('NDJ-NDJ')
  const [quartiers, setQuartiers] = useState(null)
  const [nouveau, setNouveau] = useState({ nom: '', groupe: '' })

  useEffect(() => { chargerGeo().then(setGeo) }, [])

  const charger = useCallback(() => {
    if (!villeCode) return
    setQuartiers(null)
    db.adminQuartiers(villeCode).then(setQuartiers).catch(() => setQuartiers([]))
  }, [villeCode])
  useEffect(() => { charger() }, [charger])

  if (!geo) return <Chargement />

  const villes = geo.villes
  const sansQuartier = villes.filter((v) => !(v.districts || []).length)

  const ajouter = async () => {
    if (!nouveau.nom.trim()) return
    await lancer(
      db.adminCreerQuartier({ villeCode, nom: nouveau.nom.trim(), groupe: nouveau.groupe ? Number(nouveau.groupe) : null }),
      () => { setNouveau({ nom: '', groupe: '' }); charger() }
    )
  }

  const enAttente = (quartiers || []).filter((q) => q.approuve === false)

  return (
    <div>
      <Message />
      <Champ etiquette={t('zone.ville')}>
        <Selecteur valeur={villeCode} onChange={setVilleCode}
                   options={villes.map((v) => ({ valeur: v.code, libelle: `${nom(v)} — ${nom(v.province)}` }))} />
      </Champ>

      {enAttente.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-bold text-soleil-700">⏳ {t('admin.suggestions')}</h2>
          <ul className="space-y-2">
            {enAttente.map((q) => (
              <li key={q.id} className="carte flex items-center gap-2 p-3">
                <span className="min-w-0 flex-1 font-bold">{q.nom_fr}</span>
                <Bouton taille="petit" variante="succes"
                        onClick={() => db.adminMajQuartier(q.id, { approuve: true, qualite: 'officiel' }).then(charger)}>
                  {t('admin.valider')}
                </Bouton>
                <Bouton taille="petit" variante="danger"
                        onClick={() => db.adminSupprimerQuartier(q.id).then(charger)}>×</Bouton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="carte mb-4 p-3">
        <h2 className="mb-2 font-bold">{t('admin.ajouterQuartier')}</h2>
        <div className="flex gap-2">
          <input className="champ flex-1" placeholder={t('admin.nomQuartier')} value={nouveau.nom}
                 onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} />
          <input className="champ w-20 nombres-latins" placeholder={t('admin.arrondissement')} inputMode="numeric"
                 value={nouveau.groupe} onChange={(e) => setNouveau({ ...nouveau, groupe: e.target.value.replace(/\D/g, '') })} />
          <Bouton onClick={ajouter}>+</Bouton>
        </div>
      </section>

      {quartiers === null ? <Chargement /> : (
        <>
          <h2 className="mb-2 text-sm font-bold text-nil-900/60">
            {t('zone.quartier')} <span className="nombres-latins">({quartiers.filter((q) => q.approuve !== false).length})</span>
          </h2>
          {quartiers.length === 0 ? (
            <Alerte ton="attention">{t('zone.aucunQuartier')}</Alerte>
          ) : (
            <ul className="grid grid-cols-2 gap-1.5">
              {quartiers.filter((q) => q.approuve !== false).map((q) => (
                <li key={q.id} className="carte flex items-center gap-1 p-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{q.nom_fr}</span>
                  {q.groupe != null && <span className="puce bg-sable-100 text-nil-900/50 nombres-latins">{q.groupe}</span>}
                  <span className="puce bg-sable-100 text-nil-900/40" title={t('admin.qualite')}>{q.qualite?.[0]?.toUpperCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-nil-900/60">
          {t('admin.villesSansQuartier')} <span className="nombres-latins">({sansQuartier.length})</span>
        </h2>
        <p className="flex flex-wrap gap-1">
          {sansQuartier.map((v) => (
            <button key={v.code} onClick={() => setVilleCode(v.code)}
                    className="puce bg-soleil-100 text-soleil-700">{nom(v)}</button>
          ))}
        </p>
      </section>
    </div>
  )
}

/* =================== MODERATION ==================================== */
export function SectionModeration() {
  const { t, langue } = useLangue()
  const [signalements, setSignalements] = useState(null)
  const [ordonnances, setOrdonnances] = useState(null)

  const charger = useCallback(() => {
    db.adminSignalements().then(setSignalements).catch(() => setSignalements([]))
    db.adminOrdonnances().then(setOrdonnances).catch(() => setOrdonnances([]))
  }, [])
  useEffect(() => { charger() }, [charger])

  return (
    <div>
      <h2 className="mb-2 text-sm font-bold text-nil-900/60">🚩 {t('admin.kpi.signalements')}</h2>
      {signalements === null ? <Chargement /> : signalements.length === 0 ? (
        <Vide emoji="✅" titre={t('commun.aucunResultat')} />
      ) : (
        <ul className="mb-6 space-y-2">
          {signalements.map((s) => (
            <li key={s.id} className="carte p-3">
              <p className="font-bold">{t('signal.' + (s.motif || 'autre'))}</p>
              <p className="aide">{s.cible_type} · {ilYA(s.created_at, langue)}</p>
              {s.detail && <p className="mt-1 text-[14px]">{s.detail}</p>}
              <p className="mt-1"><span className="puce bg-sable-100 text-nil-900/60">{s.statut}</span></p>
              {s.statut === 'ouvert' && (
                <div className="mt-2 flex gap-2">
                  <Bouton taille="petit" variante="succes"
                          onClick={() => db.adminMajSignalement(s.id, { statut: 'traite' }).then(charger)}>
                    {t('admin.traite')}
                  </Bouton>
                  <Bouton taille="petit" variante="secondaire"
                          onClick={() => db.adminMajSignalement(s.id, { statut: 'rejete' }).then(charger)}>
                    {t('admin.rejete')}
                  </Bouton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-bold text-nil-900/60">💊 {t('pro.ordonnances')}</h2>
      {ordonnances === null ? <Chargement /> : ordonnances.length === 0 ? (
        <Vide emoji="💊" titre={t('commun.aucunResultat')} />
      ) : (
        <ul className="space-y-2">
          {ordonnances.slice(0, 40).map((o) => (
            <li key={o.id} className="carte flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-black nombres-latins" dir="ltr">{o.code}</p>
                <p className="aide">{[o.ville_nom, ilYA(o.created_at, langue)].filter(Boolean).join(' · ')}</p>
              </div>
              <Bouton taille="petit" variante={o.masquee ? 'secondaire' : 'danger'}
                      onClick={() => db.adminMajOrdonnance(o.id, { masquee: !o.masquee }).then(charger)}>
                {o.masquee ? t('admin.demasquer') : t('admin.masquer')}
              </Bouton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* =================== NUMEROS D'URGENCE ============================= */
export function SectionNumeros() {
  const { t } = useLangue()
  const [liste, setListe] = useState(null)
  const [nouveau, setNouveau] = useState({ libelle_fr: '', tel: '' })
  const { lancer, Message } = useAction()

  const charger = useCallback(() => {
    db.adminNumeros().then(setListe).catch(() => setListe([]))
  }, [])
  useEffect(() => { charger() }, [charger])

  const ajouter = async () => {
    if (!nouveau.libelle_fr.trim() || !nouveau.tel.trim()) return
    await lancer(
      db.adminCreerNumero({ ...nouveau, verifie: true, actif: true, source: 'Saisi par l\'administration' }),
      () => { setNouveau({ libelle_fr: '', tel: '' }); charger() }
    )
  }

  return (
    <div>
      <div className="mb-4">
        <Alerte ton="attention">{t('urgence.avertissementAdmin')}</Alerte>
      </div>
      <Message />

      <section className="carte mb-4 p-3">
        <h2 className="mb-2 font-bold">+ {t('admin.numeros')}</h2>
        <input className="champ mb-2" placeholder={t('pro.nom')} value={nouveau.libelle_fr}
               onChange={(e) => setNouveau({ ...nouveau, libelle_fr: e.target.value })} />
        <div className="flex gap-2">
          <input className="champ flex-1 nombres-latins" dir="ltr" placeholder="+235 ..." value={nouveau.tel}
                 onChange={(e) => setNouveau({ ...nouveau, tel: e.target.value })} />
          <Bouton onClick={ajouter}>+</Bouton>
        </div>
      </section>

      {liste === null ? <Chargement /> : (
        <ul className="space-y-2">
          {liste.map((n) => (
            <li key={n.id} className="carte p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{n.libelle_fr}</p>
                  <p className="nombres-latins text-[14px]" dir="ltr">{n.tel}{n.tel2 ? ' · ' + n.tel2 : ''}</p>
                  {n.source && <p className="aide mt-0.5">{n.source}</p>}
                </div>
                <span className={`puce ${n.verifie ? 'bg-green-100 text-green-800' : 'bg-soleil-100 text-soleil-700'}`}>
                  {n.verifie ? '✔' : '⚠️'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Bouton taille="petit" variante={n.verifie ? 'secondaire' : 'succes'}
                        onClick={() => lancer(db.adminMajNumero(n.id, { verifie: !n.verifie }), charger)}>
                  {n.verifie ? '↩' : '✔'} {t('admin.verifier')}
                </Bouton>
                <Bouton taille="petit" variante="secondaire"
                        onClick={() => lancer(db.adminMajNumero(n.id, { actif: !n.actif }), charger)}>
                  {n.actif ? t('admin.masquer') : t('admin.demasquer')}
                </Bouton>
                <Bouton taille="petit" variante="danger"
                        onClick={() => lancer(db.adminSupprimerNumero(n.id), charger)}>{t('commun.supprimer')}</Bouton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* =================== EQUIPE ======================================== */
export function SectionEquipe() {
  const { t, nom } = useLangue()
  const [liste, setListe] = useState(null)
  const [geo, setGeo] = useState(null)
  const [choisi, setChoisi] = useState(null)

  const charger = useCallback(() => {
    db.adminProfils().then(setListe).catch(() => setListe([]))
  }, [])
  useEffect(() => { charger(); chargerGeo().then(setGeo) }, [charger])

  return (
    <div>
      <div className="mb-4"><Alerte ton="info">{t('admin.creationCompteSupabase')}</Alerte></div>
      {liste === null || !geo ? <Chargement /> : (
        <ul className="space-y-2">
          {liste.map((p) => (
            <li key={p.id}>
              <button onClick={() => setChoisi(p)} className="carte block w-full p-3 text-start">
                <p className="font-bold">{p.nom || '—'}</p>
                <p className="aide nombres-latins" dir="ltr">{p.telephone}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  <span className="puce bg-nil-50 text-nil-700">{t('admin.role.' + p.role)}</span>
                  {(p.ville_nom || p.province_nom) && (
                    <span className="puce bg-sable-100 text-nil-900/60">{p.ville_nom || p.province_nom}</span>
                  )}
                  {!p.actif && <span className="puce bg-urgence-50 text-urgence-600">✕</span>}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={!!choisi} onFermer={() => setChoisi(null)} titre={choisi?.nom || choisi?.telephone}>
        {choisi && geo && <FicheProfil profil={choisi} geo={geo} surAction={() => { setChoisi(null); charger() }} />}
      </Modale>
    </div>
  )
}

function FicheProfil({ profil, geo, surAction }) {
  const { t, nom } = useLangue()
  const { lancer, Message } = useAction()
  const [role, setRole] = useState(profil.role)
  const [villeCode, setVilleCode] = useState('')
  const [provinceCode, setProvinceCode] = useState('')
  const [actif, setActif] = useState(profil.actif !== false)

  const enregistrer = async () => {
    const patch = { role, actif }
    if (role === 'admin_ville' && villeCode) patch.villeCode = villeCode
    if (role === 'admin_province' && provinceCode) patch.provinceCode = provinceCode
    if (role === 'super_admin') { patch.villeCode = null; patch.provinceCode = null }
    await lancer(db.adminMajProfil(profil.id, patch), surAction)
  }

  return (
    <div>
      <Message />
      <Champ etiquette={t('admin.role.pro')}>
        <Selecteur valeur={role} onChange={setRole} options={[
          { valeur: 'pro', libelle: t('admin.role.pro') },
          { valeur: 'admin_ville', libelle: t('admin.role.admin_ville') },
          { valeur: 'admin_province', libelle: t('admin.role.admin_province') },
          { valeur: 'super_admin', libelle: t('admin.role.super_admin') },
        ]} />
      </Champ>

      {role === 'admin_ville' && (
        <Champ etiquette={t('zone.ville')}>
          <Selecteur valeur={villeCode} onChange={setVilleCode} placeholder={t('zone.choisirVille')}
                     options={geo.villes.map((v) => ({ valeur: v.code, libelle: `${nom(v)} — ${nom(v.province)}` }))} />
        </Champ>
      )}
      {role === 'admin_province' && (
        <Champ etiquette={t('zone.province')}>
          <Selecteur valeur={provinceCode} onChange={setProvinceCode} placeholder={t('zone.choisirProvince')}
                     options={geo.provinces.map((p) => ({ valeur: p.code, libelle: nom(p) }))} />
        </Champ>
      )}

      <Champ>
        <Case coche={actif} onChange={setActif}>{t('admin.reactiver')}</Case>
      </Champ>

      <Bouton className="w-full" onClick={enregistrer}>{t('commun.enregistrer')}</Bouton>
    </div>
  )
}

/* =================== REGLAGES ====================================== */
export function SectionReglages() {
  const { t } = useLangue()
  const [r, setR] = useState(null)
  const [ok, setOk] = useState(false)

  const charger = useCallback(() => { db.adminReglages().then(setR).catch(() => setR({})) }, [])
  useEffect(() => { charger() }, [charger])

  if (!r) return <Chargement />

  const majer = async (cle, valeur) => {
    await db.adminMajReglage(cle, valeur)
    setOk(true); setTimeout(() => setOk(false), 1500)
    charger()
  }

  return (
    <div>
      {ok && <div className="mb-3"><Alerte ton="succes">{t('commun.enregistrer')}</Alerte></div>}

      <Champ etiquette={t('admin.delaiEscalade')} aide={`${t('commun.min')}`}>
        <input className="champ nombres-latins" inputMode="numeric" defaultValue={r.delai_escalade?.minutes ?? 15}
               onBlur={(e) => majer('delai_escalade', { minutes: Number(e.target.value) || 15 })} />
      </Champ>

      <Champ etiquette={t('admin.retention')} aide={t('commun.jours')}>
        <input className="champ nombres-latins" inputMode="numeric" defaultValue={r.retention_medias?.jours ?? 30}
               onBlur={(e) => majer('retention_medias', { jours: Number(e.target.value) || 30 })} />
      </Champ>

      <Champ etiquette={t('admin.probationJours')} aide={t('commun.jours')}>
        <input className="champ nombres-latins" inputMode="numeric" defaultValue={r.probation_jours?.jours ?? 45}
               onBlur={(e) => majer('probation_jours', { jours: Number(e.target.value) || 45 })} />
      </Champ>

      <Champ>
        <Case coche={r.transparence_active !== false} onChange={(v) => majer('transparence_active', v)}>
          {t('admin.transparence')}
        </Case>
      </Champ>

      <Champ>
        <Case coche={r.numeros_verifies_localement === true} onChange={(v) => majer('numeros_verifies_localement', v)}>
          {t('admin.validerNumeros')}
        </Case>
      </Champ>

      <div className="mt-6 space-y-2 border-t border-sable-200 pt-4">
        <Bouton variante="danger" className="w-full"
                onClick={() => confirm(t('admin.effacerDemoConfirme')) && db.adminEffacerDemo().then(charger)}>
          🧹 {t('admin.effacerDemo')}
        </Bouton>
        {MODE_DEMO && (
          <Bouton variante="secondaire" className="w-full"
                  onClick={() => confirm(t('admin.reinitialiserConfirme')) && db.reinitialiser().then(() => location.reload())}>
            ♻️ {t('admin.reinitialiser')}
          </Bouton>
        )}
      </div>
    </div>
  )
}
