/* Entraide entre soignants et partage de connaissances.
   ---------------------------------------------------------------------
   Deux usages dans le meme espace :
   - Questions : un infirmier seul dans un centre de sante decrit une
     situation et demande conseil ; les medecins disponibles repondent.
   - Partages et protocoles : un soignant raconte ce qu'il a appris (une
     epidemie, une prise en charge, une organisation qui marche) ou
     publie une conduite a tenir ; tout soignant actif peut commenter.
   Jamais de nom de patient, jamais de numero : la base refuse un texte
   qui contient un numero de telephone. Si l'auteur l'accepte, un medecin
   peut poursuivre sur WhatsApp, le numero n'etant revele qu'a lui, et
   qu'a ce moment-la. La recherche porte sur le titre et le texte : les
   fils clos restent lisibles et forment la memoire collective. */
import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { ilYA } from '../../lib/format'
import { lienWhatsApp } from '../../lib/links'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Vide, Modale, Case, ChoixCartes } from '../../components/base'

const SPECIALITES = ['pediatrie', 'obstetrique', 'urgences', 'infectieux', 'chirurgie', 'medecine_interne', 'sante_mentale', 'pharmacie', 'autre']
const URGENCE = { 1: 'bg-urgence-50 border-urgence-100 text-urgence-800', 2: 'bg-soleil-100 border-soleil-300 text-soleil-700', 3: 'bg-white border-sable-300 text-nil-900' }
const STATUT = { ouvert: 'bg-nil-50 text-nil-700', repondu: 'bg-green-50 text-green-900', clos: 'bg-sable-200 text-nil-900/60' }
const GENRES = ['question', 'partage', 'protocole']
const EMOJI_GENRE = { question: '🙋', partage: '💡', protocole: '📋' }

