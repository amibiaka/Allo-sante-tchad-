/* Le parcours d'urgence : trois ecrans, jamais plus.
   Chaque ecran tient sur un telephone de 360 px sans defilement inutile,
   et rien n'est obligatoire au-dela du strict necessaire (niveau, ville,
   consentement). */
import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { NIVEAUX, CATEGORIES, CONFIG } from '../lib/config'
import { db } from '../lib/db'
import { prefs, historique } from '../lib/store'
import { naviguer, Lien } from '../lib/router'
import { lienSuivi, messageDemande, lienWhatsApp, lienWhatsAppPartage } from '../lib/links'
import { Bouton, Entete, Champ, ChoixCartes, Case, Alerte } from '../components/base'
import { SelecteurZone } from '../components/zone'
import { SaisieVocale } from '../components/medias'

const TOTAL = 3

export default function DemandeAide() {
  const { t } = useLangue()
  const [etape, setEtape] = useState(1)
  const [envoi, setEnvoi] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [erreurs, setErreurs] = useState({})
  const [erreurGlobale, setErreurGlobale] = useState(null)

  const [f, setF] = useState(() => {
    const z = prefs.zone()
    return {
      pourQui: 'moi', niveau: null, categories: [], description: '', vocal: null,
      age: '', sexe: '', lieuTexte: '', contactTel: prefs.contact()?.tel || '',
      envoiWhatsapp: false, consentement: false,
      zone: z || { provinceCode: '', villeCode: '', quartierNom: '', quartierLibre: '' },
      lat: null, lng: null,
    }
  })
  const maj = (p) => setF((v) => ({ ...v, ...p }))

  useEffect(() => { window.scrollTo(0, 0) }, [etape])

  const valider = () => {
    const e = {}
    if (etape === 1 && !f.niveau) e.niveau = t('aide.erreurNiveau')
    if (etape === 3) {
      if (!f.zone?.villeCode) e.ville = t('aide.erreurLieu')
      if (!f.consentement) e.consentement = t('aide.erreurConsentement')
    }
    setErreurs(e)
    return Object.keys(e).length === 0
  }

  const suivant = () => { if (valider()) setEtape((n) => Math.min(TOTAL, n + 1)) }

  const envoyer = async () => {
    if (!valider()) return
    setEnvoi(true); setErreurGlobale(null)
    try {
      let vocalChemin = null
      if (f.vocal?.blob) {
        try { vocalChemin = (await db.televerser(f.vocal.blob, 'vocaux')).chemin } catch { /* on n'echoue pas pour un vocal */ }
      }
      const zoneVocale = f.zone
      // Sans indicatif, wa.me interprete « 66000000 » comme un numero
      // thailandais : le rappel WhatsApp du soignant ne joindrait personne.
      const tel = f.contactTel.replace(/\D/g, '')
      const telComplet = tel ? '+235' + tel : null
      const r = await db.creerDemande({
        pourQui: f.pourQui, niveau: f.niveau, categories: f.categories,
        description: f.description, vocalChemin,
        age: f.age, sexe: f.sexe,
        villeCode: zoneVocale.villeCode,
        quartierNom: zoneVocale.quartierNom || zoneVocale.quartierLibre || null,
        lieuTexte: [f.lieuTexte, zoneVocale.villeLibre].filter(Boolean).join(' — '),
        lat: f.lat ?? zoneVocale.lat ?? null, lng: f.lng ?? zoneVocale.lng ?? null,
        villeLibre: zoneVocale.villeLibre || null,
        contactTel: telComplet, contactWhatsapp: telComplet,
        contactVisible: false,
      })
      if (zoneVocale.quartierLibre) {
        db.suggererQuartier({ villeCode: zoneVocale.villeCode, nom: zoneVocale.quartierLibre }).catch(() => {})
      }
      prefs.definirZone(zoneVocale)
      if (f.contactTel) prefs.definirContact({ tel: f.contactTel })
      historique.ajouter({ code: r.code, type: 'demande', niveau: f.niveau })
      setResultat({ ...r, niveau: f.niveau })
    } catch (err) {
      setErreurGlobale(err.message || t('commun.erreur'))
    } finally {
      setEnvoi(false)
    }
  }

  if (resultat) return <Succes resultat={resultat} formulaire={f} />

  return (
    <div>
      <Entete titre={t('aide.titre')} sousTitre={t('commun.etape', { n: etape, total: TOTAL })} />

      <div className="mb-4 flex gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= etape ? 'bg-nil-600' : 'bg-sable-300'}`} />
        ))}
      </div>

      {etape === 1 && <Etape1 f={f} maj={maj} erreurs={erreurs} />}
      {etape === 2 && <Etape2 f={f} maj={maj} />}
      {etape === 3 && <Etape3 f={f} maj={maj} erreurs={erreurs} />}

      {erreurGlobale && <div className="mt-4"><Alerte ton="danger">{erreurGlobale}</Alerte></div>}

      <div className="barre-bas flex gap-2">
        {etape > 1 && (
          <Bouton variante="secondaire" taille="grand" onClick={() => setEtape((n) => n - 1)}>
            {t('commun.retour')}
          </Bouton>
        )}
        {etape < TOTAL ? (
          <Bouton taille="grand" className="flex-1" onClick={suivant}>{t('commun.suivant')}</Bouton>
        ) : (
          <Bouton taille="grand" variante="urgence" className="flex-1" onClick={envoyer} enCours={envoi} disabled={envoi}>
            {envoi ? t('aide.envoiEnCours') : t('aide.envoyer')}
          </Bouton>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function Etape1({ f, maj, erreurs }) {
  const { t } = useLangue()
  return (
    <>
      <Champ etiquette={t('aide.e1Titre')}>
        <ChoixCartes
          valeur={f.pourQui}
          onChange={(v) => maj({ pourQui: v })}
          options={[
            { valeur: 'moi', libelle: t('aide.moi'), emoji: '🙋' },
            { valeur: 'proche', libelle: t('aide.proche'), emoji: '👨‍👩‍👦' },
            { valeur: 'assiste', libelle: t('aide.assiste'), emoji: '🤝' },
          ]}
        />
      </Champ>

      <Champ etiquette={t('aide.e1Niveau')} obligatoire erreur={erreurs.niveau}>
        <ChoixCartes
          valeur={f.niveau}
          onChange={(v) => maj({ niveau: v })}
          options={NIVEAUX.map((n) => ({
            valeur: n.n,
            libelle: t(`niveau.${n.n}.titre`),
            detail: t(`niveau.${n.n}.desc`),
            emoji: n.emoji,
          }))}
        />
      </Champ>

      {f.niveau === 1 && (
        <Alerte ton="danger" titre={t('niveau.1.titre')}>{t('aide.vitaleRappel')}</Alerte>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function Etape2({ f, maj }) {
  const { t } = useLangue()
  return (
    <>
      <Champ etiquette={t('aide.e2Type')} aide={t('aide.e2TypeAide')}>
        <ChoixCartes
          multiple colonnes={2}
          valeur={f.categories}
          onChange={(v) => maj({ categories: v })}
          options={CATEGORIES.map((c) => ({ valeur: c.cle, libelle: t('cat.' + c.cle), emoji: c.emoji }))}
        />
      </Champ>

      <Champ etiquette={t('aide.e2Decrire')} aide={t('aide.e2DecrireAide')}>
        <textarea
          className="champ min-h-[6rem]"
          rows={3}
          maxLength={800}
          placeholder={t('aide.e2Placeholder')}
          value={f.description}
          onChange={(e) => maj({ description: e.target.value })}
        />
        <div className="mt-2">
          <SaisieVocale valeur={f.vocal} onChange={(v) => maj({ vocal: v })} />
        </div>
      </Champ>

      <div className="grid grid-cols-2 gap-3">
        <Champ etiquette={t('aide.e2Age')}>
          <input className="champ" inputMode="numeric" maxLength={3} placeholder="—"
                 value={f.age} onChange={(e) => maj({ age: e.target.value.replace(/\D/g, '') })} />
        </Champ>
        <Champ etiquette={t('aide.e2Sexe')}>
          <div className="flex gap-2">
            {[['H', t('aide.homme')], ['F', t('aide.femme')]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => maj({ sexe: f.sexe === v ? '' : v })}
                      aria-pressed={f.sexe === v}
                      className={`min-h-[3rem] flex-1 rounded-xl border-2 font-bold
                        ${f.sexe === v ? 'border-nil-600 bg-nil-50' : 'border-sable-300 bg-white'}`}>
                {l}
              </button>
            ))}
          </div>
        </Champ>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
function Etape3({ f, maj, erreurs }) {
  const { t } = useLangue()
  return (
    <>
      <Champ etiquette={t('aide.e3Repere')} aide={t('aide.e3RepereAide')}>
        <textarea className="champ" rows={2} maxLength={300}
                  placeholder={t('aide.e3ReperePlaceholder')}
                  value={f.lieuTexte} onChange={(e) => maj({ lieuTexte: e.target.value })} />
      </Champ>

      <div className="mb-4 rounded-xl border-2 border-sable-300 bg-white p-3">
        <p className="etiquette">{t('aide.e3Zone')}</p>
        <SelecteurZone
          valeur={f.zone}
          onChange={(z) => maj({ zone: z, lat: z.lat ?? f.lat, lng: z.lng ?? f.lng })}
          erreur={erreurs.ville}
        />
      </div>

      <Champ etiquette={t('aide.contact')} aide={t('aide.contactAide')}>
        <div className="flex gap-2" dir="ltr">
          <span className="grid min-w-[4.5rem] place-items-center rounded-xl border-2 border-sable-300 bg-sable-100 font-bold nombres-latins">
            +235
          </span>
          <input className="champ nombres-latins" inputMode="tel" maxLength={12} placeholder="66 00 00 00"
                 value={f.contactTel} onChange={(e) => maj({ contactTel: e.target.value.replace(/[^\d ]/g, '') })} />
        </div>
      </Champ>

      {CONFIG.whatsappPlateforme && (
        <div className="mb-4">
          <Alerte ton="info" titre={t('aide.e3Whatsapp')}>{t('aide.e3WhatsappAide')}</Alerte>
        </div>
      )}

      <Champ erreur={erreurs.consentement}>
        <Case coche={f.consentement} onChange={(v) => maj({ consentement: v })}>
          <span className="font-semibold">{t('aide.consentement')}</span>
          <span className="aide mt-1 block">{t('aide.consentementDetail', { jours: 30 })}</span>
        </Case>
      </Champ>
    </>
  )
}

/* ------------------------------------------------------------------ */
function Succes({ resultat, formulaire }) {
  const { t } = useLangue()
  const [copie, setCopie] = useState(false)
  const [copieMsg, setCopieMsg] = useState(false)

  const message = messageDemande({
    code: resultat.code, niveau: formulaire.niveau, categories: formulaire.categories,
    lieu: formulaire.lieuTexte, description: formulaire.description,
  }, t)

  const copier = async () => {
    try { await navigator.clipboard.writeText(lienSuivi(resultat.code)); setCopie(true); setTimeout(() => setCopie(false), 2000) }
    catch { /* le presse-papier peut etre refuse : le lien reste visible a l'ecran */ }
  }

  const copierMessage = async () => {
    try { await navigator.clipboard.writeText(message); setCopieMsg(true); setTimeout(() => setCopieMsg(false), 2000) }
    catch { /* idem */ }
  }

  return (
    <div>
      <Entete titre={t('aide.envoyee')} sansRetour />
      <div className="carte p-4 text-center">
        <div className="mb-2 text-5xl" aria-hidden="true">✅</div>
        <p className="text-[15px] text-nil-900/70">{t('aide.codeSuivi')}</p>
        <p className="my-2 break-all text-3xl font-black tracking-[.1em] text-nil-700 nombres-latins" dir="ltr">
          {resultat.code}
        </p>
        <p className="aide">{t('aide.codeAide')}</p>
      </div>

      {formulaire.niveau === 1 && (
        <div className="mt-3"><Alerte ton="danger">{t('aide.vitaleRappel')}</Alerte></div>
      )}

      <div className="mt-4 space-y-2">
        <Lien vers={`/suivi/${resultat.code}`} className="block">
          <Bouton taille="grand" className="w-full">{t('aide.voirSuivi')}</Bouton>
        </Lien>
        <Bouton variante="secondaire" className="w-full" onClick={copier}>
          🔗 {copie ? t('commun.copie') : t('suivi.partagerLien')}
        </Bouton>
        {/* Lien direct, pas un bouton qui ouvre une fenetre : un clic doit
            basculer sur WhatsApp. Passer par du JavaScript apres l'envoi
            fait perdre le geste utilisateur, et le navigateur bloque
            l'ouverture — le patient se retrouvait a devoir copier le
            message a la main. */}
        <a href={lienWhatsApp(CONFIG.whatsappPlateforme, message) || lienWhatsAppPartage(message)}
           target="_blank" rel="noopener noreferrer" className="block">
          <Bouton variante="succes" taille="grand" className="w-full">
            💬 {t('aide.envoyerWhatsapp')}
          </Bouton>
        </a>
        {/* Filet de secours : WhatsApp absent de l'appareil, ou navigateur
            qui refuse le lien. Le message reste recuperable en un geste. */}
        <button type="button" onClick={copierMessage}
                className="lien mx-auto block pt-1 text-[13px]">
          {copieMsg ? t('commun.copie') : t('commun.copier')}
        </button>
      </div>

      <div className="mt-6 text-center">
        <Lien vers="/" className="lien">{t('app.nom')}</Lien>
      </div>
    </div>
  )
}
