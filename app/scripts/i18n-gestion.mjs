/* Ajoute les textes de l'espace de gestion (novembre 2026 : statistiques,
   suivi deontologique des Ordres, referentiel, diffusion) aux trois
   dictionnaires. Idempotent : une cle deja presente n'est pas ecrasee,
   sauf les quelques libelles renommes (FORCE). L'arabe tchadien (ar-td)
   retombe sur le francais pour ces ecrans d'administration. */
import { readFileSync, writeFileSync } from 'node:fs'

const FR = {
  admin: {
    statistiques: 'Statistiques', deontologie: 'Déontologie', diffusion: 'Diffusion',
    demoTitre: 'Démonstration', demoIntro: "Le jeu de démonstration (soignants, demandes, ordonnances, vaccinations… tous fictifs) est isolé : un soignant réel ne le voit jamais, et les statistiques l'excluent tant que l'interrupteur ci-dessous est éteint.",
    demoEffacee: 'Démonstration effacée :', rattacherDemo: 'Rattacher un compte à la démonstration',
    rattacherDemoAide: "Un compte rattaché ne voit que les demandes de démonstration et disparaît avec elle lors de l'effacement. Ne rattachez jamais un vrai soignant.",
    mettreDemo: 'Passer en démo', sortirDemo: 'Sortir de la démo',
  },
  typePro: { aide_soignant: 'Aide-soignant', pharmacien: 'Pharmacien' },
  pro: { transcrire: 'Lire le message vocal (transcription)', transcription: 'Message vocal transcrit', transcriptionNote: 'Transcription automatique : écoutez le message en cas de doute.' },
  stats: {
    intro: { general: "Chiffres du secteur, calculés dans la base sur votre périmètre : uniquement des comptages et des médianes, jamais une fiche ni un patient.",
      ordre: "Statistiques agrégées de la plateforme sur votre périmètre : comptages et délais, aucune donnée individuelle de patient." },
    demoIncluse: 'Démonstration incluse dans ces chiffres', inclureDemo: 'Inclure la démonstration', j365: '12 mois',
    resume: 'Résumé', resumeIndisponible: 'Résumé indisponible pour ce compte.', vuesPretes: 'Vues prêtes', requete: 'Requête libre',
    sourceTitre: 'Données', mesureTitre: 'Mesure', dim1: 'Dimension', dim2: 'Croiser avec', aucune: 'Aucune', afficher: 'Afficher',
    vide: 'Aucune donnée', videDetail: 'Rien sur cette période et ce périmètre. Élargissez la période ou changez de filtre.',
    median: 'Médiane', delaiNote: "Délai médian, en minutes, entre l'envoi de la demande et la première prise en charge (en route, appel, WhatsApp ou résolu). Un simple « vu » ne compte pas.",
    confidentialite: "Comptages uniquement, calculés dans la base, bornés au périmètre du compte connecté.",
    langueExport: 'Langue du document', rapportComplet: 'Rapport complet (Word)', rapportTitre: 'Rapport du secteur de la santé numérique',
    exportAide: "Excel : les tableaux. Word : les tableaux avec un texte d'analyse rédigé dans la langue choisie. Le rapport complet ajoute les vues prêtes.",
    exportIndisponible: "Export indisponible en mode démonstration locale.", autres: 'Autres', inconnu: 'Non renseigné', moinsUnAn: 'Moins d\'un an', ans: 'ans', dose: 'Dose',
    parNiveau: "Demandes par niveau d'urgence", parType: 'Soignants inscrits par type', parStatut: 'Demandes par statut',
    k: { demandes: "Demandes d'aide", vitales: 'Urgences vitales', taux: 'Taux de prise en charge', delai: 'Délai médian de prise en charge', escaladees: 'Escaladées',
      villes: 'Villes actives', soignants: 'Soignants inscrits', verifies: 'Soignants vérifiés', actifs: 'Soignants ayant répondu', ordonnances: 'Ordonnances', servies: 'Ordonnances servies',
      doses: 'Doses de vaccin déclarées', evenements: 'Signalements communautaires', confirmes: 'Signalements confirmés', entraide: "Cas d'entraide" },
    source: { demandes: "Demandes d'aide", reponses: 'Réponses des soignants', professionnels: 'Soignants et pharmacies', ordonnances: 'Ordonnances', vaccins: 'Vaccinations déclarées', evenements: 'Signalements communautaires', entraide: 'Entraide entre soignants' },
    mesure: { nombre: 'Nombre', delai_median: 'Délai médian (min)' },
    dim: { province: 'Province', ville: 'Ville', district: 'District sanitaire', quartier: 'Quartier', jour: 'Jour', semaine: 'Semaine', mois: 'Mois', categorie: 'Motif', niveau: "Niveau d'urgence",
      statut: 'Statut', sexe: 'Sexe', tranche_age: "Tranche d'âge", pour_qui: 'Pour qui', escalade: 'Escaladée', action: 'Action', type_pro: 'Type de soignant', type: 'Type', en_ligne: 'En ligne',
      diffusion: 'Mode de diffusion', disponibilite: 'Disponibilité (1re réponse)', vaccin: 'Vaccin', dose: 'Dose', a_l_heure: "À l'heure", urgence: 'Urgence', specialite: 'Spécialité' },
    preset: { demandesProvince: 'Demandes par province', motifsNiveau: 'Motifs × niveau', delaiProvince: 'Délai par province', sexeAge: 'Âge × sexe', evolution: 'Évolution hebdomadaire',
      quartiers: "Quartiers de N'Djamena", vaccins: 'Vaccins × ponctualité', soignants: 'Soignants par type', actions: 'Actions des soignants', ordonnances: 'Ordonnances : disponibilité', entraide: 'Entraide par spécialité', evenements: 'Signalements par type' },
    forme: { auto: 'Auto', barres: 'Barres', courbe: 'Courbe', empilees: 'Empilées', camembert: 'Camembert', tableau: 'Tableau seul' },
    action: { vu: 'Vu', en_route: 'En route', appelle: 'Appel', whatsapp: 'WhatsApp', indisponible: 'Indisponible', resolu: 'Résolu' },
    diffusion: { diffusion: 'Diffusée aux pharmacies', pharmacie_choisie: 'Pharmacie choisie' },
    disponibilite: { complete: 'Complète', partielle: 'Partielle', indisponible: 'Indisponible', sans_reponse: 'Sans réponse' },
  },
  deon: {
    titre: 'Suivi déontologique',
    intro: { ordre_medecins: "Médecins, infirmiers, sages-femmes et aides-soignants inscrits : leur activité en comptages (réponses, prises en charge, délais, signalements), jamais le contenu des demandes. Les signaux à regarder sont indiqués ; chaque décision est journalisée.",
      ordre_pharmaciens: "Pharmacies et pharmaciens inscrits : leur activité en comptages (réponses, prises en charge, délais, signalements), jamais le contenu des demandes. Les signaux à regarder sont indiqués ; chaque décision est journalisée.",
      autre: "Activité des soignants inscrits, en comptages. Chaque décision est journalisée." },
    k: { inscrits: 'Inscrits', aSurveiller: 'À regarder', delai: 'Délai médian', suspendus: 'Suspendus' },
    col: { nom: 'Nom', type: 'Type', statut: 'Statut', reponses: 'Réponses', demandes: 'Demandes distinctes', prises: 'Prises en charge', delai: 'Délai médian (min)', signalements: 'Signalements ouverts', signaux: 'Signaux' },
    signal: { signale: 'Signalement ouvert', suspendu: 'Suspendu', lent: 'Délai élevé', inactif: 'Sans réponse sur la période', expire: 'Vérification qui expire' },
    signalDetail: { signale: 'Un signalement de patient ou de confrère est en attente de traitement.', suspendu: 'Compte suspendu : il ne reçoit plus de demandes.',
      lent: 'Délai médian de prise en charge supérieur à 45 minutes.', inactif: "Inscrit mais aucune réponse sur la période choisie.", expire: 'La vérification provisoire expire dans moins de 7 jours.' },
    tousSignaux: 'Tous les signaux', tri: { reponses: 'Trier : réponses', delai: 'Trier : délai', signalements: 'Trier : signalements', nom: 'Trier : nom', inscription: 'Trier : inscription' },
    vide: 'Aucun soignant ne correspond.', derniereActivite: 'dernière activité', signalements: 'Signalements', aucunSignalement: 'Aucun signalement.',
    confidentialite: "Cet écran ne montre jamais une demande ni un patient : uniquement des comptages par soignant, calculés dans la base.",
  },
  ref: {
    titre: 'Circonscriptions et formations sanitaires', intro: "Créez ou corrigez les districts sanitaires, les formations (centres de santé, hôpitaux) et le rattachement des villes à leur district. Chaque modification est journalisée.",
    districts: 'Districts', formations: 'Formations', villes: 'Villes → district', nouveauDistrict: 'Nouveau district', nomDistrict: 'Nom du district', pcode: 'Code (P-code)', pcodeAide: 'Facultatif : code officiel OCHA/MSP.',
    journal: 'Modification journalisée.', choisirDistrict: 'Choisir un district', nouvelleFormation: 'Nouvelle formation sanitaire', aucuneFormation: 'Aucune formation affichée',
    aucuneFormationDetail: 'Choisissez un district ou tapez au moins deux lettres du nom.', nonFonctionnelle: 'non fonctionnelle', nomFormation: 'Nom', typeFormation: 'Type', affiliation: 'Affiliation', district: 'District sanitaire', fonctionnelle: 'Fonctionnelle',
    typeFs: { CS: 'Centre de santé', HD: 'Hôpital de district', HP: 'Hôpital provincial', HR: 'Hôpital régional', HN: 'Hôpital national', CL: 'Clinique', PS: 'Poste de santé', AUTRE: 'Autre' },
    affil: { PUB: 'Public', PRIV: 'Privé', CONF: 'Confessionnel', ONG: 'ONG', MIL: 'Militaire' },
    villesIntro: "Le district d'une ville relie les demandes d'aide aux statistiques par district.", rattacher: 'Rattacher la ville à ce district',
    villesNote: 'Le changement est pris en compte dans les statistiques et dans le référentiel servi à l\'application (quelques minutes de cache).',
  },
  diff: {
    intro: "Préparez un message de prévention à partir d'un modèle, choisissez les soignants destinataires, puis envoyez-le par WhatsApp et publiez-le dans l'application. Les contacts sont ceux des soignants inscrits ; aucun numéro de patient ne sort jamais.",
    modeles: 'Modèles', modele: { dengue: 'Dengue', paludisme: 'Paludisme', cholera: 'Choléra', rougeole: 'Rougeole', meningite: 'Méningite', chaleur: 'Fortes chaleurs', inondations: 'Inondations', campagne: 'Campagne de vaccination' },
    message: 'Message', messageAide: 'Modifiable librement. Court : c\'est un message WhatsApp.', ajouterArabe: 'Ajouter la version arabe', destinataires: 'Destinataires', destinatairesAide: 'Types de soignants inscrits à joindre.',
    publierAussi: "Publier aussi dans l'application", preparer: 'Préparer la diffusion', publiee: "Publication créée dans l'application.", listePrete: '{n} contact(s) prêt(s)', aucunContact: 'Aucun soignant inscrit ne correspond.',
    copierMessage: 'Copier le message', telechargerContacts: 'Contacts (CSV)', whatsappAide: "Petite liste : ouvrez WhatsApp contact par contact. Grande liste : téléchargez les contacts et créez une liste de diffusion dans WhatsApp Business.",
    journal: 'Chaque export de contacts est inscrit au journal.',
  },
}

