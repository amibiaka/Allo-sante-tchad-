# Allo Santé Tchad — ألو صحة تشاد

**Trouver et contacter en moins de deux minutes un soignant, une pharmacie ou un
centre de santé proche, partout au Tchad.**

Application web (PWA) pensée pour la 2G, les petits téléphones Android et les
personnes qui ne lisent pas. Gratuite, sans publicité, sans inscription pour le
patient. Français et arabe, avec message vocal partout où l'on demande du texte.

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
| `SUPABASE_SERVICE_ROLE_KEY` | la clé secrète `service_role` — **ne la mettez jamais ailleurs** |

Puis **Deploys → Trigger deploy → Deploy site**.

### Étape 5 — Créer votre compte administrateur (2 min)

Ouvrez `supabase/05_creer_administrateur.sql` : il contient le mode d'emploi
détaillé (créer l'utilisateur, coller son identifiant, lancer une requête).

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

### Le back-office — invisible du public, à trois niveaux

- **Super administrateur** — national, distribue les rôles, règle la plateforme.
- **Administrateur de province** — ne voit que sa province.
- **Administrateur de ville** — ne voit que sa ville.

Il valide les soignants, complète les quartiers et les numéros manquants, modère
les signalements et les photos, exporte les statistiques en CSV.

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

### Encore plus léger (facultatif)

Remplacer React par **Preact** fait tomber le socle de ~45 Ko à ~5 Ko compressés.
Six lignes sont prêtes, commentées, dans `vite.config.js` : `npm i preact`, on
les décommente, et c'est tout.

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
  i18n/             fr.json et ar.json (421 clés, parité vérifiée)
  data/             geo.json (23 provinces), urgences.json, demo.json
supabase/           SQL à coller dans l'ordre : installation, données, démo,
                    effacement de la démo, administrateur, vérification
netlify/functions/  escalade des urgences (5 min) et purge des médias (nuit)
scripts/            génération du SQL géographique, contrôle de poids, build fichier unique
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
