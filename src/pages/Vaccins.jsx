/* Vaccination : le carnet des enfants, sur le telephone.
   ---------------------------------------------------------------------
   Une mere doit comprendre en un regard : quel enfant est a jour, lequel
   a un vaccin en retard, et quand est le prochain rendez-vous. Tout le
   reste (campagnes, actualites, ou aller) vient apres, replie.
   Le carnet ne quitte jamais le telephone. Une seule chose peut partir,
   si la famille l'accepte : « une dose de tel vaccin a ete faite dans
   telle ville, a tel age », sans nom ni date de naissance. */
import { useEffect, useMemo, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { carnet, prefs } from '../lib/store'
import { CALENDRIER, evaluerCarnet, parRendezVous, resumeEnfant, ageLisible, ageJours, dateISO, icsRendezVous, texteCarnet, campagneConcerne } from '../lib/vaccins'
import { telechargerTexte, dateCourte } from '../lib/format'
import { lienWhatsAppPartage } from '../lib/links'
import { Lien, naviguer } from '../lib/router'
import { Bouton, Entete, Champ, Alerte, Modale, Vide, Case } from '../components/base'

const STATUT_STYLE = {
  fait: 'bg-green-50 border-green-200 text-green-900',
  a_faire: 'bg-soleil-100 border-soleil-300 text-soleil-700',
  en_retard: 'bg-urgence-50 border-urgence-100 text-urgence-800',
  a_venir: 'bg-white border-sable-300 text-nil-900/70',
}
const STATUT_EMOJI = { fait: '✅', a_faire: '🟡', en_retard: '🔴', a_venir: '⏳' }

export default function Vaccins({ requete }) {
  const { t, langue } = useLangue()
  const [enfants, setEnfants] = useState(carnet.enfants())
  const [ouvert, setOuvert] = useState(requete?.get('enfant') || null)
  const [ajout, setAjout] = useState(false)
  const [campagnes, setCampagnes] = useState([])
  const [actus, setActus] = useState([])
  const zone = prefs.zone()

  const rafraichir = () => setEnfants(carnet.enfants())

  useEffect(() => {
    db.campagnesActives({ provinceCode: zone?.provinceCode }).then(setCampagnes).catch(() => {})
    db.publications({ type: ['vaccination', 'alerte'], limite: 5 }).then(setActus).catch(() => {})
  }, [zone?.provinceCode])

  const enfant = enfants.find((e) => e.id === ouvert)
  if (enfant) {
    return <FicheEnfant enfant={enfant} campagnes={campagnes} zone={zone} t={t} langue={langue}
                        surRetour={() => { setOuvert(null); rafraichir() }} surChangement={rafraichir} />
  }

  return (
    <div>
      <Entete titre={t('vac.titre')} sousTitre={t('vac.sousTitre')} />

      {campagnes.length > 0 && (
        <div className="mb-3 space-y-2">
          {campagnes.map((c) => <CarteCampagne key={c.id} c={c} t={t} />)}
        </div>
      )}

      {enfants.length === 0 ? (
        <Vide emoji="💉" titre={t('vac.videTitre')} detail={t('vac.videDetail')}
              action={<Bouton onClick={() => setAjout(true)}>➕ {t('vac.ajouter')}</Bouton>} />
      ) : (
        <ul className="space-y-2">
          {enfants.map((e) => {
            const r = resumeEnfant(e)
            const etat = r.retard ? 'en_retard' : r.aFaire ? 'a_faire' : 'fait'
            return (
              <li key={e.id}>
                <button onClick={() => setOuvert(e.id)} className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-start ${STATUT_STYLE[etat]}`}>
                  <span className="text-2xl" aria-hidden="true">{e.sexe === 'F' ? '👧' : e.sexe === 'M' ? '👦' : '🧒'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-black leading-tight">{e.prenom}</span>
                    <span className="block text-[13px] opacity-80">{ageLisible(e.naissance, t)}</span>
                    <span className="mt-1 block text-sm font-bold">
                      {STATUT_EMOJI[etat]}{' '}
                      {r.retard ? t('vac.enRetardN', { n: r.retard }) : r.aFaire ? t('vac.aFaireMaintenant') : t('vac.aJour')}
                    </span>
                    {r.prochain && !r.retard && !r.aFaire && (
                      <span className="block text-[13px] opacity-80">{t('vac.prochain', { date: dateCourte(r.prochain.prevue + 'T08:00:00', langue).split(' ')[0] })}</span>
                    )}
                  </span>
                  <span aria-hidden="true" className="text-xl opacity-60">›</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {enfants.length > 0 && (
        <Bouton variante="secondaire" className="mt-3 w-full" onClick={() => setAjout(true)}>➕ {t('vac.ajouter')}</Bouton>
      )}

      <Lien vers="/annuaire?onglet=centres" className="mt-4 block">
        <div className="carte flex items-center gap-3 p-3">
          <span className="text-2xl" aria-hidden="true">🏥</span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold leading-tight">{t('vac.ouVacciner')}</span>
            <span className="aide block">{t('vac.ouVaccinerDetail')}</span>
          </span>
          <span aria-hidden="true" className="text-nil-600">›</span>
        </div>
      </Lien>

      {actus.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold text-nil-900/60">{t('vac.actualites')}</h2>
          <ul className="space-y-2">
            {actus.map((a) => (
              <li key={a.id} className={`carte p-3 ${a.type === 'alerte' ? 'border-2 border-urgence-100' : ''}`}>
                <p className="font-bold leading-tight">{a.type === 'alerte' ? '⚠️ ' : ''}{a.titre}</p>
                <p className="mt-1 whitespace-pre-line text-[13px] text-nil-900/80">{a.corps}</p>
                <p className="aide mt-1">{[a.province_nom || t('vac.national'), a.publie_le ? dateCourte(a.publie_le, langue) : null].filter(Boolean).join(' · ')}
                  {a.lien && <> · <a className="lien" href={a.lien} target="_blank" rel="noopener noreferrer">{t('vac.source')}</a></>}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="aide mt-4 text-center">🔒 {t('vac.confidentialite')}</p>
      <p className="aide mt-1 text-center opacity-70">{t('vac.calendrierNote')}</p>

      <Modale ouverte={ajout} onFermer={() => setAjout(false)} titre={t('vac.ajouter')}>
        <FormulaireEnfant t={t} surFait={(e) => { carnet.ajouter(e); setAjout(false); rafraichir() }} />
      </Modale>
    </div>
  )
}

function CarteCampagne({ c, t }) {
  return (
    <div className="rounded-2xl border-2 border-nil-600 bg-nil-50 p-3">
      <p className="text-[12px] font-bold uppercase tracking-wide text-nil-700/70">📣 {t('vac.campagne')}{c.province_nom ? ` · ${c.province_nom}` : ''}</p>
      <p className="font-black leading-tight text-nil-900">{c.nom}</p>
      <p className="text-[13px] text-nil-900/80">
        {t('vac.campagneDates', { debut: c.debut.split('-').reverse().join('/'), fin: c.fin.split('-').reverse().join('/') })}
        {' · '}{t('vac.campagneAge', { min: c.age_min_mois, max: c.age_max_mois })}
      </p>
      {c.lieux && <p className="text-[13px] text-nil-900/80">📍 {c.lieux}</p>}
      {c.message && <p className="mt-1 text-sm">{c.message}</p>}
    </div>
  )
}

function FormulaireEnfant({ t, surFait, initial }) {
  const [prenom, setPrenom] = useState(initial?.prenom || '')
  const [naissance, setNaissance] = useState(initial?.naissance || '')
  const [sexe, setSexe] = useState(initial?.sexe || '')
  const [erreur, setErreur] = useState('')
  const auj = dateISO(new Date())
  const valider = () => {
    if (!prenom.trim()) return setErreur(t('vac.erreurPrenom'))
    if (!naissance || naissance > auj || ageJours(naissance) > 365 * 18) return setErreur(t('vac.erreurNaissance'))
    surFait({ prenom: prenom.trim(), naissance, sexe: sexe || null })
  }
  return (
    <div className="space-y-3">
      <Champ etiquette={t('vac.prenom')} aide={t('vac.prenomAide')} obligatoire>
        <input className="champ" value={prenom} onChange={(e) => setPrenom(e.target.value)} maxLength={40} autoFocus />
      </Champ>
      <Champ etiquette={t('vac.naissance')} obligatoire>
        <input className="champ" type="date" value={naissance} max={auj} onChange={(e) => setNaissance(e.target.value)} />
      </Champ>
      <Champ etiquette={t('vac.sexe')}>
        <div className="flex gap-2">
          {[['F', t('vac.fille')], ['M', t('vac.garcon')], ['', t('vac.nonPrecise')]].map(([v, l]) => (
            <button key={v} onClick={() => setSexe(v)} aria-pressed={sexe === v}
                    className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold ${sexe === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>{l}</button>
          ))}
        </div>
      </Champ>
      {erreur && <Alerte ton="danger">{erreur}</Alerte>}
      <Bouton className="w-full" onClick={valider}>{t('commun.enregistrer')}</Bouton>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function FicheEnfant({ enfant, campagnes, zone, t, langue, surRetour, surChangement }) {
  const [marquage, setMarquage] = useState(null)       // dose en cours de pointage
  const [partage, setPartage] = useState(carnet.partage())
  const [demandePartage, setDemandePartage] = useState(null)   // { dose, date } en attente de reponse
  const [confirmeRetrait, setConfirmeRetrait] = useState(false)
  const evaluation = useMemo(() => evaluerCarnet(enfant), [enfant])
  const rendezVous = useMemo(() => parRendezVous(evaluation), [evaluation])
  const resume = resumeEnfant(enfant)
  const campagnesPourLui = campagnes.filter((c) => campagneConcerne(c, enfant))
  const nomVaccin = (v) => v.nom[langue] || v.nom.fr
  const lib = (d) => d.libelle[langue] || d.libelle.fr

  /* Declaration anonyme : une fois acceptee, elle part a chaque dose sans
     rien demander ; refusee, on ne redemande jamais. */
  const declarer = (dose, date) => {
    if (!zone?.villeCode) return
    const ageMois = Math.floor(ageJours(enfant.naissance, date) / 30.44)
    const aLHeure = ageJours(enfant.naissance, date) <= dose.age + (dose.age === 0 ? CALENDRIER.graceNaissanceJours : CALENDRIER.graceJours)
    db.declarerVaccin({ villeCode: zone.villeCode, vaccin: dose.code, dose: dose.n, ageMois, aLHeure }).catch(() => {})
  }
  const pointer = (dose, date) => {
    carnet.marquer(enfant.id, dose.cle, date)
    setMarquage(null); surChangement()
    if (partage === true) declarer(dose, date)
    else if (partage === null) setDemandePartage({ dose, date })
  }
  const repondrePartage = (oui) => {
    carnet.definirPartage(oui); setPartage(oui)
    if (oui && demandePartage) declarer(demandePartage.dose, demandePartage.date)
    setDemandePartage(null)
  }
  const retirerDose = (dose) => { carnet.marquer(enfant.id, dose.cle, null); surChangement() }

  const texte = texteCarnet(enfant, t, langue)
  const etat = resume.retard ? 'en_retard' : resume.aFaire ? 'a_faire' : 'fait'

  return (
    <div>
      <Entete titre={enfant.prenom} sousTitre={`${ageLisible(enfant.naissance, t)} · ${t('vac.neLe')} ${enfant.naissance.split('-').reverse().join('/')}`}
              action={<button onClick={surRetour} className="lien text-sm">{t('vac.tousLesEnfants')}</button>} />

      <div className={`mb-3 rounded-2xl border-2 p-3 ${STATUT_STYLE[etat]}`}>
        <p className="text-lg font-black">
          {STATUT_EMOJI[etat]} {resume.retard ? t('vac.enRetardN', { n: resume.retard }) : resume.aFaire ? t('vac.aFaireMaintenant') : t('vac.aJour')}
        </p>
        <p className="text-[13px] opacity-80">{t('vac.progression', { faites: resume.faites, total: resume.total })}</p>
        {resume.retard > 0 && <p className="mt-1 text-sm">{t('vac.retardConseil')}</p>}
      </div>

      {campagnesPourLui.map((c) => <div key={c.id} className="mb-3"><CarteCampagne c={c} t={t} /></div>)}

      <ol className="space-y-2">
        {rendezVous.map((rv) => (
          <li key={rv.age} className={`rounded-2xl border-2 p-3 ${STATUT_STYLE[rv.statut]}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-black">{STATUT_EMOJI[rv.statut]} {lib(rv.doses[0].dose)}</p>
              <p className="text-[13px] opacity-80 nombres-latins">{rv.prevue.split('-').reverse().join('/')}</p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {rv.doses.map((d) => (
                <li key={d.cle} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{nomVaccin(d.vaccin)}</span>
                    {d.total > 1 && <span className="opacity-70"> {d.n}/{d.total}</span>}
                    {d.optionnelle && <span className="opacity-60"> · {t('vac.selonCentre')}</span>}
                    {d.faitLe && <span className="block text-[12px] opacity-70 nombres-latins">{t('vac.faitLe', { date: d.faitLe.split('-').reverse().join('/') })}</span>}
                  </span>
                  {d.statut === 'fait' ? (
                    <button onClick={() => retirerDose(d)} className="shrink-0 text-[12px] underline opacity-70">{t('commun.annuler')}</button>
                  ) : (
                    <button onClick={() => setMarquage(d)}
                            className="shrink-0 rounded-xl border-2 border-current bg-white/60 px-3 py-1.5 text-sm font-bold">
                      {t('vac.marquerFait')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {rv.doses.some((d) => d.vaccin.note && d.statut !== 'fait') && (
              <p className="mt-2 text-[12px] opacity-80">ℹ️ {rv.doses.find((d) => d.vaccin.note).vaccin.note[langue] || rv.doses.find((d) => d.vaccin.note).vaccin.note.fr}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Bouton variante="secondaire" taille="petit" onClick={() => telechargerTexte(icsRendezVous(enfant, t), `afiya-${enfant.prenom}.ics`, 'text/calendar;charset=utf-8')}>
          📅 {t('vac.rappelCalendrier')}
        </Bouton>
        <a href={lienWhatsAppPartage(texte)} target="_blank" rel="noopener noreferrer">
          <Bouton variante="succes" taille="petit" className="w-full">💬 {t('commun.partager')}</Bouton>
        </a>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Lien vers="/annuaire?onglet=centres"><Bouton variante="discret" taille="petit" className="w-full">🏥 {t('vac.ouVacciner')}</Bouton></Lien>
        <Lien vers={`/alerte?type=autre&contexte=mapi&age=${Math.floor(ageJours(enfant.naissance) / 30.44)}`}>
          <Bouton variante="discret" taille="petit" className="w-full">⚠️ {t('vac.effetIndesirable')}</Bouton>
        </Lien>
      </div>

      <p className="aide mt-4 text-center">🔒 {t('vac.confidentialite')}{partage === true ? ' ' + t('vac.partageActif') : ''}
        {partage !== null && <> <button className="underline" onClick={() => { carnet.definirPartage(null); setPartage(null) }}>{t('vac.partageChanger')}</button></>}
      </p>
      {!confirmeRetrait ? (
        <button className="mt-3 block w-full text-center text-[13px] text-urgence-600 underline" onClick={() => setConfirmeRetrait(true)}>{t('vac.retirerEnfant')}</button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Bouton variante="danger" taille="petit" className="flex-1" onClick={() => { carnet.retirer(enfant.id); surRetour() }}>{t('commun.confirmer')}</Bouton>
          <Bouton variante="secondaire" taille="petit" className="flex-1" onClick={() => setConfirmeRetrait(false)}>{t('commun.annuler')}</Bouton>
        </div>
      )}

      {/* Pointage d'une dose : la date, c'est tout. */}
      <Modale ouverte={!!marquage} onFermer={() => setMarquage(null)} titre={marquage ? `${nomVaccin(marquage.vaccin)}${marquage.total > 1 ? ` ${marquage.n}/${marquage.total}` : ''}` : ''}>
        {marquage && <PointageDose dose={marquage} enfant={enfant} t={t} surFait={(date) => pointer(marquage, date)} />}
      </Modale>

      {/* Une seule question, une seule fois. */}
      <Modale ouverte={!!demandePartage} onFermer={() => repondrePartage(false)} titre={t('vac.partageTitre')}>
        <p className="text-sm">{t('vac.partageTexte')}</p>
        <p className="aide mt-2">{t('vac.partageDetail')}</p>
        <div className="mt-4 flex gap-2">
          <Bouton className="flex-1" onClick={() => repondrePartage(true)}>{t('vac.partageOui')}</Bouton>
          <Bouton variante="secondaire" className="flex-1" onClick={() => repondrePartage(false)}>{t('vac.partageNon')}</Bouton>
        </div>
      </Modale>
    </div>
  )
}

function PointageDose({ dose, enfant, t, surFait }) {
  const auj = dateISO(new Date())
  const [date, setDate] = useState(auj)
  const ok = date && date <= auj && date >= enfant.naissance
  return (
    <div className="space-y-3">
      <Champ etiquette={t('vac.dateDose')} aide={t('vac.dateDoseAide')}>
        <input className="champ" type="date" value={date} min={enfant.naissance} max={auj} onChange={(e) => setDate(e.target.value)} />
      </Champ>
      <div className="flex gap-2">
        <Bouton variante="secondaire" taille="petit" onClick={() => setDate(auj)}>{t('vac.aujourdhui')}</Bouton>
        <Bouton variante="secondaire" taille="petit" onClick={() => setDate(dose.prevue <= auj ? dose.prevue : auj)}>{t('vac.dateprevue')}</Bouton>
      </div>
      <Bouton className="w-full" onClick={() => ok && surFait(date)}>{t('vac.confirmerDose')}</Bouton>
    </div>
  )
}