const EN = {
  admin: {
    statistiques: 'Statistics', deontologie: 'Professional conduct', diffusion: 'Broadcast',
    demoTitre: 'Demonstration', demoIntro: 'The demonstration data set (health workers, requests, prescriptions, vaccinations… all fictitious) is isolated: a real health worker never sees it, and statistics exclude it while the switch below is off.',
    demoEffacee: 'Demonstration deleted:', rattacherDemo: 'Attach an account to the demonstration',
    rattacherDemoAide: 'An attached account only sees demonstration requests and is removed with them when the demonstration is deleted. Never attach a real health worker.',
    mettreDemo: 'Set as demo', sortirDemo: 'Leave demo',
  },
  typePro: { aide_soignant: 'Nursing assistant', pharmacien: 'Pharmacist' },
  pro: { transcrire: 'Read the voice message (transcript)', transcription: 'Voice message transcript', transcriptionNote: 'Automatic transcript: listen to the message if in doubt.' },
  stats: {
    intro: { general: 'Sector figures computed in the database over your perimeter: counts and medians only, never a record nor a patient.',
      ordre: 'Aggregated platform statistics over your perimeter: counts and delays, no individual patient data.' },
    demoIncluse: 'Demonstration included in these figures', inclureDemo: 'Include demonstration', j365: '12 months',
    resume: 'Summary', resumeIndisponible: 'Summary unavailable for this account.', vuesPretes: 'Ready-made views', requete: 'Custom query',
    sourceTitre: 'Data', mesureTitre: 'Measure', dim1: 'Dimension', dim2: 'Cross with', aucune: 'None', afficher: 'Show',
    vide: 'No data', videDetail: 'Nothing for this period and perimeter. Widen the period or change the filter.',
    median: 'Median', delaiNote: 'Median delay, in minutes, between the request and the first care action (on the way, call, WhatsApp or resolved). A mere "seen" does not count.',
    confidentialite: 'Counts only, computed in the database, bounded to the connected account\'s perimeter.',
    langueExport: 'Document language', rapportComplet: 'Full report (Word)', rapportTitre: 'Digital health sector report',
    exportAide: 'Excel: the tables. Word: the tables with an analysis written in the chosen language. The full report adds the ready-made views.',
    exportIndisponible: 'Export unavailable in local demonstration mode.', autres: 'Other', inconnu: 'Not recorded', moinsUnAn: 'Under one year', ans: 'years', dose: 'Dose',
    parNiveau: 'Requests by urgency level', parType: 'Registered health workers by type', parStatut: 'Requests by status',
    k: { demandes: 'Help requests', vitales: 'Life-threatening', taux: 'Care rate', delai: 'Median time to care', escaladees: 'Escalated',
      villes: 'Active towns', soignants: 'Registered health workers', verifies: 'Verified health workers', actifs: 'Health workers who responded', ordonnances: 'Prescriptions', servies: 'Prescriptions filled',
      doses: 'Vaccine doses declared', evenements: 'Community reports', confirmes: 'Confirmed reports', entraide: 'Peer-support cases' },
    source: { demandes: 'Help requests', reponses: 'Health worker responses', professionnels: 'Health workers and pharmacies', ordonnances: 'Prescriptions', vaccins: 'Declared vaccinations', evenements: 'Community reports', entraide: 'Peer support' },
    mesure: { nombre: 'Count', delai_median: 'Median delay (min)' },
    dim: { province: 'Province', ville: 'Town', district: 'Health district', quartier: 'Neighbourhood', jour: 'Day', semaine: 'Week', mois: 'Month', categorie: 'Reason', niveau: 'Urgency level',
      statut: 'Status', sexe: 'Sex', tranche_age: 'Age group', pour_qui: 'For whom', escalade: 'Escalated', action: 'Action', type_pro: 'Health worker type', type: 'Type', en_ligne: 'Online',
      diffusion: 'Broadcast mode', disponibilite: 'Availability (1st reply)', vaccin: 'Vaccine', dose: 'Dose', a_l_heure: 'On time', urgence: 'Urgency', specialite: 'Specialty' },
    preset: { demandesProvince: 'Requests by province', motifsNiveau: 'Reasons × level', delaiProvince: 'Delay by province', sexeAge: 'Age × sex', evolution: 'Weekly trend',
      quartiers: "N'Djamena neighbourhoods", vaccins: 'Vaccines × punctuality', soignants: 'Health workers by type', actions: 'Health worker actions', ordonnances: 'Prescriptions: availability', entraide: 'Peer support by specialty', evenements: 'Reports by type' },
    forme: { auto: 'Auto', barres: 'Bars', courbe: 'Line', empilees: 'Stacked', camembert: 'Pie', tableau: 'Table only' },
    action: { vu: 'Seen', en_route: 'On the way', appelle: 'Call', whatsapp: 'WhatsApp', indisponible: 'Unavailable', resolu: 'Resolved' },
    diffusion: { diffusion: 'Broadcast to pharmacies', pharmacie_choisie: 'Chosen pharmacy' },
    disponibilite: { complete: 'Complete', partielle: 'Partial', indisponible: 'Unavailable', sans_reponse: 'No reply' },
  },
  deon: {
    titre: 'Professional conduct',
    intro: { ordre_medecins: 'Registered doctors, nurses, midwives and nursing assistants: their activity as counts (responses, care actions, delays, reports), never the content of requests. Signals worth a look are flagged; every decision is logged.',
      ordre_pharmaciens: 'Registered pharmacies and pharmacists: their activity as counts (responses, care actions, delays, reports), never the content of requests. Signals worth a look are flagged; every decision is logged.',
      autre: 'Activity of registered health workers, as counts. Every decision is logged.' },
    k: { inscrits: 'Registered', aSurveiller: 'Worth a look', delai: 'Median delay', suspendus: 'Suspended' },
    col: { nom: 'Name', type: 'Type', statut: 'Status', reponses: 'Responses', demandes: 'Distinct requests', prises: 'Care actions', delai: 'Median delay (min)', signalements: 'Open reports', signaux: 'Signals' },
    signal: { signale: 'Open report', suspendu: 'Suspended', lent: 'High delay', inactif: 'No response over the period', expire: 'Verification expiring' },
    signalDetail: { signale: 'A report from a patient or a colleague is awaiting handling.', suspendu: 'Suspended account: no longer receives requests.',
      lent: 'Median time to care above 45 minutes.', inactif: 'Registered but no response over the chosen period.', expire: 'Provisional verification expires in less than 7 days.' },
    tousSignaux: 'All signals', tri: { reponses: 'Sort: responses', delai: 'Sort: delay', signalements: 'Sort: reports', nom: 'Sort: name', inscription: 'Sort: registration' },
    vide: 'No health worker matches.', derniereActivite: 'last activity', signalements: 'Reports', aucunSignalement: 'No report.',
    confidentialite: 'This screen never shows a request or a patient: only per-health-worker counts, computed in the database.',
  },
  ref: {
    titre: 'Health districts and facilities', intro: 'Create or correct health districts, facilities (health centres, hospitals) and the link between towns and their district. Every change is logged.',
    districts: 'Districts', formations: 'Facilities', villes: 'Towns → district', nouveauDistrict: 'New district', nomDistrict: 'District name', pcode: 'Code (P-code)', pcodeAide: 'Optional: official OCHA/MoH code.',
    journal: 'Change logged.', choisirDistrict: 'Choose a district', nouvelleFormation: 'New health facility', aucuneFormation: 'No facility shown',
    aucuneFormationDetail: 'Choose a district or type at least two letters of the name.', nonFonctionnelle: 'not functional', nomFormation: 'Name', typeFormation: 'Type', affiliation: 'Affiliation', district: 'Health district', fonctionnelle: 'Functional',
    typeFs: { CS: 'Health centre', HD: 'District hospital', HP: 'Provincial hospital', HR: 'Regional hospital', HN: 'National hospital', CL: 'Clinic', PS: 'Health post', AUTRE: 'Other' },
    affil: { PUB: 'Public', PRIV: 'Private', CONF: 'Faith-based', ONG: 'NGO', MIL: 'Military' },
    villesIntro: 'A town\'s district links help requests to per-district statistics.', rattacher: 'Attach the town to this district',
    villesNote: 'The change applies to statistics and to the referential served to the app (a few minutes of cache).',
  },
  diff: {
    intro: 'Prepare a prevention message from a template, choose the recipient health workers, then send it by WhatsApp and publish it in the app. Contacts are those of registered health workers; no patient number ever leaves.',
    modeles: 'Templates', modele: { dengue: 'Dengue', paludisme: 'Malaria', cholera: 'Cholera', rougeole: 'Measles', meningite: 'Meningitis', chaleur: 'Heatwave', inondations: 'Floods', campagne: 'Vaccination campaign' },
    message: 'Message', messageAide: 'Freely editable. Keep it short: it is a WhatsApp message.', ajouterArabe: 'Add the Arabic version', destinataires: 'Recipients', destinatairesAide: 'Types of registered health workers to reach.',
    publierAussi: 'Also publish in the app', preparer: 'Prepare the broadcast', publiee: 'Publication created in the app.', listePrete: '{n} contact(s) ready', aucunContact: 'No registered health worker matches.',
    copierMessage: 'Copy the message', telechargerContacts: 'Contacts (CSV)', whatsappAide: 'Small list: open WhatsApp contact by contact. Large list: download the contacts and create a broadcast list in WhatsApp Business.',
    journal: 'Every contact export is logged.',
  },
}

