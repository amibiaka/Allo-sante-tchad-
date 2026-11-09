/* =====================================================================
 * DIFFUSION — campagnes d'information
 * ---------------------------------------------------------------------
 * Le programme national (et les autorites, et les Ordres) prepare un
 * message de prevention (dengue, paludisme, cholera, rougeole...) a
 * partir de modeles bilingues, choisit les destinataires parmi les
 * soignants inscrits (par type et par province), puis :
 *   - ouvre WhatsApp contact par contact (petites listes),
 *   - ou telecharge les contacts pour une liste de diffusion WhatsApp,
 *   - et publie le meme texte dans l'application (actualite ou alerte).
 * Les numeros sortent de la fonction contacts_diffusion : soignants
 * inscrits seulement, jamais un patient, et chaque export est inscrit
 * au journal.
 * ===================================================================== */
import { useEffect, useMemo, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db } from '../../lib/db'
import { chargerGeo } from '../../lib/geo'
import { versCSV, telechargerTexte } from '../../lib/format'
import { Bouton, Champ, Selecteur, Alerte, Chargement, Case } from '../../components/base'

const TYPES = ['medecin', 'infirmier', 'sage_femme', 'aide_soignant', 'pharmacie', 'pharmacien']

/* Modeles. Francais et arabe : les deux langues officielles ; le texte
   reste court, c'est un message WhatsApp. */