export default function Entraide({ pro, bloque }) {
  const { t, langue } = useLangue()
  const [genre, setGenre] = useState('question')          // question | savoir (partages + protocoles)
  const [filtre, setFiltre] = useState('actifs')
  const [recherche, setRecherche] = useState('')
  const [liste, setListe] = useState(null)
  const [ouvert, setOuvert] = useState(null)
  const [creation, setCreation] = useState(false)
  const medecin = pro.type === 'medecin'

  const charger = useCallback(() => {
    setListe(null)
    const p = filtre === 'miens' ? { miens: true } : { statut: filtre }
    if (recherche.trim().length >= 2) { p.recherche = recherche.trim(); delete p.statut }
    db.casEntraide({ ...p, genre: genre === 'question' ? 'question' : 'savoir' }).then(setListe).catch(() => setListe([]))
  }, [filtre, genre, recherche])
  useEffect(() => { const id = setTimeout(charger, recherche ? 350 : 0); return () => clearTimeout(id) }, [charger, recherche])

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {[['question', '🙋 ' + t('entraide.ongletQuestions')], ['savoir', '💡 ' + t('entraide.ongletSavoir')]].map(([v, l]) => (
          <button key={v} onClick={() => { setGenre(v); setFiltre('actifs') }} aria-pressed={genre === v}
                  className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold ${genre === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>{l}</button>
        ))}
      </div>

      <div className="mb-3 rounded-xl border-2 border-nil-200 bg-nil-50 p-3 text-[13px] text-nil-900/80">
        {genre === 'savoir' ? t('entraide.introSavoir') : medecin ? t('entraide.introMedecin') : t('entraide.intro')}
      </div>

      {!bloque && (
        <Bouton className="mb-3 w-full" onClick={() => setCreation(true)}>
          {genre === 'savoir' ? '💡 ' + t('entraide.partager') : '🙋 ' + t('entraide.demander')}
        </Bouton>
      )}

      <input className="champ mb-3" type="search" placeholder={t('entraide.rechercher')} value={recherche} onChange={(e) => setRecherche(e.target.value)} />

      {!recherche && (
        <div className="mb-3 flex gap-2">
          {[['actifs', t(genre === 'savoir' ? 'entraide.recents' : 'entraide.ouverts')], ['clos', t('entraide.clos')], ['miens', t('entraide.miens')]].map(([v, l]) => (
            <button key={v} onClick={() => setFiltre(v)} aria-pressed={filtre === v}
                    className={`flex-1 rounded-full border-2 py-1.5 text-sm font-bold ${filtre === v ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>{l}</button>
          ))}
        </div>
      )}

      {liste === null ? <Chargement /> : liste.length === 0 ? (
        genre === 'savoir'
          ? <Vide emoji="💡" titre={t('entraide.aucunSavoir')} detail={t('entraide.aucunSavoirDetail')} />
          : <Vide emoji="🤝" titre={t('entraide.aucun')} detail={t(medecin ? 'entraide.aucunMedecin' : 'entraide.aucunDetail')} />
      ) : (
        <ul className="space-y-2">
          {liste.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOuvert(c)} className={`w-full rounded-2xl border-2 p-3 text-start ${(c.genre || 'question') === 'question' ? (URGENCE[c.urgence] || URGENCE[3]) : 'border-sable-300 bg-white text-nil-900'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold leading-tight">{(c.genre || 'question') !== 'question' ? EMOJI_GENRE[c.genre] + ' ' : ''}{c.titre}</p>
                  <span className={`puce shrink-0 ${STATUT[c.statut]}`}>{t('entraide.statut.' + c.statut)}</span>
                </div>
                <p className="mt-1 text-[13px] opacity-80">
                  {(c.genre || 'question') === 'question' ? t('entraide.urgence.' + c.urgence) : t('entraide.genre.' + c.genre)}{c.specialite ? ` · ${t('entraide.specialite.' + c.specialite)}` : ''}
                </p>
                <p className="text-[12px] opacity-70 nombres-latins">
                  {[c.auteur_type ? t('typePro.' + c.auteur_type) : null, c.ville_nom, ilYA(c.created_at, langue)].filter(Boolean).join(' · ')}
                  {' · '}💬 {c.nb_reponses}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modale ouverte={creation} onFermer={() => setCreation(false)} titre={t(genre === 'savoir' ? 'entraide.partager' : 'entraide.demander')}>
        <FormulaireCas t={t} genreInitial={genre === 'savoir' ? 'partage' : 'question'}
                       surFait={(g) => { setCreation(false); setGenre(g === 'question' ? 'question' : 'savoir'); setFiltre('miens'); setRecherche('') }} />
      </Modale>

      <Modale ouverte={!!ouvert} onFermer={() => { setOuvert(null); charger() }} titre={ouvert?.titre || ''}>
        {ouvert && <FilCas cas={ouvert} pro={pro} t={t} langue={langue} surChangement={(c) => setOuvert(c)} />}
      </Modale>
    </div>
  )
}

function FormulaireCas({ t, surFait, genreInitial = 'question' }) {
  const [f, setF] = useState({ genre: genreInitial, specialite: '', urgence: 2, titre: '', description: '', whatsappOk: genreInitial === 'question' })
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const maj = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const question = f.genre === 'question'
  const envoyer = async () => {
    if (f.titre.trim().length < 5) return setErreur(t('entraide.erreurTitre'))
    if (f.description.trim().length < 10) return setErreur(t('entraide.erreurDescription'))
    if (/\d{6,}/.test(f.titre) || /\d{8,}/.test(f.description)) return setErreur(t('entraide.erreurNumero'))
    setEnvoi(true); setErreur('')
    try { await db.creerCas({ ...f, titre: f.titre.trim(), description: f.description.trim() }); surFait(f.genre) }
    catch (e) { setErreur(/IDENTIFIANT/.test(e?.message) ? t('entraide.erreurNumero') : t('commun.erreurReseau')); setEnvoi(false) }
  }
  return (
    <div>
      <Alerte ton="info">{t('entraide.regle')}</Alerte>
      <div className="mt-3">
        <Champ etiquette={t('entraide.genreTitre')}>
          <ChoixCartes valeur={f.genre} onChange={(v) => maj('genre', v)} colonnes={1}
                       options={GENRES.map((g) => ({ valeur: g, emoji: EMOJI_GENRE[g], libelle: t('entraide.genre.' + g), detail: t('entraide.genreDetail.' + g) }))} />
        </Champ>
        {question && (
          <Champ etiquette={t('entraide.urgenceTitre')}>
            <ChoixCartes valeur={f.urgence} onChange={(v) => maj('urgence', v)} colonnes={1}
                         options={[1, 2, 3].map((n) => ({ valeur: n, emoji: ['🔴', '🟠', '🟢'][n - 1], libelle: t('entraide.urgence.' + n), detail: t('entraide.urgenceDetail.' + n) }))} />
          </Champ>
        )}
        <Champ etiquette={t('entraide.specialiteTitre')}>
          <Selecteur valeur={f.specialite} onChange={(v) => maj('specialite', v)} placeholder={t('entraide.specialiteChoisir')}
                     options={SPECIALITES.map((s) => ({ valeur: s, libelle: t('entraide.specialite.' + s) }))} />
        </Champ>
        <Champ etiquette={t(question ? 'entraide.titreCas' : 'entraide.titreSavoir')} obligatoire>
          <input className="champ" value={f.titre} onChange={(e) => maj('titre', e.target.value)} maxLength={140} placeholder={t(question ? 'entraide.titreExemple' : 'entraide.titreSavoirExemple')} />
        </Champ>
        <Champ etiquette={t(question ? 'entraide.descriptionCas' : 'entraide.descriptionSavoir')} aide={t(question ? 'entraide.descriptionAide' : 'entraide.descriptionSavoirAide')} obligatoire>
          <textarea className="champ min-h-[8rem]" value={f.description} onChange={(e) => maj('description', e.target.value)} maxLength={3000} />
        </Champ>
        <Case coche={f.whatsappOk} onChange={(v) => maj('whatsappOk', v)}>{t('entraide.whatsappOk')}</Case>
        {erreur && <div className="mt-3"><Alerte ton="danger">{erreur}</Alerte></div>}
        <Bouton className="mt-4 w-full" onClick={envoyer} enCours={envoi}>{t(question ? 'entraide.publier' : 'entraide.publierSavoir')}</Bouton>
      </div>
    </div>
  )
}

function FilCas({ cas, pro, t, langue, surChangement }) {
  const [reponses, setReponses] = useState(null)
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState('')
  const [contact, setContact] = useState(undefined)
  const auteur = cas.auteur_pro === pro.id
  const savoir = (cas.genre || 'question') !== 'question'
  // Une question : les medecins et l'auteur. Un partage ou un protocole :
  // tout soignant actif peut commenter (politique SQL rep_cas_depot).
  const peutRepondre = (savoir || pro.type === 'medecin' || auteur) && cas.statut !== 'clos' && ['provisoire', 'verifie'].includes(pro.statut)

  const charger = useCallback(() => db.reponsesCas(cas.id).then(setReponses).catch(() => setReponses([])), [cas.id])
  useEffect(() => { charger() }, [charger])

  const repondre = async () => {
    if (texte.trim().length < 2) return
    if (/\d{8,}/.test(texte)) return setErreur(t('entraide.erreurNumero'))
    setErreur('')
    try {
      await db.repondreCas({ casId: cas.id, texte: texte.trim() }); setTexte('')
      const l = await db.casEntraide({ statut: cas.statut === 'clos' ? 'clos' : 'actifs' }).catch(() => [])
      const maj = l.find((x) => x.id === cas.id); if (maj) surChangement(maj)
      charger()
    } catch (e) { setErreur(/IDENTIFIANT/.test(e?.message) ? t('entraide.erreurNumero') : t('commun.erreurReseau')) }
  }
  const whatsapp = async () => {
    const num = await db.contactCas(cas.id).catch(() => null)
    setContact(num || null)
    if (num) window.open(lienWhatsApp(num, t('entraide.messageWhatsapp', { code: cas.code, titre: cas.titre })), '_blank', 'noopener')
  }
  const clore = async () => { await db.cloreCas(cas.id).catch(() => {}); surChangement({ ...cas, statut: 'clos' }) }

  return (
    <div>
      <p className="text-[12px] text-nil-900/60 nombres-latins">
        {cas.code} · {savoir ? t('entraide.genre.' + cas.genre) : t('entraide.urgence.' + cas.urgence)}{cas.specialite ? ` · ${t('entraide.specialite.' + cas.specialite)}` : ''} · {ilYA(cas.created_at, langue)}
      </p>
      <p className="text-[13px] text-nil-900/70">{[cas.auteur_type ? t('typePro.' + cas.auteur_type) : null, cas.ville_nom, cas.province_nom].filter(Boolean).join(' · ')}</p>
      <p className="mt-2 whitespace-pre-line text-sm">{cas.description}</p>

      <h3 className="mb-1 mt-4 text-sm font-bold text-nil-900/60">{t(savoir ? 'entraide.commentaires' : 'entraide.reponses')} ({reponses?.length ?? '…'})</h3>
      {reponses === null ? <Chargement /> : reponses.length === 0 ? (
        <p className="aide">{t(savoir ? 'entraide.pasEncoreCommentaire' : 'entraide.pasEncoreReponse')}</p>
      ) : (
        <ul className="space-y-2">
          {reponses.map((r) => (
            <li key={r.id} className={`rounded-xl p-3 ${r.auteur_pro === cas.auteur_pro ? 'bg-sable-100' : 'bg-nil-50'}`}>
              <p className="text-[12px] font-bold text-nil-700">
                {r.auteur_pro === cas.auteur_pro ? t('entraide.auteur') : (r.auteur_nom || t('typePro.medecin'))}
                {r.auteur_pro !== cas.auteur_pro && r.auteur_type ? ` · ${t('typePro.' + r.auteur_type)}` : ''}
                <span className="font-normal opacity-60"> · {ilYA(r.created_at, langue)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{r.texte}</p>
            </li>
          ))}
        </ul>
      )}

      {peutRepondre && (
        <div className="mt-3">
          <textarea className="champ min-h-[5rem]" value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={3000}
                    placeholder={t(savoir ? 'entraide.commentairePlaceholder' : auteur ? 'entraide.precisionPlaceholder' : 'entraide.reponsePlaceholder')} />
          {erreur && <div className="mt-2"><Alerte ton="danger">{erreur}</Alerte></div>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Bouton onClick={repondre} className="flex-1">{t(savoir ? 'entraide.commenter' : 'entraide.repondre')}</Bouton>
            {!auteur && cas.whatsapp_ok && (pro.type === 'medecin' || savoir) && (
              <Bouton variante="succes" onClick={whatsapp} className="flex-1">💬 WhatsApp</Bouton>
            )}
            {auteur && <Bouton variante="secondaire" onClick={clore}>{t('entraide.clore')}</Bouton>}
          </div>
          {contact === null && <p className="aide mt-2">{t('entraide.contactIndisponible')}</p>}
        </div>
      )}
      {cas.statut === 'clos' && <p className="aide mt-3">✅ {t('entraide.casClos')}</p>}
    </div>
  )
}
