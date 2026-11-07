# Afiya — عافية · Santé Tchad

*(anciennement « Allo Santé Tchad » ; renommée Afiya en novembre 2026, le
domaine afiyatchad.com n'a pas changé)*

**Trouver et contacter en moins de deux minutes un soignant, une pharmacie ou un
centre de santé proche, partout au Tchad. Suivre la vaccination de ses enfants.
Prévenir les autorités d'un événement sanitaire.**

Application web (PWA) pensée pour la 2G, les petits téléphones Android et les
personnes qui ne lisent pas, livrée aussi en application Android (dossier
`android/`). Gratuite, sans publicité, sans inscription pour les familles.
Français, anglais, arabe et arabe tchadien, avec message vocal partout où l'on
demande du texte.

**Moteurs (novembre 2026)** : Vite 8, Preact 11 (API React 19), Tailwind 4,
Supabase (PostgreSQL, RLS), Netlify. Aucune dépendance d'exécution hors Preact.

> ⚠️ **Cette plateforme ne remplace pas les services d'urgence officiels.**
> Elle met en relation. Elle ne donne aucun conseil médical, ne vend rien et ne
> gère aucun paiement.

---

## Mettre la plateforme en ligne — 15 minutes, sans savoir programmer

Vous aurez besoin de deux comptes gratuits : **Netlify** (l'hébergement) et
**Supabase** (la base de données). Aucune carte bancaire.

### Étape 1 — Publier le site (2 min)

Cliquez sur ce bouton, connectez-vous à Netlify, laissez tout par défaut :

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/VOTRE-COMPTE/allo-sante-tchad)

> Remplacez `VOTRE-COMPTE/allo-sante-tchad` dans le lien ci-dessus par l'adresse
> de **votre** dépôt GitHub, sinon le bouton pointera dans le vide.

Au bout de deux minutes, le site est en ligne. **Il fonctionne déjà** : sans base
de données, il démarre en *mode démonstration* (tout reste dans le téléphone).
C'est parfait pour montrer le produit ; passez à l'étape 2 pour le vrai service.

### Étape 2 — Créer la base de données (3 min)

1. Allez sur [supabase.com](https://supabase.com) → **New project**.
2. Nom : `allo-sante-tchad`. Mot de passe : choisissez-en un solide et **notez-le**.
3. Région : choisissez la plus proche (Francfort ou Londres pour l'Afrique centrale).
4. Attendez que le projet finisse de se créer.

### Étape 3 — Installer les tables et les données (4 min)

Dans Supabase, ouvrez **SQL Editor** → **New query**. Copiez-collez le contenu
de ces fichiers **l'un après l'autre**, en cliquant sur **Run** à chaque fois :

| Ordre | Fichier | Ce qu'il fait |
|---|---|---|
| 1 | `supabase/01_installation.sql` | Tables, sécurité, stockage des photos et vocaux |
| 2 | `supabase/02_donnees_geo.sql` | 23 provinces, 23 chefs-lieux, 164 quartiers, 69 services de secours, numéros d'urgence |
| 3 | `supabase/03_donnees_demo.sql` | *Facultatif* — 29 fiches de démonstration à N'Djamena, Moundou, Sarh et Abéché |
| 4 | `supabase/07_durcissement.sql` | Droits minimaux de la clé publique, limites de débit, fonctions fermées |
| 5 | `supabase/08_villes_departements.sql` | 39 chefs-lieux de département (62 villes) |
| 6 | `supabase/09_confirmation_email.sql` | Compte soignant confirmé par courriel |
| 7 | `supabase/10_quatre_fonctions.sql` | Donneurs de sang, relevés de prix, veille syndromique |
| 8 | `supabase/11_sante_referentiel.sql` | 126 districts sanitaires du ministère, liaison aux villes |
| 9 | `supabase/12a_roles_institutionnels.sql` puis `12_programmes_et_institutions.sql` | Rôles du ministère et des Ordres, publications, campagnes, entraide, signalements |
| 10 | `supabase/13_pilote_operationnel.sql` | Phase pilote : prolonge les inscriptions en cours |
| 11 | `supabase/14a_types_soignants.sql` **seul**, puis `14_gestion_et_statistiques.sql` | Espace de gestion : droits des Ordres et du programme national, démonstration isolée, statistiques (résumé, requête libre, suivi des soignants, contacts de diffusion), transcription vocale |
| 12 | `supabase/15_jeu_demonstration.sql` | *Facultatif, pour une présentation* — ~1 600 lignes fictives (61 soignants, 320 demandes, ordonnances, vaccinations, entraide…) isolées et effaçables en un clic |
| 13 | `supabase/16_comptes_de_gestion.sql` | Comptes de gestion par adresse e-mail (adresse sur le profil) ; la création se fait ensuite depuis l'écran Équipe |

Les autres fichiers du dossier servent plus tard : `04_effacer_demo.sql` (avant
la mise en service réelle), `05_creer_administrateur.sql` (étape 5 ci-dessous)
et **`06_verification.sql`**, qui ne modifie rien et affiche un tableau de
13 contrôles — lancez-le à la fin, tout doit afficher `OK`.

Puis, une seule fois : **Authentication → Providers → Email → décochez
« Confirm email »**. C'est indispensable : les soignants s'inscrivent avec leur
**numéro de téléphone**, pas avec une adresse e-mail.

### Étape 4 — Relier le site à la base (2 min)

Dans Supabase : **Project Settings → API**. Copiez les deux valeurs.
Dans Netlify : **Site configuration → Environment variables → Add a variable** :

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | l'URL du projet (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | la clé publique `anon` |
| `VITE_PLATFORM_WHATSAPP` | *facultatif* — votre numéro WhatsApp, ex. `23566000000` |
| `VITE_ADMIN_PATH` | *recommandé* — l'adresse secrète du back-office, ex. `gestion-tchad-2026` |
| `VITE_ADMIN_GATE_CODE` | *recommandé* — un mot de passe d'entrée du back-office |
| `SUPABASE_URL` | la même URL qu'en haut (pour les tâches automatiques) |
| `SUPABASE_ANON_KEY` | la même clé publique `anon` (pour les fonctions d'export et de voix) |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé secrète `service_role` — **ne la mettez jamais ailleurs** |
| `ANTHROPIC_API_KEY` | *facultatif* — clé de l'API Claude (console.anthropic.com, paiement à l'usage) : rédige le texte des rapports Word en français, anglais ou arabe et structure les messages vocaux. Sans elle, le rapport sort avec un texte composé à partir des chiffres. |
| `ANTHROPIC_MODEL` | *facultatif* — le modèle Claude à utiliser (sinon `claude-sonnet-4-5`, puis repli automatique) |
| `OPENAI_API_KEY` | *facultatif* — clé OpenAI (paiement à l'usage) pour la transcription des messages vocaux (Whisper, français et arabe). Sans elle, les vocaux restent à écouter. |

Puis **Deploys → Trigger deploy → Deploy site**.

### Étape 5 — Créer votre compte administrateur (2 min)

Ouvrez `supabase/05_creer_administrateur.sql` : il contient le mode d'emploi
détaillé (créer l'utilisateur, coller son identifiant, lancer une requête).
Ce premier compte est le **super-administrateur**. Tous les autres comptes de
gestion (programme national, Ordres, autorités, administrateurs de province
ou de ville) se créent ensuite **depuis le back-office, écran Équipe** : vous
saisissez l'adresse e-mail et le rôle ; la personne reçoit une invitation par
e-mail (ou un lien à lui transmettre, ou un mot de passe provisoire), ouvre
la page `#/acces`, choisit son mot de passe et se connecte avec son adresse.
Pour envoyer plus de quelques e-mails par heure, configurez un serveur SMTP
dans Supabase (Authentication → Emails → SMTP Settings) ; sans cela, le mode
« lien à transmettre » fonctionne toujours.

Puis lancez `supabase/06_verification.sql` : il vérifie en une requête que les
23 provinces sont chargées, que la sécurité est bien active, que le numéro des
patients est inaccessible depuis le navigateur, et que votre compte
administrateur existe. **Les lignes 1 à 11 doivent afficher `OK`.**

### Étape 6 — ⚠️ Vérifier les numéros d'urgence (à faire avant l'ouverture au public)

**C'est le point le plus important de toute l'installation.**

Aucun numéro d'urgence court tchadien n'a pu être confirmé par une source
officielle : les sources publiques se contredisent (17/18 selon les agrégateurs,
2020/1212 selon le Royaume-Uni, 2121/121 selon les États-Unis). La plateforme
les affiche donc dans une section **« Numéros à confirmer »**, séparée des
numéros vérifiés, et le tableau de bord administrateur affiche une alerte rouge
tant que vous n'avez pas validé la liste.

**À faire :** appeler chaque numéro depuis un téléphone tchadien, sur **Airtel
et sur Moov**, puis dans le back-office → **Numéros d'urgence** : garder ce qui
répond, supprimer le reste, marquer « vérifié ». Enfin, cochez *« Je confirme
avoir testé les numéros »*.

Les seuls numéros livrés comme **vérifiés** sont des établissements de santé
dont le numéro figure sur leur propre site : CHU de la Mère et de l'Enfant,
CHU La Renaissance, CHU Le Bon Samaritain, SOS International.

---

## Comment la plateforme fonctionne

### Le patient — trois écrans, aucun compte

1. **Qui a besoin d'aide** et **à quel point c'est urgent** (🔴 vitale · 🟠 urgent ·
   🟡 sous 24 h · 🟢 rendez-vous).
2. **Ce qui se passe** : icônes à cocher, puis description libre **écrite ou
   dictée** — le message vocal est enregistré dans n'importe quelle langue locale
   (arabe tchadien, sara, kanembou, gorane…), compressé à 12 kbit/s, 60 s maximum.
3. **Où** : la province et la ville sont **détectées automatiquement** dès
   l'ouverture — le patient n'a plus qu'à préciser son quartier et un repère
   écrit à la main (« derrière le marché »). Si la localisation est refusée ou
   indisponible, le choix province → ville → quartier reste là, et l'application
   ne bloque jamais.

> **Comment la détection se comporte.** Si le téléphone a déjà accordé la
> localisation, la zone se remplit toute seule, en silence, sans rien demander.
> Sinon un bouton « Détecter ma zone automatiquement » attend un geste : un
> écran d'urgence ne doit pas s'ouvrir sur une demande de permission. La ville
> retenue est le chef-lieu le plus proche ; au-delà de 60 km, elle est proposée
> avec une réserve (« vous êtes à environ 80 km de Mongo ») plutôt qu'affirmée.

Le patient reçoit un **code de suivi égal à son numéro de téléphone suivi de
deux lettres** (ex. `66112233AB`) et un lien partageable. Il n'a donc que deux
lettres à retenir — s'il n'a pas laissé de numéro, un code aléatoire de six
caractères est généré à la place. Il voit en direct : « 2 soignants ont vu votre demande »,
« Dr X. arrive vers vous ». Son numéro n'est **jamais** affiché publiquement :
seul le soignant qui accepte peut le voir.

### Les soignants — inscrits en deux minutes, actifs tout de suite

Un médecin, un infirmier, une sage-femme, une pharmacie ou un centre de santé
s'inscrit avec **son seul numéro de téléphone**. Pas de mot de passe à retenir,
pas d'adresse e-mail, pas de pièce à téléverser.

Il est **actif immédiatement** et apparaît dans l'annuaire avec le badge
**⏳ Déclaré — vérification en cours (J-45)**. Il reçoit les alertes de sa zone
et peut porter secours dès la première minute. L'administration dispose de
**45 jours** pour vérifier sa qualification et lui donner le badge **✔ Vérifié**.
Passé ce délai sans vérification, la fiche sort automatiquement de l'annuaire
public — mais le compte reste, et un administrateur peut prolonger de 45 jours.

Sur son tableau de bord, le soignant bascule **Disponible / Indisponible** et
répond à une alerte **en un seul geste** : « Je suis en route », « J'appelle »,
« Je contacte par WhatsApp », « Je ne peux pas », « Cas résolu ».

### Police, gendarmerie, pompiers — déjà dans les listes

Les **69 services de secours** des 23 chefs-lieux sont pré-créés (commissariat,
brigade de gendarmerie, sapeurs-pompiers), plus les hôpitaux de référence. Ceux
dont le numéro est inconnu apparaissent avec la mention **« Numéro à
compléter »** et remontent dans le back-office, pour être remplis au fil de l'eau.

### Les pharmacies — ordonnance par photo

Le patient photographie son ordonnance : elle est **compressée à ~100 Ko** dans
le téléphone avant tout envoi. Il choisit une pharmacie précise, ou diffuse à
**toutes les pharmacies en ligne de sa zone**. Chacune répond *disponible /
partiellement / non disponible*, avec un prix indicatif et la possibilité de
proposer une livraison moto-taxi. La plateforme met en relation : elle ne vend
pas de médicaments et ne touche jamais à l'argent.

### Le suivi — une plateforme vivante, pas un annuaire

Chaque demande a un cycle de vie visible : **Envoyée → Vue → Prise en charge →
Résolue** (ou *Sans réponse*). Une **urgence vitale sans réponse au bout de
15 minutes** (délai réglable) est automatiquement **escaladée** : rediffusée à
toute la ville, signalée en rouge au back-office, et le patient reçoit à l'écran
la liste des centres de santé à appeler directement.

### Le back-office — invisible du public, administrateurs et institutions

Administrateurs opérationnels :
- **Super administrateur** — national, distribue les rôles, règle la plateforme.
- **Administrateur de province** — ne voit que sa province.
- **Administrateur de ville** — ne voit que sa ville.

Institutions (novembre 2026), chacune avec ses seuls écrans :
- **Autorité nationale** (ministère) et **délégation provinciale** — veille en
  temps réel, signalements communautaires à trier, campagnes de vaccination,
  publications, validation des agents publics (infirmiers, sages-femmes,
  centres de santé).
- **Ordre des médecins** (médecins, infirmiers, sages-femmes, aides-soignants)
  et **Ordre des pharmaciens** (pharmacies, pharmaciens) — valident,
  prolongent, suspendent ou refusent les inscriptions de leur profession ;
  suivent l'activité de leurs inscrits en comptages (écran *Déontologie* :
  réponses, prises en charge, délai médian, signalements, signaux à
  regarder — jamais une demande ni un patient) ; publient des directives.
- **Programme national de santé numérique** — crée et corrige les districts
  sanitaires, les formations et le rattachement des villes ; lance des
  campagnes d'information (modèles bilingues dengue, paludisme, choléra,
  rougeole, méningite… envoyés par WhatsApp aux soignants inscrits et
  publiés dans l'application) ; lit toutes les statistiques ; attribue les
  rôles et règle la plateforme.

**Statistiques** (tous les comptes de gestion) : un résumé du secteur, douze
vues prêtes, une requête libre (données × mesure × une ou deux dimensions :
province, ville, district sanitaire, quartier, jour/semaine/mois, motif,
niveau d'urgence, statut, sexe, tranche d'âge, vaccin, dose…) dessinée en
barres, courbe, empilées, camembert ou tableau ; exports CSV, Excel et Word
avec un texte d'analyse rédigé en français, en anglais ou en arabe. Tout est
calculé dans la base, en comptages, borné au périmètre du compte. La
démonstration est exclue tant que l'interrupteur n'est pas enclenché, et un
bandeau le dit quand elle l'est.

Chaque décision passe par une fonction de la base qui vérifie le rôle de
l'appelant et l'inscrit au journal : l'écran n'est qu'une fenêtre.

Il valide les soignants, complète les quartiers et les numéros manquants, modère
les signalements et les photos, exporte les statistiques en CSV.

### Vaccination, entraide, signalement (novembre 2026)

- **Carnet de vaccination** (`#/vaccins`) : les enfants du téléphone, le
  calendrier du PEV tchadien (`src/data/vaccins.json`, à faire valider par la
  Direction de la vaccination), les doses faites, en retard, à venir, un
  rappel dans le calendrier du téléphone. Le carnet ne quitte jamais le
  téléphone ; la famille peut accepter de déclarer chaque dose de façon
  anonyme (ville, vaccin, âge) pour la veille nationale.
- **Centres de santé** (`#/annuaire?onglet=centres`) : la liste officielle du
  ministère (1 985 formations, 126 districts, GPS), le plus proche en premier,
  hors ligne compris. Source et corrections : `scripts/generer-sante.mjs`.
- **Entraide entre soignants** (espace soignant, onglet Entraide) : un agent
  isolé décrit une situation sans identifier le patient, les médecins
  répondent, la suite peut se faire sur WhatsApp. Un numéro de téléphone dans
  le texte est refusé par la base.
- **Signalement communautaire** (`#/alerte`) : plusieurs malades, décès
  inhabituels, animaux morts, eau suspecte. Trié par les autorités de la
  province dans le back-office.

**Aucun lien de l'application ne mène au back-office.** Il vit sur une adresse
que vous choisissez (`VITE_ADMIN_PATH`, par défaut `#/gestion`), protégée par une
**clé d'accès** facultative demandée *avant même* l'écran de connexion
(`VITE_ADMIN_GATE_CODE`). La page se marque `noindex` et `robots.txt` l'exclut
des moteurs de recherche.

---

## Accès sans mot de passe

Réglé par `VITE_INSCRIPTION_LIBRE` :

- **En démonstration** (aucune clé Supabase) : actif d'office. Un numéro suffit
  pour s'inscrire comme pour revenir, et les comptes de démonstration s'ouvrent
  d'un seul tap, sans rien saisir.
- **En production avec `VITE_INSCRIPTION_LIBRE=true`** : l'inscription reste au
  seul numéro, mais le compte reçoit une vraie clé tirée au hasard, gardée sur
  le téléphone et affichée une fois comme **code de récupération** — à noter,
  elle ne sert qu'en cas de changement d'appareil.
- **Par défaut en production** : mot de passe classique.

> Le compromis, dit franchement : en accès libre, quelqu'un qui connaît le
> numéro d'un soignant et se sert de son téléphone peut entrer dans son compte.
> C'est acceptable pour une phase pilote, où le vrai risque est de perdre la
> moitié des inscrits sur un formulaire trop long. Pour un déploiement large,
> revenez au mot de passe, ou activez la vérification par code OTP
> (`VITE_ENABLE_PHONE_OTP`, qui nécessite un fournisseur SMS payant).

## Mode démonstration

Sans clés Supabase, l'application tourne **entièrement dans le navigateur** :
utile pour la montrer sur le terrain sans réseau, ou pour se former.

Les écrans de connexion affichent des boutons **« Entrer directement comme… »** :
un tap suffit, il n'y a rien à saisir. Les numéros restent utilisables à la main :

| Rôle | Numéro | Mot de passe |
|---|---|---|
| Administrateur national | `66000000` | aucun (ou `demo1234`) |
| Administrateur de ville (N'Djamena) | `66000002` | aucun |
| Soignant | `66000001` | aucun |
| Pharmacie | `66000003` | aucun |

Les fiches de démonstration portent le badge **🧪 DÉMO** et leurs boutons
d'appel **n'ouvrent jamais un appel** : ils affichent un avertissement. Aucun
numéro fictif ne peut être composé par erreur.

`npm run build:demo` fabrique en plus `dist-demo/allo-sante-demo.html` :
**l'application entière dans un seul fichier**, qui s'ouvre sans serveur et sans
connexion (clé USB, pièce jointe, partage WhatsApp).

---

## Ce qui a été fait pour le bas débit

- **Page d'accueil ≈ 60 Ko compressés**, tout compris. `npm run check:size` le
  vérifie et échoue si le budget de 100 Ko est dépassé.
- **Zéro dépendance en dehors de React.** Le SDK Supabase (≈ 40 Ko compressés)
  a été remplacé par des appels HTTP directs (~8 Ko). Aucune police web, aucun
  CDN, aucun traceur, aucune image décorative.
- **Chaque page est chargée à la demande** ; l'annuaire de la ville choisie est
  gardé en mémoire.
- **Service worker** : la deuxième ouverture est quasi instantanée, et
  l'interface reste consultable hors ligne.
- **Mode économie de données** détecté automatiquement (2G ou « économiseur de
  données » activé) : carte et images désactivées, réactivables d'un geste.
- **Temps réel par interrogation adaptative** — 10 s écran allumé, 20 s en 2G,
  60 s en arrière-plan, rien du tout hors ligne. Sur les réseaux mobiles
  tchadiens, c'est plus fiable qu'un websocket qui tombe en silence.
- **Photos compressées dans le téléphone** avant tout envoi ; **vocaux à
  12 kbit/s**, 60 s maximum.
- Testé sur un écran de **360 px**, cibles tactiles de 48 px minimum, fort
  contraste pour la lecture en plein soleil.

### Preact (fait en novembre 2026)

Le socle est passé de 45 Ko à 8 Ko compressés en remplaçant React par
**Preact** (`vite.config.js`, alias `react` → `preact/compat`). L'API reste
celle de React 19 : rien n'a changé dans les composants.

---

## Les données du Tchad : ce qui est fiable, ce qui ne l'est pas

L'honnêteté sur ce point fait partie du produit — une adresse ou un numéro faux
dans une application d'urgence est pire que rien.

| Donnée | Fiabilité | Source |
|---|---|---|
| **23 provinces et leurs chefs-lieux** | ✅ Élevée | Ordonnance n°001/PR/2024 (23 provinces, 120 départements) |
| **Coordonnées GPS des 23 chefs-lieux** | ✅ Élevée | Deux sources croisées, écart < 3 km |
| **9ᵉ et 10ᵉ arrondissements de N'Djamena** | ✅ Élevée | Publiés par les communes elles-mêmes |
| **Autres arrondissements de N'Djamena** | ⚠️ Moyenne | Décrets 2009/2019 — les communes du 1ᵉʳ et du 10ᵉ ont depuis démenti les listes en ligne |
| **Quartiers de Sarh** | ⚠️ Moyenne | Étude Banque mondiale ; rattachement aux arrondissements inconnu |
| **Quartiers de Moundou** | ⚠️ Moyenne | Découpage à 4 arrondissements probablement périmé |
| **Doba, Koumra, Moussoro, Faya, Am Timan, Abéché** | 🔸 Faible | OpenStreetMap, listes très incomplètes (5 noms pour Abéché qui en compte 57) |
| **13 autres chefs-lieux** | ❌ Aucune donnée | Aucun quartier attesté publiquement |
| **Numéros d'urgence courts** | ❌ Contradictoires | Voir l'étape 6 ci-dessus |

Chaque quartier porte en base un champ `qualite` (`officiel` / `presse` / `wiki` /
`osm` / `local`) visible dans le back-office, et l'écran **Géographie** liste les
villes à compléter. Les patients peuvent **proposer un quartier manquant** :
la proposition arrive dans la file de validation de l'administrateur.

---

## Structure du dépôt

```
src/
  pages/            écrans (accueil, urgence, suivi, annuaire, pharmacie, pro/, admin/)
  components/       briques d'interface, sélecteur de zone, vocal, photo
  lib/              routeur, i18n, accès aux données, liens WhatsApp, médias, réseau
  i18n/             fr, en, ar, ar-td (1 012 clés, parité fr/en/ar vérifiée)
  data/             geo.json (23 provinces), urgences.json, demo.json,
                    sante.json (1 985 formations sanitaires), vaccins.json (calendrier PEV)
supabase/           SQL à coller dans l'ordre (01 à 16, voir le tableau plus haut)
netlify/functions/  escalade des urgences (5 min), purge des médias (nuit),
                    export Excel/Word (/api/export), transcription vocale (/api/voix + toutes les 10 min),
                    comptes de gestion par e-mail (/api/comptes) ;
                    lib/ : zip, xlsx, docx écrits à la main (aucune dépendance), appel à Claude
netlify/edge-functions/  référentiel géographique servi par le CDN
android/            configuration de l'application Android (Trusted Web Activity)
scripts/            SQL géographique, référentiel sanitaire, icônes, textes, poids, build fichier unique
```

Modifier la géographie : éditez `src/data/geo.json`, puis `npm run geo:sql`
régénère `supabase/02_donnees_geo.sql`.

## Commandes

```bash
npm install
npm run dev          # développement (http://localhost:5173)
npm run build        # site de production dans dist/
npm run check:size   # vérifie le budget bas débit de la page d'accueil
npm run build:demo   # application entière dans un seul fichier HTML
npm run geo:sql      # régénère le SQL géographique depuis geo.json
node scripts/generer-sante.mjs fichier.xlsx   # régénère sante.json et 11_sante_referentiel.sql
```

## Vie privée et sécurité

- **Le numéro du patient n'est délivré qu'après un engagement réel** (« je suis
  en route », « j'appelle », « je contacte par WhatsApp »). Ce n'est pas une
  règle d'interface que l'on pourrait contourner : le droit de lecture sur les
  colonnes `contact_tel` et `contact_whatsapp` est **retiré à tout le monde dans
  PostgreSQL**, et le numéro n'est rendu que par une fonction qui vérifie
  l'engagement du soignant. Un `select *` sur la table est refusé par la base.
- Le code de suivi est le numéro du patient suivi de deux lettres. C'est
  mémorable, mais cela signifie que quelqu'un qui connaît déjà ce numéro n'a que
  441 combinaisons à essayer. La base compte donc les échecs : **au-delà de 12
  tentatives ratées sur un même numéro dans l'heure, toute recherche portant sur
  ce numéro est refusée**. Un balayage automatique est arrêté net ; un patient
  qui se trompe une ou deux fois n'est jamais gêné. Contrepartie assumée : un
  attaquant peut aussi bloquer l'accès d'un patient pour le reste de l'heure.
  Pour renforcer, passer à trois lettres (9 261 combinaisons) suffit — une seule
  ligne dans `01_installation.sql`.
- Photos d'ordonnance et messages vocaux : **stockage privé**, lisibles seulement
  par les destinataires et les modérateurs, **supprimés automatiquement après
  30 jours** (réglable) par une tâche planifiée.
- Consentement explicite obligatoire avant chaque envoi.
- La sécurité est appliquée **dans la base** (RLS PostgreSQL), pas seulement dans
  l'interface : 35 politiques, et des déclencheurs qui empêchent quiconque de se
  promouvoir administrateur ou de s'auto-vérifier.
- Un administrateur de ville ne voit et ne modifie **que** sa ville ; un
  administrateur de province, que sa province. C'est vérifié dans la base, et
  une action hors périmètre affiche un message d'erreur au lieu de faire croire
  qu'elle a réussi.
- Les fonctions de maintenance (purge des médias, escalade) sont fermées au
  public et réservées aux tâches planifiées.

### Comment tout cela a été vérifié

Le schéma complet a été installé et éprouvé sur une vraie base PostgreSQL 16
reproduisant l'environnement Supabase : 23 contrôles de sécurité y sont passés —
un patient anonyme peut déposer une demande mais pas en lire une seule ; le
suivi par code fonctionne sans compte et n'expose aucun numéro ; un soignant ne
voit que sa ville ; il n'obtient le numéro du patient qu'après s'être engagé ;
il ne peut ni se vérifier lui-même ni se promouvoir administrateur ; un
administrateur de province ne peut pas toucher aux fiches d'une autre province ;
les scripts d'installation peuvent être relancés sans créer de doublons.
Le parcours complet (patient → soignant → retour patient), en français et en
arabe, a été rejoué dans un navigateur sur un écran de 360 px : 28 vérifications,
zéro erreur console.

## Phase 2 — prévue, non bloquante

Les points d'accroche sont déjà dans le code : bot WhatsApp Business et bot
Telegram conversationnels (les demandes créées par bot entrent dans la même
base), alertes SMS aux soignants sans smartphone, sous-préfectures et petits
centres urbains (l'administrateur peut déjà créer une ville), tableau public de
transparence (déjà présent, activable), temps réel par websocket.

## Licence

MIT. Utilisez, modifiez et déployez librement — en gardant l'avertissement
« cette plateforme ne remplace pas les services d'urgence officiels ».