export const MODELES = [
  { cle: 'dengue', emoji: '🦟', type: 'alerte',
    fr: { titre: 'Dengue : cas en hausse', corps: 'Des cas de dengue sont signalés dans votre zone. Devant toute fièvre élevée avec maux de tête derrière les yeux, douleurs articulaires ou éruption : test paludisme négatif → pensez dengue. Pas d\'aspirine ni d\'ibuprofène (risque de saignement) : paracétamol et réhydratation. Signes d\'alerte (saignements, vomissements répétés, douleur abdominale, léthargie) → référer sans délai. Conseillez aux familles de vider les récipients d\'eau stagnante autour des maisons.' },
    ar: { titre: 'حمى الضنك: ارتفاع في الحالات', corps: 'تم الإبلاغ عن حالات حمى الضنك في منطقتكم. أمام أي حمى شديدة مع صداع خلف العينين أو آلام في المفاصل أو طفح جلدي: إذا كان اختبار الملاريا سلبياً فكّروا في حمى الضنك. لا أسبرين ولا إيبوبروفين (خطر النزيف): باراسيتامول وإماهة. علامات الخطر (نزيف، قيء متكرر، ألم في البطن، خمول) ← الإحالة فوراً. انصحوا الأسر بإفراغ أوعية المياه الراكدة حول المنازل.' } },
  { cle: 'paludisme', emoji: '🌡️', type: 'directive',
    fr: { titre: 'Paludisme : saison de haute transmission', corps: 'Test de diagnostic rapide pour toute fièvre, avant tout traitement. Paludisme simple : artéméther-luméfantrine, cure complète, avec un repas. Signes de gravité (convulsions, incapacité de boire, détresse respiratoire, pâleur extrême) → artésunate et référence immédiate. Femmes enceintes : traitement préventif intermittent à chaque consultation prénatale. Rappelez l\'usage de la moustiquaire imprégnée toutes les nuits.' },
    ar: { titre: 'الملاريا: موسم الانتقال الشديد', corps: 'اختبار تشخيصي سريع لكل حمى قبل أي علاج. الملاريا البسيطة: أرتيميثر-لوميفانترين، دورة كاملة مع الطعام. علامات الخطورة (تشنجات، عجز عن الشرب، ضيق تنفس، شحوب شديد) ← أرتيسونات وإحالة فورية. الحوامل: العلاج الوقائي المتقطع في كل زيارة ما قبل الولادة. ذكّروا باستعمال الناموسية المشبعة كل ليلة.' } },
  { cle: 'cholera', emoji: '💧', type: 'alerte',
    fr: { titre: 'Choléra : vigilance et prise en charge', corps: 'Toute diarrhée aqueuse abondante avec déshydratation rapide doit être considérée comme un cas suspect de choléra : réhydratation immédiate (SRO, voie veineuse si sévère), déclaration au district dans les 24 heures, isolement des cas. Messages aux familles : eau traitée ou bouillie, lavage des mains au savon, cuisson complète des aliments. Les SRO sont gratuits dans les centres de santé.' },
    ar: { titre: 'الكوليرا: يقظة وعلاج', corps: 'كل إسهال مائي غزير مع جفاف سريع يُعتبر حالة مشتبهاً بها للكوليرا: إماهة فورية (أملاح الإماهة الفموية، وريدياً إذا كانت الحالة شديدة)، إبلاغ المقاطعة الصحية خلال 24 ساعة، وعزل الحالات. رسائل للأسر: ماء معالج أو مغلي، غسل اليدين بالصابون، طهي الطعام جيداً. أملاح الإماهة مجانية في المراكز الصحية.' } },
  { cle: 'rougeole', emoji: '🔴', type: 'vaccination',
    fr: { titre: 'Rougeole : cas groupés, rattrapage vaccinal', corps: 'Devant fièvre, toux, yeux rouges et éruption qui commence au visage : suspecter la rougeole, isoler, donner de la vitamine A et déclarer. Vérifiez le statut vaccinal de tous les enfants de 9 mois à 5 ans qui se présentent et orientez vers le rattrapage gratuit. Un seul cas de rougeole est déjà une alerte.' },
    ar: { titre: 'الحصبة: حالات متجمعة، تطعيم تعويضي', corps: 'أمام حمى وسعال واحمرار العينين وطفح يبدأ من الوجه: اشتبهوا في الحصبة، اعزلوا الحالة، أعطوا فيتامين أ وأبلغوا. تحققوا من حالة التطعيم لكل الأطفال من 9 أشهر إلى 5 سنوات ووجّهوهم إلى التطعيم التعويضي المجاني. حالة حصبة واحدة هي إنذار.' } },
  { cle: 'meningite', emoji: '🧠', type: 'alerte',
    fr: { titre: 'Méningite : saison sèche, seuil d\'alerte', corps: 'Fièvre brutale avec raideur de la nuque, vomissements, troubles de la conscience ou taches sur la peau : suspecter une méningite, donner la première dose de ceftriaxone et référer immédiatement. Déclarez chaque cas suspect le jour même au district : le seuil d\'alerte se compte par semaine et par district.' },
    ar: { titre: 'التهاب السحايا: موسم الجفاف، عتبة الإنذار', corps: 'حمى مفاجئة مع تيبّس الرقبة أو قيء أو اضطراب الوعي أو بقع على الجلد: اشتبهوا في التهاب السحايا، أعطوا الجرعة الأولى من السيفترياكسون وأحيلوا فوراً. أبلغوا عن كل حالة مشتبه بها في اليوم نفسه إلى المقاطعة الصحية: تُحسب عتبة الإنذار أسبوعياً ولكل مقاطعة.' } },
  { cle: 'chaleur', emoji: '☀️', type: 'actualite',
    fr: { titre: 'Fortes chaleurs : protéger les plus fragiles', corps: 'Pendant la vague de chaleur : faire boire régulièrement les enfants, les personnes âgées et les malades chroniques, éviter le soleil entre 11 h et 16 h, rafraîchir le corps à l\'eau. Coup de chaleur (peau chaude et sèche, confusion) : refroidir immédiatement et référer. Vérifiez la chaîne du froid des vaccins et des insulines.' },
    ar: { titre: 'موجة حر: حماية الأكثر هشاشة', corps: 'خلال موجة الحر: اسقوا الأطفال وكبار السن ومرضى الأمراض المزمنة بانتظام، تجنبوا الشمس بين 11 و16، وبرّدوا الجسم بالماء. ضربة الشمس (جلد ساخن وجاف، ارتباك): تبريد فوري وإحالة. تحققوا من سلسلة التبريد للقاحات والأنسولين.' } },
  { cle: 'inondations', emoji: '🌊', type: 'alerte',
    fr: { titre: 'Inondations : risques sanitaires des prochaines semaines', corps: 'Après les inondations : hausse attendue du paludisme, des diarrhées et des infections cutanées. Renforcez le dépistage, les stocks de SRO, de tests et d\'antipaludiques, et surveillez l\'eau de boisson. Signalez tout regroupement de cas via l\'application.' },
    ar: { titre: 'الفيضانات: مخاطر صحية في الأسابيع القادمة', corps: 'بعد الفيضانات: ارتفاع متوقع في الملاريا والإسهال والتهابات الجلد. عزّزوا الكشف ومخزون أملاح الإماهة والاختبارات ومضادات الملاريا، وراقبوا مياه الشرب. أبلغوا عن أي تجمّع للحالات عبر التطبيق.' } },
  { cle: 'campagne', emoji: '💉', type: 'vaccination',
    fr: { titre: 'Campagne de vaccination : mobilisation', corps: 'Une campagne de vaccination démarre dans votre zone. Merci d\'informer les familles, de vérifier les carnets et d\'orienter tout enfant en retard vers le centre le plus proche. Les dates et les lieux sont dans l\'application, rubrique Vaccination.' },
    ar: { titre: 'حملة تطعيم: تعبئة', corps: 'تنطلق حملة تطعيم في منطقتكم. يرجى إعلام الأسر، والتحقق من دفاتر التطعيم، وتوجيه كل طفل متأخر إلى أقرب مركز. التواريخ والأماكن في التطبيق، قسم التطعيم.' } },
]

