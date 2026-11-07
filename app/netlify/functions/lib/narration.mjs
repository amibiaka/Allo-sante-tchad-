/* Texte d'analyse du rapport : redige par Claude quand une cle est
   configuree, sinon compose ici a partir des chiffres. Toujours dans la
   langue demandee (fr, en, ar). Renvoie { synthese, saillants[],
   vigilance[], recommandations[], methode, source }. */
import { claude, jsonDans } from './commun.mjs'

export const LIBELLES = {
  fr: { rapport: 'Rapport du secteur', synthese: 'Synthèse', saillants: 'Points saillants', vigilance: 'Points de vigilance', recommandations: 'Recommandations', chiffres: 'Chiffres clés',
    methode: 'Méthode et limites', periode: 'Période', jours: 'jours', perimetre: 'Périmètre', genere: 'Généré le', par: 'par', demoIncluse: 'Données de démonstration incluses', demoExclue: 'Données de démonstration exclues',
    indicateur: 'Indicateur', valeur: 'Valeur', national: 'National', redige: 'Texte rédigé par', auto: 'texte composé automatiquement à partir des chiffres',
    k: { demandes: "Demandes d'aide", demandes_vitales: 'Urgences vitales', prises_en_charge: 'Demandes prises en charge', taux_prise_en_charge: 'Taux de prise en charge (%)', delai_prise_en_charge_min: 'Délai médian de prise en charge (min)',
      escaladees: 'Demandes escaladées', villes_actives: 'Villes actives', soignants_inscrits: 'Soignants et pharmacies inscrits', soignants_verifies: 'Soignants vérifiés', soignants_actifs: 'Soignants ayant répondu',
      ordonnances: 'Ordonnances transmises', ordonnances_servies: 'Ordonnances servies', doses_declarees: 'Doses de vaccin déclarées', evenements: 'Signalements communautaires', evenements_confirmes: 'Signalements confirmés', cas_entraide: "Cas d'entraide entre soignants" } },
  en: { rapport: 'Sector report', synthese: 'Summary', saillants: 'Highlights', vigilance: 'Points of attention', recommandations: 'Recommendations', chiffres: 'Key figures',
    methode: 'Method and limits', periode: 'Period', jours: 'days', perimetre: 'Perimeter', genere: 'Generated on', par: 'by', demoIncluse: 'Demonstration data included', demoExclue: 'Demonstration data excluded',
    indicateur: 'Indicator', valeur: 'Value', national: 'National', redige: 'Text written by', auto: 'text composed automatically from the figures',
    k: { demandes: 'Help requests', demandes_vitales: 'Life-threatening emergencies', prises_en_charge: 'Requests taken in charge', taux_prise_en_charge: 'Care rate (%)', delai_prise_en_charge_min: 'Median time to care (min)',
      escaladees: 'Escalated requests', villes_actives: 'Active towns', soignants_inscrits: 'Registered health workers and pharmacies', soignants_verifies: 'Verified health workers', soignants_actifs: 'Health workers who responded',
      ordonnances: 'Prescriptions sent', ordonnances_servies: 'Prescriptions filled', doses_declarees: 'Vaccine doses declared', evenements: 'Community reports', evenements_confirmes: 'Confirmed reports', cas_entraide: 'Peer-support cases' } },
  ar: { rapport: 'تقرير القطاع', synthese: 'خلاصة', saillants: 'أبرز النقاط', vigilance: 'نقاط اليقظة', recommandations: 'التوصيات', chiffres: 'الأرقام الرئيسية',
    methode: 'المنهجية والحدود', periode: 'الفترة', jours: 'يوماً', perimetre: 'النطاق', genere: 'أُنشئ في', par: 'بواسطة', demoIncluse: 'بيانات العرض التوضيحي مُدرجة', demoExclue: 'بيانات العرض التوضيحي مستبعدة',
    indicateur: 'المؤشر', valeur: 'القيمة', national: 'وطني', redige: 'النص من إعداد', auto: 'نص مُركَّب تلقائياً من الأرقام',
    k: { demandes: 'طلبات المساعدة', demandes_vitales: 'حالات طوارئ تهدد الحياة', prises_en_charge: 'طلبات تم التكفل بها', taux_prise_en_charge: 'نسبة التكفل (%)', delai_prise_en_charge_min: 'المهلة الوسيطة للتكفل (د)',
      escaladees: 'طلبات مُصعَّدة', villes_actives: 'مدن نشطة', soignants_inscrits: 'مهنيون وصيدليات مسجلون', soignants_verifies: 'مهنيون موثَّقون', soignants_actifs: 'مهنيون أجابوا',
      ordonnances: 'وصفات مُرسلة', ordonnances_servies: 'وصفات مصروفة', doses_declarees: 'جرعات لقاح مُصرَّح بها', evenements: 'بلاغات مجتمعية', evenements_confirmes: 'بلاغات مؤكدة', cas_entraide: 'حالات تعاضد بين المهنيين' } },
}

