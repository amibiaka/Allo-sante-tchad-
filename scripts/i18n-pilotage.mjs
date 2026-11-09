/* Textes du pilotage etendu, du territoire, du partage de connaissances,
   de la lecture vocale et de la memoire hors ligne (novembre 2026).
   Idempotent : n'ecrase rien, sauf les cles listees dans FORCE. */
import { readFileSync, writeFileSync } from 'node:fs'

const FR = {
  admin: { territoire: 'Territoire', geographie: 'Quartiers' },
  commun: { donneesHorsLigne: 'Sans réseau : voici les dernières informations enregistrées sur ce téléphone (le {date}).' },
  voix: { lire: 'Lire la page à voix haute', arreter: 'Arrêter la lecture' },
  inst: { kpi: { titre: 'Aujourd\'hui dans votre périmètre' } },
  pilotage: {
    groupe: { comptes: 'Comptes et accès', soignants: 'Soignants', communication: 'Communication', territoire: 'Territoire', donnees: 'Données et veille' },
    comptesGestion: 'Comptes de gestion', comptesAide: 'Programme, Ordres, autorités, administrateurs', inactifs: '{n} désactivé(s)',
    nouveauCompte: 'Créer un compte de gestion', reglagesAide: 'Démonstration, journal, sécurité',
    verifies: 'Soignants vérifiés', entraide: 'Questions ouvertes (entraide)', partages: '{n} partages d\'expérience',
    brouillons: '{n} brouillon(s)', diffusionAide: 'Messages aux soignants et aux familles',
    regions: 'Régions / provinces', districts: 'Districts sanitaires', formations: 'Formations sanitaires', villes: 'Villes', quartiersAttente: 'Quartiers proposés à valider',
    demandes7j: '{n} demandes d\'aide sur 7 jours', journal: 'Actions journalisées (7 j)', journalAide: 'Chaque décision est signée et datée',
  },
  terr: {
    intro: 'La carte du pays telle que l\'application la connaît : régions, villes, districts et formations sanitaires. Toute création ou correction est journalisée à votre nom et visible par tous dès le rafraîchissement suivant.',
    regions: 'Régions', villes: 'Villes', districts: 'Districts', formations: 'Formations', rattachement: 'Ville → district',
    nouvelleRegion: 'Nouvelle région', nomRegion: 'Nom de la région (français)', nomArabe: 'Nom en arabe', code: 'Code', codeAide: '2 à 6 lettres, unique (ex. : NDJ). Non modifiable ensuite.',
    ordre: 'Ordre d\'affichage', ordreAide: 'Plus petit = plus haut dans les listes (100 par défaut).',
    pasDeSuppression: 'Une région ne se supprime pas depuis l\'application : ses villes et leurs demandes en dépendent.',
    nbVilles: '{n} ville(s)', nouvelleVille: 'Nouvelle ville', nomVille: 'Nom de la ville (français)', chefLieu: 'Chef-lieu de la région', sansDistrict: 'Sans district',
    codeInvalide: 'Le code doit faire 2 à 6 lettres ou chiffres.', codeExistant: 'Ce code existe déjà : choisissez-en un autre.',
    ouvrir: 'Gérer le territoire (régions, districts, formations, villes)',
  },
  entraide: {
    ongletQuestions: 'Questions', ongletSavoir: 'Partages et protocoles',
    introSavoir: 'La mémoire collective des soignants du Tchad : retours d\'expérience, conduites à tenir, organisations qui marchent. Tout soignant actif peut publier et commenter. Les fils restent lisibles et se retrouvent par la recherche.',
    partager: 'Partager une expérience ou un protocole', rechercher: 'Rechercher dans les fils (mot, symptôme, lieu…)', recents: 'Récents',
    aucunSavoir: 'Aucun partage pour le moment', aucunSavoirDetail: 'Soyez le premier : ce que vous avez appris sur le terrain peut aider un collègue à l\'autre bout du pays.',
    genreTitre: 'Que publiez-vous ?', genre: { question: 'Une question', partage: 'Un partage d\'expérience', protocole: 'Un protocole / une conduite à tenir' },
    genreDetail: { question: 'Vous demandez conseil à un médecin.', partage: 'Vous racontez ce qui a marché, ou pas, et ce que vous en retenez.', protocole: 'Une marche à suivre claire, étape par étape, que d\'autres pourront appliquer.' },
    titreSavoir: 'Titre', titreSavoirExemple: 'Ex. : Prise en charge du paludisme grave sans artésunate injectable',
    descriptionSavoir: 'Contenu', descriptionSavoirAide: 'Contexte, ce que vous avez fait, résultat, ce que vous conseillez. Jamais de nom de patient ni de numéro.',
    commentaires: 'Commentaires', pasEncoreCommentaire: 'Pas encore de commentaire.', commentairePlaceholder: 'Votre commentaire, votre expérience, une précision…', commenter: 'Commenter', publierSavoir: 'Publier',
  },
}