const normaliser = (num) => {
  const d = String(num || '').replace(/\D/g, '')
  if (!d) return null
  return d.length === 8 ? '235' + d : d.startsWith('235') ? d : d.length > 8 ? d : '235' + d
}

export default function SectionDiffusion({ session }) {
  const { t, langue, nom } = useLangue()
  const role = session.profil.role
  const national = ['super_admin', 'autorite_nationale', 'ordre_medecins', 'ordre_pharmaciens', 'centre_numerique'].includes(role)
  const [geo, setGeo] = useState(null)
  const [modele, setModele] = useState(null)
  const [f, setF] = useState({ titre: '', corps: '', type: 'alerte', types: ['medecin', 'infirmier', 'sage_femme', 'aide_soignant'], provinceCode: '', publierAussi: true, audiencePublic: false })
  const [contacts, setContacts] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [fait, setFait] = useState(null)

  useEffect(() => {
    chargerGeo().then((g) => {
      setGeo(g)
      if (!national) setF((x) => ({ ...x, provinceCode: g.provinces.find((p) => p.id === session.profil.province_id)?.code || '' }))
    })
  }, [national, session.profil.province_id])

  const appliquer = (m, l) => {
    setModele(m.cle)
    setF((x) => ({ ...x, titre: m[l].titre, corps: m[l].corps, type: m.type }))
  }
  const ajouterArabe = () => {
    const m = MODELES.find((x) => x.cle === modele)
    if (!m) return
    setF((x) => ({ ...x, corps: x.corps.includes(m.ar.corps) ? x.corps : x.corps + '\n\n' + m.ar.titre + '\n' + m.ar.corps }))
  }
  const basculerType = (ty) => setF((x) => ({ ...x, types: x.types.includes(ty) ? x.types.filter((a) => a !== ty) : [...x.types, ty] }))

  const preparer = async () => {
    setEnCours(true); setErreur(null); setContacts(null); setFait(null)
    try {
      const l = await db.contactsDiffusion({ types: f.types, provinceCode: f.provinceCode || undefined })
      setContacts(l)
      if (f.publierAussi && f.titre.trim().length >= 3 && f.corps.trim().length >= 3) {
        await db.enregistrerPublication({ type: f.type, audience: f.audiencePublic ? 'public' : 'soignants', titre: f.titre.trim(), corps: f.corps.trim(), lien: '', provinceCode: f.provinceCode || null, publie: true, expire_le: null })
        setFait(t('diff.publiee'))
      }
    } catch (e) {
      setErreur(/HORS_PERIMETRE|42501/.test(e?.message) ? t('admin.horsPerimetre') : (e?.message || t('commun.erreurReseau')))
    } finally { setEnCours(false) }
  }

  const texteWhatsApp = useMemo(() => `*${f.titre.trim()}*\n\n${f.corps.trim()}\n\n— ${t('app.nom')} · ${t('admin.role.' + role)}`, [f.titre, f.corps, role, t])
  const copier = async () => { try { await navigator.clipboard.writeText(texteWhatsApp); setFait(t('commun.copie')) } catch { /* presse-papiers refuse */ } }
  const exporterContacts = () => telechargerTexte(versCSV(contacts || [], [
    { titre: t('deon.col.nom'), valeur: 'nom' }, { titre: t('deon.col.type'), valeur: (c) => t('typePro.' + c.type) },
    { titre: t('zone.ville'), valeur: 'ville' }, { titre: t('zone.province'), valeur: 'province' }, { titre: 'WhatsApp', valeur: (c) => '+' + normaliser(c.whatsapp) },
  ]), `afiya-contacts-${new Date().toISOString().slice(0, 10)}.csv`)

  const parType = useMemo(() => (contacts || []).reduce((o, c) => { o[c.type] = (o[c.type] || 0) + 1; return o }, {}), [contacts])
  const ok = f.titre.trim().length >= 3 && f.corps.trim().length >= 3 && f.types.length > 0
  const l2 = langue === 'ar' ? 'ar' : 'fr'

  return (
    <div>
      <div className="mb-3"><Alerte ton="info">{t('diff.intro')}</Alerte></div>

      <h3 className="mb-2 text-sm font-bold text-nil-900">{t('diff.modeles')}</h3>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {MODELES.map((m) => (
          <button key={m.cle} onClick={() => appliquer(m, l2)} aria-pressed={modele === m.cle}
                  className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-[13px] font-bold ${modele === m.cle ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white text-nil-700'}`}>
            {m.emoji} {t('diff.modele.' + m.cle)}
          </button>
        ))}
      </div>

      <div className="mb-3 rounded-xl border-2 border-sable-300 bg-white p-3">
        <Champ etiquette={t('inst.titrePub')} obligatoire><input className="champ" value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} maxLength={160} /></Champ>
        <Champ etiquette={t('diff.message')} obligatoire aide={t('diff.messageAide')}>
          <textarea className="champ min-h-[10rem]" dir="auto" value={f.corps} onChange={(e) => setF({ ...f, corps: e.target.value })} maxLength={4000} />
        </Champ>
        {modele && l2 === 'fr' && <Bouton taille="petit" variante="secondaire" className="mb-3" onClick={ajouterArabe}>➕ {t('diff.ajouterArabe')}</Bouton>}
        <Champ etiquette={t('diff.destinataires')} aide={t('diff.destinatairesAide')}>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((ty) => (
              <button key={ty} type="button" onClick={() => basculerType(ty)} aria-pressed={f.types.includes(ty)}
                      className={`rounded-full border-2 px-3 py-1 text-[13px] font-bold ${f.types.includes(ty) ? 'border-nil-600 bg-nil-600 text-white' : 'border-sable-300 bg-white'}`}>
                {t('typePro.' + ty)}
              </button>
            ))}
          </div>
        </Champ>
        <Champ etiquette={t('zone.province')} aide={national ? t('inst.provinceAide') : null}>
          <Selecteur valeur={f.provinceCode} onChange={(v) => setF({ ...f, provinceCode: v })} placeholder={national ? t('vac.national') : undefined}
                     options={(geo?.provinces || []).filter((p) => national || p.code === f.provinceCode).map((p) => ({ valeur: p.code, libelle: nom(p) }))} {...(national ? {} : { disabled: true })} />
        </Champ>
        <Champ><Case coche={f.publierAussi} onChange={(v) => setF({ ...f, publierAussi: v })}>{t('diff.publierAussi')}</Case></Champ>
        {f.publierAussi && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Selecteur valeur={f.type} onChange={(v) => setF({ ...f, type: v })} options={['alerte', 'actualite', 'directive', 'vaccination'].map((x) => ({ valeur: x, libelle: t('inst.typePub.' + x) }))} />
            <Selecteur valeur={f.audiencePublic ? 'public' : 'soignants'} onChange={(v) => setF({ ...f, audiencePublic: v === 'public' })} options={[{ valeur: 'soignants', libelle: t('inst.audience.soignants') }, { valeur: 'public', libelle: t('inst.audience.public') }]} />
          </div>
        )}
        {erreur && <div className="mb-3"><Alerte ton="danger">{erreur}</Alerte></div>}
        {fait && <div className="mb-3"><Alerte ton="succes">{fait}</Alerte></div>}
        <Bouton className="w-full" onClick={preparer} enCours={enCours} disabled={!ok}>📣 {t('diff.preparer')}</Bouton>
      </div>

      {enCours && <Chargement />}
      {contacts && (
        <div className="rounded-xl border-2 border-sable-300 bg-white p-3">
          <p className="mb-1 text-sm font-bold">{t('diff.listePrete', { n: contacts.length })}</p>
          <p className="aide mb-3">{Object.entries(parType).map(([ty, n]) => `${t('typePro.' + ty)} : ${n}`).join(' · ') || t('diff.aucunContact')}</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Bouton taille="petit" variante="secondaire" onClick={copier}>📋 {t('diff.copierMessage')}</Bouton>
            <Bouton taille="petit" variante="secondaire" onClick={exporterContacts} disabled={!contacts.length}>⬇️ {t('diff.telechargerContacts')}</Bouton>
          </div>
          <p className="aide mb-2">{t('diff.whatsappAide')}</p>
          {contacts.length > 0 && (
            <ul className="max-h-[22rem] space-y-1 overflow-y-auto">
              {contacts.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-sable-300 p-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{c.nom}</p>
                    <p className="aide truncate">{t('typePro.' + c.type)} · {[c.ville, c.province].filter(Boolean).join(', ')}</p>
                  </div>
                  <a className="shrink-0 rounded-full bg-[#25D366] px-3 py-1.5 text-[12px] font-bold text-white" target="_blank" rel="noopener noreferrer"
                     href={`https://wa.me/${normaliser(c.whatsapp)}?text=${encodeURIComponent(texteWhatsApp)}`}>💬 WhatsApp</a>
                </li>
              ))}
            </ul>
          )}
          <p className="aide mt-3">{t('diff.journal')}</p>
        </div>
      )}
    </div>
  )
}
