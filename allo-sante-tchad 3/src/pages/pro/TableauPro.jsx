/* Tableau de bord du soignant : disponibilite, alertes de la zone,
   reponse en un seul geste. Concu pour etre utilisable d'une main,
   entre deux patients. */
import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db, abonnerDemandes } from '../../lib/db'
import { NIVEAUX, CONFIG } from '../../lib/config'
import { ilYA, joursRestants } from '../../lib/format'
import { lienAppel, lienWhatsApp } from '../../lib/links'
import { naviguer } from '../../lib/router'
import { Bouton, Entete, Alerte, Chargement, Vide, Bascule, Modale, Champ, Selecteur, Case } from '../../components/base'
import { BadgePro } from '../../components/pro'
import { BoutonSortie } from '../../components/chrome'
import { SelecteurZone } from '../../components/zone'

export default function TableauPro({ session, surChangement }) {
  const { t } = useLangue()
  const [onglet, setOnglet] = useState('demandes')
  const pro = session.pro
  const admin = session.profil.role !== 'pro'

  useEffect(() => {
    if (admin) naviguer('/' + CONFIG.cheminAdmin)
  }, [admin])

  if (!pro) {
    return (
      <div>
        <Entete titre={t('pro.titre')} sansRetour
                action={<BoutonSortie onClick={() => db.deconnecter().then(surChangement)} />} />
        <Alerte ton="attention">{t('admin.creationCompteSupabase')}</Alerte>
      </div>
    )
  }

  const bloque = ['expire', 'suspendu', 'refuse'].includes(pro.statut)

  return (
    <div>
      <Entete
        titre={t('pro.bienvenue', { nom: pro.nom.split(' ').slice(0, 2).join(' ') })}
        sousTitre={[pro.quartier_nom, pro.ville_nom].filter(Boolean).join(', ')}
        sansRetour
        action={<BoutonSortie onClick={() => db.deconnecter().then(surChangement)} />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BadgePro pro={pro} />
      </div>

      {pro.statut === 'provisoire' && (
        <div className="mb-3">
          <Alerte ton="attention" titre={t('pro.probation', { j: joursRestants(pro.probation_fin) ?? '—' })}>
            {t('pro.probationAide')}
          </Alerte>
        </div>
      )}
      {bloque && (
        <div className="mb-3">
          <Alerte ton="danger">{t('pro.' + (pro.statut === 'expire' ? 'expire' : pro.statut))}</Alerte>
        </div>
      )}

      <div className="mb-4">
        <Bascule
          actif={!!pro.en_ligne && !bloque}
          onChange={(v) => !bloque && db.definirEnLigne(v).then(surChangement)}
          etiquette={pro.en_ligne && !bloque ? t('pro.disponible') : t('pro.indisponible')}
          aide={t('pro.disponibleAide')}
        />
      </div>

      <div className="mb-4 flex gap-2">
        {[
          ['demandes', '🆘 ' + t('pro.demandes')],
          ...(pro.type === 'pharmacie' ? [['ordonnances', '💊 ' + t('pro.ordonnances')]] : []),
          ['profil', '👤 ' + t('pro.profil')],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setOnglet(v)} aria-pressed={onglet === v}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold
                    ${onglet === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {onglet === 'demandes' && <ListeDemandes pro={pro} bloque={bloque} />}
      {onglet === 'ordonnances' && <ListeOrdonnances pro={pro} bloque={bloque} />}
      {onglet === 'profil' && <ProfilPro pro={pro} surChangement={surChangement} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function ListeDemandes({ pro, bloque }) {
  const { t, langue } = useLangue()
  const [liste, setListe] = useState(null)
  const [choisie, setChoisie] = useState(null)

  const charger = useCallback(() => {
    db.demandesZone({ inclureCloturees: false }).then(setListe).catch(() => setListe([]))
  }, [])

  useEffect(() => {
    charger()
    return abonnerDemandes(pro.ville_code, charger)
  }, [charger, pro.ville_code])

  if (bloque) return <Vide emoji="🔒" titre={t('pro.expire')} />
  if (liste === null) return <Chargement />
  if (!liste.length) {
    return <Vide emoji="✅" titre={t('pro.aucuneDemande')} detail={t('pro.aucuneDemandeAide')} />
  }

  return (
    <>
      <ul className="space-y-2">
        {liste.map((d) => {
          const n = NIVEAUX.find((x) => x.n === d.niveau) || NIVEAUX[3]
          const dejaRepondu = (d.reponses || []).some((r) => r.pro_id && r.pro_id === pro.id)
          return (
            <li key={d.id}>
              <button onClick={() => setChoisie(d)}
                      className="carte block w-full overflow-hidden text-start">
                <div className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-bold text-white ${n.couleur}`}>
                  <span>{n.emoji} {t(`niveau.${d.niveau}.titre`)}</span>
                  <span className="ms-auto opacity-90">{ilYA(d.created_at, langue)}</span>
                </div>
                <div className="p-3">
                  <p className="font-bold">
                    📍 {[d.quartier_nom, d.ville_libre || d.ville_nom].filter(Boolean).join(', ') || '—'}
                  </p>
                  {d.ville_libre && d.ville_nom && (
                    <p className="text-[12px] text-nil-900/50">{t('aide.villeRattachee', { ville: d.ville_nom })}</p>
                  )}
                  {d.lieu_texte && <p className="text-[14px] text-nil-900/70">{d.lieu_texte}</p>}
                  {d.categories?.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {d.categories.slice(0, 4).map((c) => (
                        <span key={c} className="puce bg-sable-100 text-nil-900/70">{t('cat.' + c)}</span>
                      ))}
                    </p>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="puce bg-sable-100 text-nil-900/60">{t('statut.' + d.statut)}</span>
                    {d.escalade_le && <span className="puce bg-urgence-50 text-urgence-600">⚠️ {t('admin.kpi.escalades')}</span>}
                    {dejaRepondu && <span className="puce bg-green-100 text-green-800">✓ {t('pro.dejaRepondu')}</span>}
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      <ModaleDemande demande={choisie} onFermer={() => { setChoisie(null); charger() }} />
    </>
  )
}

function ModaleDemande({ demande, onFermer }) {
  const { t, langue } = useLangue()
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(null)
  const [vocal, setVocal] = useState(null)
  const [contact, setContact] = useState(null)
  const [engage, setEngage] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    setMessage(''); setVocal(null); setContact(null); setEngage(false); setErreur(null)
    if (demande?.vocal_url) db.urlSignee(demande.vocal_url).then(setVocal).catch(() => {})
    if (demande) db.repondre({ demandeId: demande.id, action: 'vu' }).catch(() => {})
  }, [demande])

  if (!demande) return null

  const ENGAGEMENTS = ['en_route', 'appelle', 'whatsapp']

  const repondre = async (action) => {
    setEnCours(action); setErreur(null)
    try {
      await db.repondre({ demandeId: demande.id, action, message: message || null })
      if (ENGAGEMENTS.includes(action)) {
        // Le numero du patient n'est delivre qu'ici : la base verifie
        // que ce soignant s'est reellement engage. On garde la fenetre
        // ouverte pour qu'il puisse appeler tout de suite.
        setEngage(true)
        setContact(await db.contactDemande(demande.id).catch(() => null))
      } else {
        onFermer()
      }
    } catch {
      setErreur(t('commun.erreurReseau'))
    } finally { setEnCours(null) }
  }

  const n = NIVEAUX.find((x) => x.n === demande.niveau) || NIVEAUX[3]

  return (
    <Modale ouverte onFermer={onFermer} titre={t('pro.nouvelleDemande')}>
      <div className={`-mx-4 -mt-2 mb-3 px-4 py-2 text-white ${n.couleur}`}>
        <p className="font-black">{n.emoji} {t(`niveau.${demande.niveau}.titre`)}</p>
        <p className="text-[12px] opacity-90">{ilYA(demande.created_at, langue)}</p>
      </div>

      <dl className="space-y-1.5 text-[14px]">
        <Ligne cle="📍" val={[demande.quartier_nom, demande.ville_libre || demande.ville_nom].filter(Boolean).join(', ')
          + (demande.ville_libre && demande.ville_nom ? ` (${t('aide.villeRattachee', { ville: demande.ville_nom })})` : '')} />
        {demande.lieu_texte && <Ligne cle="🧭" val={demande.lieu_texte} />}
        {demande.description && <Ligne cle="💬" val={demande.description} />}
        {(demande.age_approx || demande.sexe) && (
          <Ligne cle="🧍" val={[demande.age_approx && demande.age_approx + ' ans', demande.sexe].filter(Boolean).join(' · ')} />
        )}
        {demande.categories?.length > 0 && (
          <Ligne cle="🏷️" val={demande.categories.map((c) => t('cat.' + c)).join(', ')} />
        )}
      </dl>

      {vocal && (
        <div className="mt-3">
          <p className="etiquette">{t('pro.voirVocal')}</p>
          <audio controls src={vocal} className="w-full" preload="none" />
        </div>
      )}

      {demande.lat != null && (
        <a className="lien mt-3 inline-block"
           href={`https://www.google.com/maps/dir/?api=1&destination=${demande.lat},${demande.lng}`}
           target="_blank" rel="noopener noreferrer">🗺️ {t('annuaire.itineraire')}</a>
      )}

      <div className="mt-3">
        {contact?.tel ? (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-3">
            <p className="text-[13px] font-bold text-green-900">{t('pro.contactObtenu')}</p>
            <p className="mb-2 text-lg font-black nombres-latins" dir="ltr">{contact.tel}</p>
            <div className="flex gap-2">
              <a href={lienAppel(contact.tel)} className="flex-1">
                <Bouton className="w-full" taille="petit">📞 {t('annuaire.appeler')}</Bouton>
              </a>
              <a href={lienWhatsApp(contact.whatsapp || contact.tel, `[${demande.code}] ${t('lien.entete')}`)}
                 target="_blank" rel="noopener noreferrer" className="flex-1">
                <Bouton className="w-full" taille="petit" variante="succes">💬 WhatsApp</Bouton>
              </a>
            </div>
          </div>
        ) : demande.a_contact ? (
          <p className="aide">🔒 {engage ? t('pro.contactRefuse') : t('pro.contactApres')}</p>
        ) : (
          <p className="aide">{t('pro.contactMasque')}</p>
        )}
      </div>

      <Champ etiquette={t('pro.repondre')}>
        <input className="champ" maxLength={200} value={message}
               onChange={(e) => setMessage(e.target.value)} />
      </Champ>

      {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}

      {engage && (
        <div className="mb-3"><Alerte ton="succes">{t('pro.engagementEnregistre')}</Alerte></div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Bouton variante="urgence" onClick={() => repondre('en_route')} enCours={enCours === 'en_route'}>
          🏃 {t('action.boutonEnRoute')}
        </Bouton>
        <Bouton onClick={() => repondre('appelle')} enCours={enCours === 'appelle'}>
          📞 {t('action.boutonAppelle')}
        </Bouton>
        <Bouton variante="succes" onClick={() => repondre('whatsapp')} enCours={enCours === 'whatsapp'}>
          💬 {t('action.boutonWhatsapp')}
        </Bouton>
        <Bouton variante="secondaire" onClick={() => repondre('indisponible')} enCours={enCours === 'indisponible'}>
          ✋ {t('action.boutonIndisponible')}
        </Bouton>
        <Bouton variante="discret" className="col-span-2" onClick={() => repondre('resolu')} enCours={enCours === 'resolu'}>
          ✅ {t('action.boutonResolu')}
        </Bouton>
        {engage && (
          <Bouton variante="secondaire" className="col-span-2" onClick={onFermer}>
            {t('pro.terminer')}
          </Bouton>
        )}
      </div>
    </Modale>
  )
}

const Ligne = ({ cle, val }) => val ? (
  <div className="flex gap-2"><dt aria-hidden="true">{cle}</dt><dd className="min-w-0 flex-1">{val}</dd></div>
) : null

/* ------------------------------------------------------------------ */
function ListeOrdonnances({ pro, bloque }) {
  const { t, langue } = useLangue()
  const [liste, setListe] = useState(null)
  const [choisie, setChoisie] = useState(null)

  const charger = useCallback(() => {
    db.ordonnancesZone().then(setListe).catch(() => setListe([]))
  }, [])
  useEffect(() => { charger(); const i = setInterval(charger, 20000); return () => clearInterval(i) }, [charger])

  if (bloque) return <Vide emoji="🔒" titre={t('pro.expire')} />
  if (liste === null) return <Chargement />
  if (!liste.length) return <Vide emoji="💊" titre={t('pro.aucuneOrdonnance')} />

  return (
    <>
      <ul className="space-y-2">
        {liste.map((o) => (
          <li key={o.id}>
            <button onClick={() => setChoisie(o)} className="carte block w-full p-3 text-start">
              <div className="flex items-center gap-2">
                <span className="font-black tracking-widest nombres-latins" dir="ltr">{o.code}</span>
                <span className="ms-auto text-[12px] text-nil-900/50">{ilYA(o.created_at, langue)}</span>
              </div>
              <p className="text-[14px]">📍 {[o.quartier_nom, o.ville_nom].filter(Boolean).join(', ')}</p>
              {o.note && <p className="text-[14px] text-nil-900/70">{o.note}</p>}
              <p className="mt-1 flex flex-wrap gap-1 text-[12px]">
                <span className="puce bg-sable-100 text-nil-900/60">
                  {o.diffusion ? '📢 ' + t('ordo.diffusion') : '🎯 ' + t('ordo.ciblee')}
                </span>
                {o.livraison_souhaitee && <span className="puce bg-nil-50 text-nil-700">🛵 {t('ordo.livraison')}</span>}
                {o.mes_reponses?.length > 0 && <span className="puce bg-green-100 text-green-800">✓ {t('pro.dejaRepondu')}</span>}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <ModaleOrdonnance ordonnance={choisie} onFermer={() => { setChoisie(null); charger() }} />
    </>
  )
}

function ModaleOrdonnance({ ordonnance, onFermer }) {
  const { t } = useLangue()
  const [image, setImage] = useState(null)
  const [f, setF] = useState({ disponibilite: 'complete', prix: '', livraison: false, message: '' })
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    setImage(null); setF({ disponibilite: 'complete', prix: '', livraison: false, message: '' })
    if (ordonnance?.image_url) db.urlSignee(ordonnance.image_url).then(setImage).catch(() => {})
  }, [ordonnance])

  if (!ordonnance) return null

  const envoyer = async () => {
    setEnCours(true)
    try {
      await db.repondreOrdonnance({ ordonnanceId: ordonnance.id, ...f })
      onFermer()
    } finally { setEnCours(false) }
  }

  return (
    <Modale ouverte onFermer={onFermer} titre={t('pro.repondreOrdo')}>
      {image ? (
        <a href={image} target="_blank" rel="noopener noreferrer">
          <img src={image} alt={t('pro.voirOrdonnance')} className="mx-auto max-h-64 rounded-xl object-contain" />
        </a>
      ) : (
        <p className="aide">{t('pro.voirOrdonnance')} —</p>
      )}
      {ordonnance.note && <p className="mt-2 text-[14px]">{ordonnance.note}</p>}

      <Champ etiquette={t('ordo.reponses')}>
        <Selecteur valeur={f.disponibilite} onChange={(v) => setF({ ...f, disponibilite: v })} options={[
          { valeur: 'complete', libelle: '✅ ' + t('ordo.complete') },
          { valeur: 'partielle', libelle: '🟡 ' + t('ordo.partielle') },
          { valeur: 'indisponible', libelle: '⛔ ' + t('ordo.indisponible') },
        ]} />
      </Champ>

      {f.disponibilite !== 'indisponible' && (
        <>
          <Champ etiquette={t('ordo.prix')}>
            <input className="champ" maxLength={60} placeholder={t('pro.prixPlaceholder')}
                   value={f.prix} onChange={(e) => setF({ ...f, prix: e.target.value })} />
          </Champ>
          <Champ>
            <Case coche={f.livraison} onChange={(v) => setF({ ...f, livraison: v })}>
              🛵 {t('pro.proposeLivraison')}
            </Case>
          </Champ>
        </>
      )}

      <Champ etiquette={t('pro.messagePharmacie')}>
        <textarea className="champ" rows={2} maxLength={200} value={f.message}
                  onChange={(e) => setF({ ...f, message: e.target.value })} />
      </Champ>

      <Bouton className="w-full" onClick={envoyer} enCours={enCours}>{t('commun.envoyer')}</Bouton>
      <p className="aide mt-3">{t('ordo.legal')}</p>
    </Modale>
  )
}

/* ------------------------------------------------------------------ */
function ProfilPro({ pro, surChangement }) {
  const { t } = useLangue()
  const [f, setF] = useState({
    nom: pro.nom || '', specialite: pro.specialite || '', horaires: pro.horaires || '',
    adresse_texte: pro.adresse_texte || '', whatsapp: pro.whatsapp || '',
    zone: { provinceCode: '', villeCode: pro.ville_code || '', quartierNom: pro.quartier_nom || '' },
  })
  const [ok, setOk] = useState(false)
  const [enCours, setEnCours] = useState(false)

  const enregistrer = async () => {
    setEnCours(true); setOk(false)
    try {
      await db.majPro(pro.id, {
        nom: f.nom, specialite: f.specialite, horaires: f.horaires,
        adresse_texte: f.adresse_texte, whatsapp: f.whatsapp,
        ...(f.zone.villeCode && f.zone.villeCode !== pro.ville_code
          ? { villeCode: f.zone.villeCode, quartierNom: f.zone.quartierNom }
          : {}),
      })
      setOk(true); surChangement?.()
    } finally { setEnCours(false) }
  }

  return (
    <div>
      <Champ etiquette={t('pro.nom')}><input className="champ" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
      <Champ etiquette={t('pro.specialite')}><input className="champ" value={f.specialite} onChange={(e) => setF({ ...f, specialite: e.target.value })} /></Champ>
      <Champ etiquette={t('pro.horaires')}><input className="champ" value={f.horaires} onChange={(e) => setF({ ...f, horaires: e.target.value })} /></Champ>
      <Champ etiquette={t('pro.adresse')}><input className="champ" value={f.adresse_texte} onChange={(e) => setF({ ...f, adresse_texte: e.target.value })} /></Champ>
      <Champ etiquette={t('pro.whatsapp')}>
        <input className="champ nombres-latins" dir="ltr" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
      </Champ>

      <div className="mb-4 rounded-xl border-2 border-sable-300 bg-white p-3">
        <p className="etiquette">{t('aide.e3Zone')}</p>
        <SelecteurZone valeur={f.zone} onChange={(z) => setF({ ...f, zone: z })} avecGps={false} />
      </div>

      {ok && <div className="mb-3"><Alerte ton="succes">{t('pro.monProfilMaj')}</Alerte></div>}
      <Bouton className="w-full" onClick={enregistrer} enCours={enCours}>{t('commun.enregistrer')}</Bouton>
    </div>
  )
}