const EN = {
  admin: { territoire: 'Territory', geographie: 'Neighbourhoods' },
  commun: { donneesHorsLigne: 'No network: showing the latest information saved on this phone ({date}).' },
  voix: { lire: 'Read the page aloud', arreter: 'Stop reading' },
  inst: { kpi: { titre: 'Today in your area' } },
  pilotage: {
    groupe: { comptes: 'Accounts and access', soignants: 'Health workers', communication: 'Communication', territoire: 'Territory', donnees: 'Data and surveillance' },
    comptesGestion: 'Management accounts', comptesAide: 'Programme, Orders, authorities, administrators', inactifs: '{n} disabled',
    nouveauCompte: 'Create a management account', reglagesAide: 'Demo, log, security',
    verifies: 'Verified health workers', entraide: 'Open questions (peer support)', partages: '{n} experience posts',
    brouillons: '{n} draft(s)', diffusionAide: 'Messages to health workers and families',
    regions: 'Regions / provinces', districts: 'Health districts', formations: 'Health facilities', villes: 'Towns', quartiersAttente: 'Suggested neighbourhoods to approve',
    demandes7j: '{n} help requests in 7 days', journal: 'Logged actions (7 d)', journalAide: 'Every decision is signed and dated',
  },
  terr: {
    intro: 'The country map as the app knows it: regions, towns, health districts and facilities. Every creation or correction is logged under your name and visible to everyone at the next refresh.',
    regions: 'Regions', villes: 'Towns', districts: 'Districts', formations: 'Facilities', rattachement: 'Town → district',
    nouvelleRegion: 'New region', nomRegion: 'Region name (French)', nomArabe: 'Name in Arabic', code: 'Code', codeAide: '2 to 6 letters, unique (e.g. NDJ). Cannot be changed later.',
    ordre: 'Display order', ordreAide: 'Smaller = higher in lists (100 by default).',
    pasDeSuppression: 'A region cannot be deleted from the app: its towns and their requests depend on it.',
    nbVilles: '{n} town(s)', nouvelleVille: 'New town', nomVille: 'Town name (French)', chefLieu: 'Regional capital', sansDistrict: 'No district',
    codeInvalide: 'The code must be 2 to 6 letters or digits.', codeExistant: 'This code already exists: choose another one.',
    ouvrir: 'Manage the territory (regions, districts, facilities, towns)',
  },
  entraide: {
    ongletQuestions: 'Questions', ongletSavoir: 'Experience and protocols',
    introSavoir: 'The collective memory of Chad\'s health workers: field experience, what to do, organisations that work. Any active health worker can post and comment. Threads stay readable and searchable.',
    partager: 'Share an experience or a protocol', rechercher: 'Search threads (word, symptom, place…)', recents: 'Recent',
    aucunSavoir: 'No posts yet', aucunSavoirDetail: 'Be the first: what you learned in the field can help a colleague across the country.',
    genreTitre: 'What are you posting?', genre: { question: 'A question', partage: 'An experience report', protocole: 'A protocol / what to do' },
    genreDetail: { question: 'You ask a doctor for advice.', partage: 'You describe what worked, or not, and what you take from it.', protocole: 'A clear step-by-step procedure others can apply.' },
    titreSavoir: 'Title', titreSavoirExemple: 'E.g.: Managing severe malaria without injectable artesunate',
    descriptionSavoir: 'Content', descriptionSavoirAide: 'Context, what you did, outcome, what you advise. Never a patient name or a phone number.',
    commentaires: 'Comments', pasEncoreCommentaire: 'No comments yet.', commentairePlaceholder: 'Your comment, your experience, a detail…', commenter: 'Comment', publierSavoir: 'Publish',
  },
}