const AR = {
  admin: {
    statistiques: 'الإحصاءات', deontologie: 'أخلاقيات المهنة', diffusion: 'النشر',
    demoTitre: 'العرض التوضيحي', demoIntro: 'بيانات العرض التوضيحي (مهنيون، طلبات، وصفات، تطعيمات… كلها وهمية) معزولة: لا يراها المهني الحقيقي أبداً، وتستبعدها الإحصاءات ما دام المفتاح أدناه مطفأً.',
    demoEffacee: 'تم حذف العرض التوضيحي:', rattacherDemo: 'ربط حساب بالعرض التوضيحي',
    rattacherDemoAide: 'الحساب المربوط لا يرى إلا طلبات العرض التوضيحي ويُحذف معه عند المسح. لا تربطوا أبداً مهنياً حقيقياً.',
    mettreDemo: 'تحويل إلى عرض', sortirDemo: 'إخراج من العرض',
  },
  typePro: { aide_soignant: 'مساعد تمريض', pharmacien: 'صيدلي' },
  pro: { transcrire: 'قراءة الرسالة الصوتية (تفريغ)', transcription: 'تفريغ الرسالة الصوتية', transcriptionNote: 'تفريغ آلي: استمعوا إلى الرسالة عند الشك.' },
  stats: {
    intro: { general: 'أرقام القطاع محسوبة في قاعدة البيانات ضمن نطاقكم: أعداد ووسيطات فقط، لا بطاقة ولا مريضاً.',
      ordre: 'إحصاءات مجمّعة للمنصة ضمن نطاقكم: أعداد ومهل، دون أي بيانات فردية للمرضى.' },
    demoIncluse: 'العرض التوضيحي مُدرج في هذه الأرقام', inclureDemo: 'إدراج العرض التوضيحي', j365: '12 شهراً',
    resume: 'ملخص', resumeIndisponible: 'الملخص غير متاح لهذا الحساب.', vuesPretes: 'عروض جاهزة', requete: 'استعلام حر',
    sourceTitre: 'البيانات', mesureTitre: 'القياس', dim1: 'البُعد', dim2: 'تقاطع مع', aucune: 'لا شيء', afficher: 'عرض',
    vide: 'لا توجد بيانات', videDetail: 'لا شيء في هذه الفترة وهذا النطاق. وسّعوا الفترة أو غيّروا المرشّح.',
    median: 'الوسيط', delaiNote: 'المهلة الوسيطة بالدقائق بين إرسال الطلب وأول إجراء رعاية (في الطريق، اتصال، واتساب أو حُلّ). مجرد «شوهد» لا يُحتسب.',
    confidentialite: 'أعداد فقط، محسوبة في قاعدة البيانات، محدودة بنطاق الحساب المتصل.',
    langueExport: 'لغة الوثيقة', rapportComplet: 'تقرير كامل (وورد)', rapportTitre: 'تقرير قطاع الصحة الرقمية',
    exportAide: 'إكسل: الجداول. وورد: الجداول مع نص تحليلي باللغة المختارة. التقرير الكامل يضيف العروض الجاهزة.',
    exportIndisponible: 'التصدير غير متاح في وضع العرض المحلي.', autres: 'أخرى', inconnu: 'غير مسجَّل', moinsUnAn: 'أقل من سنة', ans: 'سنة', dose: 'الجرعة',
    parNiveau: 'الطلبات حسب مستوى الاستعجال', parType: 'المهنيون المسجلون حسب النوع', parStatut: 'الطلبات حسب الحالة',
    k: { demandes: 'طلبات المساعدة', vitales: 'حالات تهدد الحياة', taux: 'نسبة التكفل', delai: 'المهلة الوسيطة للتكفل', escaladees: 'مُصعَّدة',
      villes: 'مدن نشطة', soignants: 'مهنيون مسجلون', verifies: 'مهنيون موثَّقون', actifs: 'مهنيون أجابوا', ordonnances: 'وصفات طبية', servies: 'وصفات مصروفة',
      doses: 'جرعات لقاح مُصرَّح بها', evenements: 'بلاغات مجتمعية', confirmes: 'بلاغات مؤكدة', entraide: 'حالات التعاضد' },
    source: { demandes: 'طلبات المساعدة', reponses: 'إجابات المهنيين', professionnels: 'المهنيون والصيدليات', ordonnances: 'الوصفات الطبية', vaccins: 'التطعيمات المصرَّح بها', evenements: 'البلاغات المجتمعية', entraide: 'التعاضد بين المهنيين' },
    mesure: { nombre: 'العدد', delai_median: 'المهلة الوسيطة (د)' },
    dim: { province: 'الإقليم', ville: 'المدينة', district: 'المقاطعة الصحية', quartier: 'الحي', jour: 'اليوم', semaine: 'الأسبوع', mois: 'الشهر', categorie: 'السبب', niveau: 'مستوى الاستعجال',
      statut: 'الحالة', sexe: 'الجنس', tranche_age: 'الفئة العمرية', pour_qui: 'لمن', escalade: 'مُصعَّد', action: 'الإجراء', type_pro: 'نوع المهني', type: 'النوع', en_ligne: 'متصل',
      diffusion: 'طريقة النشر', disponibilite: 'التوفر (أول رد)', vaccin: 'اللقاح', dose: 'الجرعة', a_l_heure: 'في الموعد', urgence: 'الاستعجال', specialite: 'التخصص' },
    preset: { demandesProvince: 'الطلبات حسب الإقليم', motifsNiveau: 'الأسباب × المستوى', delaiProvince: 'المهلة حسب الإقليم', sexeAge: 'العمر × الجنس', evolution: 'التطور الأسبوعي',
      quartiers: 'أحياء إنجامينا', vaccins: 'اللقاحات × الالتزام بالموعد', soignants: 'المهنيون حسب النوع', actions: 'إجراءات المهنيين', ordonnances: 'الوصفات: التوفر', entraide: 'التعاضد حسب التخصص', evenements: 'البلاغات حسب النوع' },
    forme: { auto: 'تلقائي', barres: 'أعمدة', courbe: 'منحنى', empilees: 'مكدّسة', camembert: 'دائري', tableau: 'جدول فقط' },
    action: { vu: 'شوهد', en_route: 'في الطريق', appelle: 'اتصال', whatsapp: 'واتساب', indisponible: 'غير متاح', resolu: 'حُلّ' },
    diffusion: { diffusion: 'منشورة للصيدليات', pharmacie_choisie: 'صيدلية مختارة' },
    disponibilite: { complete: 'كاملة', partielle: 'جزئية', indisponible: 'غير متوفرة', sans_reponse: 'بلا رد' },
  },
  deon: {
    titre: 'متابعة أخلاقيات المهنة',
    intro: { ordre_medecins: 'الأطباء والممرضون والقابلات ومساعدو التمريض المسجلون: نشاطهم بالأعداد (إجابات، تكفل، مهل، بلاغات)، ولا شيء من محتوى الطلبات أبداً. الإشارات التي تستحق النظر مبيَّنة؛ وكل قرار يُسجَّل.',
      ordre_pharmaciens: 'الصيدليات والصيادلة المسجلون: نشاطهم بالأعداد (إجابات، تكفل، مهل، بلاغات)، ولا شيء من محتوى الطلبات أبداً. الإشارات التي تستحق النظر مبيَّنة؛ وكل قرار يُسجَّل.',
      autre: 'نشاط المهنيين المسجلين بالأعداد. كل قرار يُسجَّل.' },
    k: { inscrits: 'مسجلون', aSurveiller: 'تستحق النظر', delai: 'المهلة الوسيطة', suspendus: 'موقوفون' },
    col: { nom: 'الاسم', type: 'النوع', statut: 'الحالة', reponses: 'الإجابات', demandes: 'طلبات متمايزة', prises: 'حالات التكفل', delai: 'المهلة الوسيطة (د)', signalements: 'بلاغات مفتوحة', signaux: 'إشارات' },
    signal: { signale: 'بلاغ مفتوح', suspendu: 'موقوف', lent: 'مهلة مرتفعة', inactif: 'بلا إجابة خلال الفترة', expire: 'توثيق على وشك الانتهاء' },
    signalDetail: { signale: 'بلاغ من مريض أو زميل في انتظار المعالجة.', suspendu: 'حساب موقوف: لم يعد يتلقى طلبات.',
      lent: 'المهلة الوسيطة للتكفل تتجاوز 45 دقيقة.', inactif: 'مسجَّل لكن دون أي إجابة خلال الفترة المختارة.', expire: 'ينتهي التوثيق المؤقت خلال أقل من 7 أيام.' },
    tousSignaux: 'كل الإشارات', tri: { reponses: 'ترتيب: الإجابات', delai: 'ترتيب: المهلة', signalements: 'ترتيب: البلاغات', nom: 'ترتيب: الاسم', inscription: 'ترتيب: التسجيل' },
    vide: 'لا يوجد مهني مطابق.', derniereActivite: 'آخر نشاط', signalements: 'البلاغات', aucunSignalement: 'لا بلاغات.',
    confidentialite: 'هذه الشاشة لا تعرض أبداً طلباً أو مريضاً: أعداد فقط لكل مهني، محسوبة في قاعدة البيانات.',
  },
  ref: {
    titre: 'المقاطعات والمرافق الصحية', intro: 'أنشئوا أو صحّحوا المقاطعات الصحية والمرافق (مراكز صحية، مستشفيات) وربط المدن بمقاطعاتها. كل تعديل يُسجَّل.',
    districts: 'المقاطعات', formations: 'المرافق', villes: 'المدن ← المقاطعة', nouveauDistrict: 'مقاطعة جديدة', nomDistrict: 'اسم المقاطعة', pcode: 'الرمز (P-code)', pcodeAide: 'اختياري: الرمز الرسمي (OCHA/وزارة الصحة).',
    journal: 'تعديل مسجَّل.', choisirDistrict: 'اختر مقاطعة', nouvelleFormation: 'مرفق صحي جديد', aucuneFormation: 'لا مرافق معروضة',
    aucuneFormationDetail: 'اختر مقاطعة أو اكتب حرفين على الأقل من الاسم.', nonFonctionnelle: 'غير عامل', nomFormation: 'الاسم', typeFormation: 'النوع', affiliation: 'التبعية', district: 'المقاطعة الصحية', fonctionnelle: 'عامل',
    typeFs: { CS: 'مركز صحي', HD: 'مستشفى المقاطعة', HP: 'مستشفى الإقليم', HR: 'مستشفى جهوي', HN: 'مستشفى وطني', CL: 'عيادة', PS: 'نقطة صحية', AUTRE: 'آخر' },
    affil: { PUB: 'عمومي', PRIV: 'خاص', CONF: 'ديني', ONG: 'منظمة غير حكومية', MIL: 'عسكري' },
    villesIntro: 'مقاطعة المدينة تربط طلبات المساعدة بالإحصاءات حسب المقاطعة.', rattacher: 'ربط المدينة بهذه المقاطعة',
    villesNote: 'يُعتمد التغيير في الإحصاءات وفي المرجع الذي يُقدَّم للتطبيق (بضع دقائق من التخزين المؤقت).',
  },
  diff: {
    intro: 'حضّروا رسالة وقاية من نموذج، اختاروا المهنيين المستهدفين، ثم أرسلوها عبر واتساب وانشروها في التطبيق. جهات الاتصال هي المهنيون المسجلون؛ ولا يخرج رقم مريض أبداً.',
    modeles: 'النماذج', modele: { dengue: 'حمى الضنك', paludisme: 'الملاريا', cholera: 'الكوليرا', rougeole: 'الحصبة', meningite: 'التهاب السحايا', chaleur: 'موجة حر', inondations: 'فيضانات', campagne: 'حملة تطعيم' },
    message: 'الرسالة', messageAide: 'قابلة للتعديل بحرية. قصيرة: إنها رسالة واتساب.', ajouterArabe: 'إضافة النسخة العربية', destinataires: 'المستلمون', destinatairesAide: 'أنواع المهنيين المسجلين المراد الوصول إليهم.',
    publierAussi: 'نشرها أيضاً في التطبيق', preparer: 'تحضير النشر', publiee: 'تم إنشاء المنشور في التطبيق.', listePrete: '{n} جهة اتصال جاهزة', aucunContact: 'لا يوجد مهني مسجل مطابق.',
    copierMessage: 'نسخ الرسالة', telechargerContacts: 'جهات الاتصال (CSV)', whatsappAide: 'قائمة صغيرة: افتحوا واتساب لكل جهة اتصال. قائمة كبيرة: نزّلوا جهات الاتصال وأنشئوا قائمة بث في واتساب للأعمال.',
    journal: 'كل تصدير لجهات الاتصال يُسجَّل.',
  },
}

