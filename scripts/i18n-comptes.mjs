/* Textes des comptes de gestion par e-mail (novembre 2026). Idempotent. */
import { readFileSync, writeFileSync } from 'node:fs'

const FR = {
  admin: { identifiant: 'Téléphone ou adresse e-mail', identifiantAide: 'Numéro à 8 chiffres pour les comptes ouverts par téléphone, adresse e-mail pour les comptes de gestion.' },
  equipe: {
    intro: "Créez ici les comptes du programme national, des Ordres et des autorités : vous saisissez l'adresse e-mail et le rôle, la personne reçoit une invitation (ou un lien, ou un mot de passe provisoire) et choisit son mot de passe. Chaque création est journalisée.",
    inviter: 'Créer un compte de gestion', aucun: 'Aucun compte de gestion', desactive: 'désactivé', invitationEnAttente: 'invitation en attente', derniereConnexion: 'connecté',
    email: 'Adresse e-mail', nom: 'Nom et prénom', role: 'Rôle', mode: "Remise de l'accès",
    modes: { invitation: "Invitation par e-mail (Supabase l'envoie)", lien: "Lien d'accès à transmettre moi-même", mot_de_passe: 'Mot de passe provisoire' },
    modeAide: { invitation: "La personne reçoit un e-mail « Vous avez été invité » et choisit son mot de passe. Si l'envoi échoue, un lien vous est donné à la place.",
      lien: "Un lien valable une fois, à envoyer par votre propre messagerie ou WhatsApp. La personne choisit son mot de passe en l'ouvrant.",
      mot_de_passe: "Un mot de passe provisoire, affiché une seule fois : transmettez-le par un canal sûr, la personne pourra le changer." },
    creerCompte: 'Créer le compte et remettre l\'accès', journal: "L'adresse et le rôle sont enregistrés ; la création est inscrite au journal à votre nom.",
    compteCree: 'Compte créé pour {email} avec le rôle « {role} ».', compteMisAJour: 'Compte {email} : rôle « {role} » attribué.',
    motDePasseProvisoire: 'Mot de passe provisoire (affiché une seule fois)', motDePasseNote: 'Transmettez-le par un canal sûr. La personne se connecte avec son adresse e-mail et ce mot de passe, puis peut le changer.',
    lienAcces: "Lien d'accès (valable une fois)", lienNote: 'Envoyez-le à la personne : il ouvre une page où elle choisit son mot de passe.', envoiEchoue: "L'e-mail n'a pas pu partir (SMTP du projet absent ou limite atteinte) : voici le lien à transmettre vous-même.",
    messageLien: 'Bonjour, voici votre accès à Afiya (espace de gestion). Ouvrez ce lien et choisissez votre mot de passe : {lien}',
    invitationEnvoyee: 'Invitation envoyée à {email}.', autreCompte: 'Créer un autre compte',
    cleAdminRappel: "Rappel : le back-office demande aussi la clé d'accès du site (VITE_ADMIN_GATE_CODE). Communiquez-la à la personne séparément.",
    renvoyerAcces: "Renvoyer un accès", envoyer: 'Envoyer',
  },
  acces: {
    titre: 'Votre accès Afiya', lienInvalide: "Ce lien d'accès n'est plus valable. Demandez un nouveau lien à l'administrateur.", bonjour: 'Bonjour {nom},',
    roleAttribue: 'Votre compte a le rôle', motDePasse: 'Choisissez un mot de passe', motDePasseAide: '8 caractères au moins.', confirmer: 'Confirmez le mot de passe',
    tropCourt: 'Huit caractères au moins.', differents: 'Les deux mots de passe diffèrent.', enregistrer: 'Enregistrer le mot de passe',
    faitTitre: 'Mot de passe enregistré', faitTexte: 'Vous pouvez maintenant vous connecter avec votre adresse e-mail et ce mot de passe.',
    ouvrirGestion: "Ouvrir l'espace de gestion", ouvrirPro: "Ouvrir l'espace soignant", cleAdminNote: "L'espace de gestion demande aussi la clé d'accès du site, que l'administrateur vous communique.",
  },
}
const EN = {
  admin: { identifiant: 'Phone or e-mail address', identifiantAide: '8-digit number for accounts opened by phone, e-mail address for management accounts.' },
  equipe: {
    intro: 'Create here the accounts of the national programme, the Orders and the authorities: enter the e-mail address and the role, the person receives an invitation (or a link, or a temporary password) and chooses a password. Every creation is logged.',
    inviter: 'Create a management account', aucun: 'No management account', desactive: 'disabled', invitationEnAttente: 'invitation pending', derniereConnexion: 'signed in',
    email: 'E-mail address', nom: 'Full name', role: 'Role', mode: 'Access delivery',
    modes: { invitation: 'E-mail invitation (sent by Supabase)', lien: 'Access link I send myself', mot_de_passe: 'Temporary password' },
    modeAide: { invitation: 'The person receives a "You have been invited" e-mail and chooses a password. If sending fails, you get a link instead.',
      lien: 'A one-time link to send through your own e-mail or WhatsApp. The person chooses a password when opening it.',
      mot_de_passe: 'A temporary password, shown once: pass it on through a safe channel; the person can change it.' },
    creerCompte: 'Create the account and deliver access', journal: 'The address and role are saved; the creation is logged under your name.',
    compteCree: 'Account created for {email} with the role "{role}".', compteMisAJour: 'Account {email}: role "{role}" assigned.',
    motDePasseProvisoire: 'Temporary password (shown once)', motDePasseNote: 'Pass it on through a safe channel. The person signs in with their e-mail address and this password, then can change it.',
    lienAcces: 'Access link (one-time)', lienNote: 'Send it to the person: it opens a page where they choose a password.', envoiEchoue: 'The e-mail could not be sent (no project SMTP or limit reached): here is the link to send yourself.',
    messageLien: 'Hello, here is your access to Afiya (management space). Open this link and choose your password: {lien}',
    invitationEnvoyee: 'Invitation sent to {email}.', autreCompte: 'Create another account',
    cleAdminRappel: 'Reminder: the back office also asks for the site access key (VITE_ADMIN_GATE_CODE). Give it to the person separately.',
    renvoyerAcces: 'Resend access', envoyer: 'Send',
  },
  acces: {
    titre: 'Your Afiya access', lienInvalide: 'This access link is no longer valid. Ask the administrator for a new one.', bonjour: 'Hello {nom},',
    roleAttribue: 'Your account has the role', motDePasse: 'Choose a password', motDePasseAide: 'At least 8 characters.', confirmer: 'Confirm the password',
    tropCourt: 'At least eight characters.', differents: 'The two passwords differ.', enregistrer: 'Save the password',
    faitTitre: 'Password saved', faitTexte: 'You can now sign in with your e-mail address and this password.',
    ouvrirGestion: 'Open the management space', ouvrirPro: 'Open the health-worker space', cleAdminNote: 'The management space also asks for the site access key, which the administrator gives you.',
  },
}
const AR = {
  admin: { identifiant: 'الهاتف أو البريد الإلكتروني', identifiantAide: 'رقم من 8 أرقام للحسابات المفتوحة بالهاتف، وبريد إلكتروني لحسابات الإدارة.' },
  equipe: {
    intro: 'أنشئوا هنا حسابات البرنامج الوطني والنقابات والسلطات: تدخلون البريد الإلكتروني والدور، فيتلقى الشخص دعوة (أو رابطاً أو كلمة مرور مؤقتة) ويختار كلمة مروره. كل إنشاء يُسجَّل.',
    inviter: 'إنشاء حساب إدارة', aucun: 'لا حسابات إدارة', desactive: 'معطَّل', invitationEnAttente: 'دعوة معلّقة', derniereConnexion: 'آخر دخول',
    email: 'البريد الإلكتروني', nom: 'الاسم الكامل', role: 'الدور', mode: 'طريقة تسليم الدخول',
    modes: { invitation: 'دعوة بالبريد الإلكتروني (يرسلها Supabase)', lien: 'رابط دخول أرسله بنفسي', mot_de_passe: 'كلمة مرور مؤقتة' },
    modeAide: { invitation: 'يتلقى الشخص رسالة «تمت دعوتك» ويختار كلمة مروره. إذا فشل الإرسال تحصلون على رابط بدلاً منها.',
      lien: 'رابط يُستعمل مرة واحدة، ترسلونه عبر بريدكم أو واتساب. يختار الشخص كلمة مروره عند فتحه.',
      mot_de_passe: 'كلمة مرور مؤقتة تُعرض مرة واحدة: سلّموها عبر قناة آمنة، ويمكن للشخص تغييرها.' },
    creerCompte: 'إنشاء الحساب وتسليم الدخول', journal: 'يُحفظ العنوان والدور؛ ويُسجَّل الإنشاء باسمكم.',
    compteCree: 'تم إنشاء حساب لـ {email} بدور «{role}».', compteMisAJour: 'الحساب {email}: تم إسناد الدور «{role}».',
    motDePasseProvisoire: 'كلمة مرور مؤقتة (تُعرض مرة واحدة)', motDePasseNote: 'سلّموها عبر قناة آمنة. يدخل الشخص ببريده الإلكتروني وهذه الكلمة، ثم يمكنه تغييرها.',
    lienAcces: 'رابط الدخول (لمرة واحدة)', lienNote: 'أرسلوه إلى الشخص: يفتح صفحة يختار فيها كلمة مروره.', envoiEchoue: 'تعذّر إرسال البريد (لا SMTP للمشروع أو بلوغ الحد): هذا هو الرابط لإرساله بأنفسكم.',
    messageLien: 'مرحباً، هذا هو دخولكم إلى عافية (فضاء الإدارة). افتحوا هذا الرابط واختاروا كلمة المرور: {lien}',
    invitationEnvoyee: 'أُرسلت الدعوة إلى {email}.', autreCompte: 'إنشاء حساب آخر',
    cleAdminRappel: 'تذكير: يطلب المكتب الخلفي أيضاً مفتاح الدخول إلى الموقع (VITE_ADMIN_GATE_CODE). سلّموه للشخص على حدة.',
    renvoyerAcces: 'إعادة إرسال الدخول', envoyer: 'إرسال',
  },
  acces: {
    titre: 'دخولكم إلى عافية', lienInvalide: 'لم يعد رابط الدخول هذا صالحاً. اطلبوا رابطاً جديداً من المسؤول.', bonjour: 'مرحباً {nom}،',
    roleAttribue: 'لحسابكم الدور', motDePasse: 'اختاروا كلمة مرور', motDePasseAide: '8 أحرف على الأقل.', confirmer: 'تأكيد كلمة المرور',
    tropCourt: 'ثمانية أحرف على الأقل.', differents: 'كلمتا المرور مختلفتان.', enregistrer: 'حفظ كلمة المرور',
    faitTitre: 'تم حفظ كلمة المرور', faitTexte: 'يمكنكم الآن الدخول ببريدكم الإلكتروني وهذه الكلمة.',
    ouvrirGestion: 'فتح فضاء الإدارة', ouvrirPro: 'فتح فضاء المهنيين', cleAdminNote: 'يطلب فضاء الإدارة أيضاً مفتاح الدخول إلى الموقع، الذي يسلّمه لكم المسؤول.',
  },
}
const FORCE = {
  fr: { 'admin.creationCompteSupabase': "Les comptes de gestion sont créés par le super-administrateur (écran Équipe) ; le programme national attribue les rôles aux comptes existants." },
  en: { 'admin.creationCompteSupabase': 'Management accounts are created by the super administrator (Team screen); the national programme assigns roles to existing accounts.' },
  ar: { 'admin.creationCompteSupabase': 'يُنشئ المسؤول الأعلى حسابات الإدارة (شاشة الفريق)؛ ويُسند البرنامج الوطني الأدوار للحسابات الموجودة.' },
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