const n = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))

function composee(langue, resume, feuilles) {
  const r = resume || {}
  const L = LIBELLES[langue] || LIBELLES.fr
  const top = (f, k = 3) => [...(f.lignes || [])].sort((a, b) => Number(b[b.length - 1]) - Number(a[a.length - 1])).slice(0, k)
  const saillants = feuilles.slice(0, 6).map((f) => {
    const t = top(f)
    if (!t.length) return null
    const items = t.map((l) => `${l.slice(0, -1).join(' / ')} : ${n(l[l.length - 1])}`).join(' ; ')
    return langue === 'ar' ? `${f.titre} — الأعلى: ${items}` : langue === 'en' ? `${f.titre} — highest: ${items}` : `${f.titre} — en tête : ${items}`
  }).filter(Boolean)
  const vigilance = []
  const taux = Number(r.taux_prise_en_charge), delai = Number(r.delai_prise_en_charge_min), esc = Number(r.escaladees), dem = Number(r.demandes)
  if (langue === 'ar') {
    if (taux && taux < 70) vigilance.push(`نسبة التكفل (${taux} %) أقل من 70 %: يلزم تعزيز تغطية المهنيين في المدن الأقل تجاوباً.`)
    if (delai && delai > 30) vigilance.push(`المهلة الوسيطة للتكفل (${delai} د) تتجاوز 30 دقيقة.`)
    if (dem && esc / dem > 0.2) vigilance.push(`${esc} طلباً (${Math.round((100 * esc) / dem)} %) صُعِّدت لغياب رد سريع.`)
    if (Number(r.evenements_confirmes) > 0) vigilance.push(`${r.evenements_confirmes} بلاغاً مجتمعياً مؤكداً يستوجب متابعة ميدانية.`)
  } else if (langue === 'en') {
    if (taux && taux < 70) vigilance.push(`The care rate (${taux} %) is below 70 %: health-worker coverage should be reinforced in the least responsive towns.`)
    if (delai && delai > 30) vigilance.push(`The median time to care (${delai} min) exceeds 30 minutes.`)
    if (dem && esc / dem > 0.2) vigilance.push(`${esc} requests (${Math.round((100 * esc) / dem)} %) were escalated for lack of a quick response.`)
    if (Number(r.evenements_confirmes) > 0) vigilance.push(`${r.evenements_confirmes} confirmed community reports call for field follow-up.`)
  } else {
    if (taux && taux < 70) vigilance.push(`Le taux de prise en charge (${taux} %) est inférieur à 70 % : la couverture en soignants doit être renforcée dans les villes les moins réactives.`)
    if (delai && delai > 30) vigilance.push(`Le délai médian de prise en charge (${delai} min) dépasse 30 minutes.`)
    if (dem && esc / dem > 0.2) vigilance.push(`${esc} demandes (${Math.round((100 * esc) / dem)} %) ont été escaladées faute de réponse rapide.`)
    if (Number(r.evenements_confirmes) > 0) vigilance.push(`${r.evenements_confirmes} signalements communautaires confirmés appellent un suivi de terrain.`)
  }
  const synthese = langue === 'ar'
    ? `خلال الـ${n(r.periode_jours || r.jours)} يوماً الأخيرة، تلقت المنصة ${n(r.demandes)} طلب مساعدة في ${n(r.villes_actives)} مدينة، منها ${n(r.demandes_vitales)} حالة طارئة تهدد الحياة. تم التكفل بـ${n(r.taux_prise_en_charge)} % منها من قبل مهني مسجل، بمهلة وسيطة قدرها ${n(r.delai_prise_en_charge_min)} دقيقة؛ وصُعِّد ${n(r.escaladees)} طلباً. يبلغ عدد المهنيين والصيدليات المسجلين ${n(r.soignants_inscrits)} (${n(r.soignants_verifies)} موثَّقاً)، أجاب منهم ${n(r.soignants_actifs)} خلال الفترة. أُرسلت ${n(r.ordonnances)} وصفة إلى الصيدليات (${n(r.ordonnances_servies)} مصروفة)، وصُرِّح بـ${n(r.doses_declarees)} جرعة لقاح، ووردت ${n(r.evenements)} بلاغاً مجتمعياً (${n(r.evenements_confirmes)} مؤكداً)، وفُتحت ${n(r.cas_entraide)} حالة تعاضد بين المهنيين.`
    : langue === 'en'
      ? `Over the last ${n(r.periode_jours || r.jours)} days, the platform received ${n(r.demandes)} help requests in ${n(r.villes_actives)} towns, including ${n(r.demandes_vitales)} life-threatening emergencies. ${n(r.taux_prise_en_charge)} % were taken in charge by a registered health worker, with a median time to care of ${n(r.delai_prise_en_charge_min)} minutes; ${n(r.escaladees)} requests were escalated. ${n(r.soignants_inscrits)} health workers and pharmacies are registered (${n(r.soignants_verifies)} verified), ${n(r.soignants_actifs)} responded over the period. ${n(r.ordonnances)} prescriptions were sent to pharmacies (${n(r.ordonnances_servies)} filled), ${n(r.doses_declarees)} vaccine doses were declared, ${n(r.evenements)} community reports were received (${n(r.evenements_confirmes)} confirmed) and ${n(r.cas_entraide)} peer-support cases were opened.`
      : `Sur les ${n(r.periode_jours || r.jours)} derniers jours, la plateforme a reçu ${n(r.demandes)} demandes d'aide dans ${n(r.villes_actives)} villes, dont ${n(r.demandes_vitales)} urgences vitales. ${n(r.taux_prise_en_charge)} % ont été prises en charge par un soignant inscrit, avec un délai médian de ${n(r.delai_prise_en_charge_min)} minutes ; ${n(r.escaladees)} demandes ont été escaladées. ${n(r.soignants_inscrits)} soignants et pharmacies sont inscrits (${n(r.soignants_verifies)} vérifiés), ${n(r.soignants_actifs)} ont répondu sur la période. ${n(r.ordonnances)} ordonnances ont été transmises aux pharmacies (${n(r.ordonnances_servies)} servies), ${n(r.doses_declarees)} doses de vaccin déclarées, ${n(r.evenements)} signalements communautaires reçus (${n(r.evenements_confirmes)} confirmés) et ${n(r.cas_entraide)} cas d'entraide ouverts entre soignants.`
  const recommandations = langue === 'ar'
    ? ['توثيق المهنيين المسجلين مؤقتاً قبل انتهاء مهلتهم، لتثبيت التغطية.', 'تعزيز الحضور في المدن ذات المهل الأطول (إشعارات، مهنيون إضافيون).', 'التحقق ميدانياً من كل تجمّع حالات تُظهره المراقبة، والإبلاغ وفق الإجراءات الوطنية.', 'تشجيع الصيدليات على التصريح بالأسعار لتغذية المؤشر العمومي.']
    : langue === 'en'
      ? ['Verify provisionally registered health workers before their period expires, to secure coverage.', 'Strengthen presence in towns with the longest delays (notifications, additional health workers).', 'Check in the field every cluster shown by surveillance and report it through national procedures.', 'Encourage pharmacies to declare prices to feed the public index.']
      : ['Vérifier les soignants inscrits à titre provisoire avant l\'expiration de leur délai, pour consolider la couverture.', 'Renforcer la présence dans les villes aux délais les plus longs (notifications, soignants supplémentaires).', 'Vérifier sur le terrain chaque regroupement de cas que fait apparaître la veille et le déclarer selon les procédures nationales.', 'Encourager les pharmacies à déclarer leurs prix pour alimenter l\'indice public.']
  const methode = langue === 'ar'
    ? `أعداد ووسيطات محسوبة في قاعدة البيانات ضمن نطاق الحساب (${n(r.perimetre || L.national)})؛ لا تُصدَّر أي بيانات فردية. ${r.demo_inclus ? L.demoIncluse : L.demoExclue}. تعكس الأرقام ما يصرّح به السكان والمهنيون عبر التطبيق، لا النشاط الصحي الكامل للبلد.`
    : langue === 'en'
      ? `Counts and medians computed in the database over the account's perimeter (${n(r.perimetre || L.national)}); no individual data is exported. ${r.demo_inclus ? L.demoIncluse : L.demoExclue}. The figures reflect what residents and health workers declare through the app, not the country's whole health activity.`
      : `Comptages et médianes calculés dans la base sur le périmètre du compte (${n(r.perimetre || L.national)}) ; aucune donnée individuelle n'est exportée. ${r.demo_inclus ? L.demoIncluse : L.demoExclue}. Les chiffres reflètent ce que les habitants et les soignants déclarent par l'application, pas toute l'activité sanitaire du pays.`
  return { synthese, saillants, vigilance, recommandations, methode, source: 'auto' }
}