/* Libelles renommes : ecrases volontairement. */
const FORCE = {
  fr: { 'admin.role.centre_numerique': 'Programme national de santé numérique',
    'inst.bienvenue.centre_numerique': 'Programme national : statistiques du secteur et exports, diffusion de campagnes, référentiel des districts et formations, rôles et réglages.',
    'inst.bienvenue.ordre_medecins': 'Les médecins, infirmiers, sages-femmes et aides-soignants inscrits attendent votre décision ; le suivi déontologique montre leur activité en comptages. Chaque décision est journalisée.',
    'inst.bienvenue.ordre_pharmaciens': 'Les pharmacies et pharmaciens inscrits attendent votre décision ; le suivi déontologique montre leur activité en comptages. Chaque décision est journalisée.' },
  en: { 'admin.role.centre_numerique': 'National digital health programme',
    'inst.bienvenue.centre_numerique': 'National programme: sector statistics and exports, campaign broadcasts, district and facility referential, roles and settings.',
    'inst.bienvenue.ordre_medecins': 'Registered doctors, nurses, midwives and nursing assistants await your decision; professional-conduct follow-up shows their activity as counts. Every decision is logged.',
    'inst.bienvenue.ordre_pharmaciens': 'Registered pharmacies and pharmacists await your decision; professional-conduct follow-up shows their activity as counts. Every decision is logged.' },
  ar: { 'admin.role.centre_numerique': 'البرنامج الوطني للصحة الرقمية',
    'inst.bienvenue.centre_numerique': 'البرنامج الوطني: إحصاءات القطاع وتصديرها، نشر الحملات، مرجع المقاطعات والمرافق، الأدوار والإعدادات.',
    'inst.bienvenue.ordre_medecins': 'الأطباء والممرضون والقابلات ومساعدو التمريض المسجلون في انتظار قراركم؛ متابعة أخلاقيات المهنة تعرض نشاطهم بالأعداد. كل قرار يُسجَّل.',
    'inst.bienvenue.ordre_pharmaciens': 'الصيدليات والصيادلة المسجلون في انتظار قراركم؛ متابعة أخلاقيات المهنة تعرض نشاطهم بالأعداد. كل قرار يُسجَّل.' },
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