const AR = {
  admin: { territoire: 'الإقليم', geographie: 'الأحياء' },
  commun: { donneesHorsLigne: 'لا شبكة: هذه آخر المعلومات المحفوظة على هذا الهاتف ({date}).' },
  voix: { lire: 'قراءة الصفحة بصوت عالٍ', arreter: 'إيقاف القراءة' },
  inst: { kpi: { titre: 'اليوم في نطاقكم' } },
  pilotage: {
    groupe: { comptes: 'الحسابات والوصول', soignants: 'العاملون الصحيون', communication: 'التواصل', territoire: 'الإقليم', donnees: 'البيانات والرصد' },
    comptesGestion: 'حسابات الإدارة', comptesAide: 'البرنامج، النقابات، السلطات، المسؤولون', inactifs: '{n} معطّل',
    nouveauCompte: 'إنشاء حساب إدارة', reglagesAide: 'العرض التجريبي، السجل، الأمان',
    verifies: 'عاملون صحيون موثّقون', entraide: 'أسئلة مفتوحة (التعاضد)', partages: '{n} مشاركة خبرة',
    brouillons: '{n} مسودة', diffusionAide: 'رسائل إلى العاملين الصحيين والأسر',
    regions: 'الأقاليم / المحافظات', districts: 'المقاطعات الصحية', formations: 'المرافق الصحية', villes: 'المدن', quartiersAttente: 'أحياء مقترحة للموافقة',
    demandes7j: '{n} طلب مساعدة خلال 7 أيام', journal: 'إجراءات مسجّلة (7 أيام)', journalAide: 'كل قرار موقّع ومؤرّخ',
  },
  terr: {
    intro: 'خريطة البلاد كما يعرفها التطبيق: الأقاليم والمدن والمقاطعات والمرافق الصحية. كل إنشاء أو تصحيح يُسجَّل باسمكم ويظهر للجميع عند التحديث التالي.',
    regions: 'الأقاليم', villes: 'المدن', districts: 'المقاطعات', formations: 'المرافق', rattachement: 'مدينة ← مقاطعة',
    nouvelleRegion: 'إقليم جديد', nomRegion: 'اسم الإقليم (بالفرنسية)', nomArabe: 'الاسم بالعربية', code: 'الرمز', codeAide: 'من 2 إلى 6 أحرف، فريد (مثال: NDJ). لا يُعدَّل لاحقاً.',
    ordre: 'ترتيب العرض', ordreAide: 'الأصغر يظهر أولاً في القوائم (100 افتراضياً).',
    pasDeSuppression: 'لا يُحذف إقليم من التطبيق: مدنه وطلباتها تعتمد عليه.',
    nbVilles: '{n} مدينة', nouvelleVille: 'مدينة جديدة', nomVille: 'اسم المدينة (بالفرنسية)', chefLieu: 'عاصمة الإقليم', sansDistrict: 'بدون مقاطعة',
    codeInvalide: 'يجب أن يكون الرمز من 2 إلى 6 أحرف أو أرقام.', codeExistant: 'هذا الرمز موجود: اختاروا غيره.',
    ouvrir: 'إدارة الإقليم (الأقاليم، المقاطعات، المرافق، المدن)',
  },
  entraide: {
    ongletQuestions: 'أسئلة', ongletSavoir: 'خبرات وبروتوكولات',
    introSavoir: 'الذاكرة الجماعية للعاملين الصحيين في تشاد: خبرات ميدانية، ما يجب فعله، تنظيمات ناجحة. يمكن لأي عامل صحي نشط النشر والتعليق. تبقى المواضيع مقروءة وقابلة للبحث.',
    partager: 'مشاركة خبرة أو بروتوكول', rechercher: 'البحث في المواضيع (كلمة، عَرَض، مكان…)', recents: 'الأحدث',
    aucunSavoir: 'لا مشاركات بعد', aucunSavoirDetail: 'كونوا الأوائل: ما تعلمتموه في الميدان قد يساعد زميلاً في الطرف الآخر من البلاد.',
    genreTitre: 'ماذا تنشرون؟', genre: { question: 'سؤال', partage: 'مشاركة خبرة', protocole: 'بروتوكول / ما يجب فعله' },
    genreDetail: { question: 'تطلبون نصيحة طبيب.', partage: 'تروون ما نجح أو لم ينجح وما استخلصتموه.', protocole: 'خطوات واضحة يمكن للآخرين تطبيقها.' },
    titreSavoir: 'العنوان', titreSavoirExemple: 'مثال: علاج الملاريا الشديدة بدون أرتيسونات حقني',
    descriptionSavoir: 'المحتوى', descriptionSavoirAide: 'السياق، ما فعلتموه، النتيجة، ما تنصحون به. لا اسم مريض ولا رقم هاتف أبداً.',
    commentaires: 'تعليقات', pasEncoreCommentaire: 'لا تعليقات بعد.', commentairePlaceholder: 'تعليقكم، خبرتكم، توضيح…', commenter: 'تعليق', publierSavoir: 'نشر',
  },
}

const FORCE = {
  fr: { 'admin.geographie': 'Quartiers' }, en: { 'admin.geographie': 'Neighbourhoods' }, ar: { 'admin.geographie': 'الأحياء' },
}
function fusionner(cible, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { cible[k] = cible[k] && typeof cible[k] === 'object' ? cible[k] : {}; fusionner(cible[k], v) }
    else if (cible[k] === undefined) cible[k] = v
  }
}
function forcer(cible, chemin, valeur) {
  const parts = chemin.split('.'); let o = cible
  for (const p of parts.slice(0, -1)) { o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}; o = o[p] }
  o[parts[parts.length - 1]] = valeur
}
for (const [fichier, ajout] of [['fr', FR], ['en', EN], ['ar', AR]]) {
  const p = new URL(`../src/i18n/${fichier}.json`, import.meta.url)
  const j = JSON.parse(readFileSync(p, 'utf8'))
  fusionner(j, ajout)
  for (const [chemin, valeur] of Object.entries(FORCE[fichier] || {})) forcer(j, chemin, valeur)
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
  console.log(fichier, 'ok')
}