export async function narration(cfg, { langue = 'fr', titre, resume, feuilles }) {
  const repli = composee(langue, resume, feuilles)
  if (!cfg.anthropic) return repli
  const nomLangue = { fr: 'français', en: 'English', ar: 'العربية الفصحى (Modern Standard Arabic)' }[langue] || 'français'
  const donnees = {
    titre, resume,
    tableaux: feuilles.slice(0, 10).map((f) => ({ titre: f.titre, colonnes: f.colonnes, lignes: (f.lignes || []).slice(0, 40) })),
  }
  const systeme = `Tu es analyste de santé publique auprès du ministère de la Santé du Tchad. Tu rédiges, pour un décideur (ministre, directeur de programme, Ordre professionnel), l'analyse d'un extrait statistique de la plateforme Afiya (demandes d'aide des habitants, soignants inscrits, ordonnances, vaccination, signalements communautaires). Règles : n'invente aucun chiffre, ne cite que ceux fournis ; reste factuel et prudent (une hausse n'est pas un diagnostic) ; aucune donnée individuelle ; style administratif clair. Réponds UNIQUEMENT par un objet JSON avec les clés : "synthese" (un paragraphe de 5 à 8 phrases), "saillants" (3 à 6 phrases courtes), "vigilance" (0 à 4 phrases), "recommandations" (3 à 5 phrases, concrètes), "methode" (un paragraphe court : comptages, périmètre, démonstration incluse ou non, limites). Tout le texte doit être écrit en ${nomLangue}.`
  try {
    const texte = await claude(cfg, { systeme, message: JSON.stringify(donnees), maxTokens: 2000 })
    const j = jsonDans(texte)
    if (j && j.synthese) {
      return {
        synthese: String(j.synthese), saillants: [].concat(j.saillants || []).map(String), vigilance: [].concat(j.vigilance || []).map(String),
        recommandations: [].concat(j.recommandations || []).map(String), methode: String(j.methode || repli.methode), source: 'claude',
      }
    }
  } catch { /* repli silencieux : le rapport sort quand meme */ }
  return repli
}
