# Sources et fiabilité des données tchadiennes

Ce document justifie chaque donnée pré-chargée dans la plateforme et signale ce
qui **doit être vérifié localement** avant l'ouverture au public. Il a été
constitué par recherche croisée de sources publiques en août 2026.

Règle appliquée partout dans le produit : **une donnée incertaine est affichée
comme incertaine, jamais présentée comme sûre.** Dans une application d'urgence,
un numéro faux est plus dangereux qu'un écran vide.

---

## 1. Numéros d'urgence — aucun numéro court confirmé

Quatre sources de référence donnent **quatre jeux de numéros incompatibles**, et
aucune ne cite un texte réglementaire tchadien.

| Numéro | Service annoncé | Source | Confiance |
|---|---|---|---|
| 17 | Police | Agrégateurs internationaux, Wikipédia | Moyenne |
| 18 | Sapeurs-pompiers | Idem + site de la commune du 1ᵉʳ arrondissement de N'Djamena | Moyenne |
| 117 | Police | Commune du 1ᵉʳ arrondissement | Faible (contredit le 17) |
| 2020 | Police (numéro vert) | Annonce de 2015 reprise par le FCDO britannique | Moyenne, mais ancienne |
| 1212 | Pompiers + ambulance | FCDO britannique | Faible |
| 2121 / 121 | Secours médical | Département d'État américain | Faible |
| 1313 | Numéro vert santé (Ministère de la Santé) | Créé en mars 2020 pour la COVID-19 | Activité actuelle non confirmée |

**Conséquence dans le produit :** ces numéros sont livrés avec `verifie = false`,
regroupés sous « Numéros à confirmer », séparés visuellement des numéros
vérifiés, et le tableau de bord administrateur affiche une alerte rouge tant que
la liste n'a pas été validée localement.

### Numéros livrés comme vérifiés

Uniquement des établissements dont le numéro figure sur leur **propre site** ou
sur une source d'État :

| Établissement | Numéro | Source |
|---|---|---|
| CHU de la Mère et de l'Enfant (urgences 24/7) | +235 63 07 77 60 | Site officiel de l'établissement |
| CHU La Renaissance (urgences) | +235 66 97 22 60 · +235 22 53 20 90 | Site officiel + France Diplomatie |
| CHU Le Bon Samaritain | +235 66 36 66 44 | Site officiel |
| SOS International (assistance 24h/24) | +235 22 52 25 01 | France Diplomatie |

**À faire avant l'ouverture :** appeler chaque numéro depuis un téléphone
tchadien, sur **Airtel et sur Moov**, noter ce qui décroche, et ne garder que
cela. Le back-office permet de modifier, désactiver ou ajouter chaque entrée.

---

## 2. Découpage administratif — 23 provinces, confirmé

Le Tchad compte **toujours 23 provinces** en 2026. La réforme la plus récente
(**ordonnance n°001/PR/2024 du 4 juillet 2024**) n'a touché que les départements
(95 → 120) et les sous-préfectures (422 → 454). Les 23 couples
province / chef-lieu pré-chargés sont conformes aux sources consultées.

*Réserve :* le texte de l'ordonnance lui-même n'a pas pu être ouvert ; la
correspondance province → chef-lieu repose sur des sources encyclopédiques et de
presse concordantes.

Les **coordonnées GPS** des 23 chefs-lieux sont croisées entre deux sources
indépendantes, avec un écart maximal inférieur à 3 km.

---

## 3. Quartiers — qualité très inégale

Chaque quartier porte en base un champ `qualite`, visible dans le back-office :

| Valeur | Signification |
|---|---|
| `officiel` | Publié par la commune ou par décret |
| `presse` | Article de presse ou étude institutionnelle |
| `wiki` | Encyclopédie collaborative |
| `osm` | OpenStreetMap (contributif) |
| `local` | Saisi par l'administration de la plateforme |
| `suggere` | Proposé par un patient, en attente de validation |

### N'Djamena — 10 arrondissements

- **9ᵉ et 10ᵉ arrondissements** : listes publiées par les communes elles-mêmes
  (8 et 21 quartiers). Fiabilité élevée.
- **Autres arrondissements** : décrets de 2009 et 2019. **Ces listes sont
  périmées** — la commune du 1ᵉʳ arrondissement annonce aujourd'hui 29 quartiers
  (contre 14 en ligne), et celle du 10ᵉ a publiquement corrigé la sienne en
  janvier 2026. Deux points restent non tranchés : le troisième quartier du 5ᵉ
  arrondissement (« Champ de Fils » ou « Karkandjié » selon les sources) et le
  nombre de quartiers du 4ᵉ (4 ou 5).

**Recommandation :** contacter la Mairie de N'Djamena et les dix communes
d'arrondissement pour obtenir la liste consolidée, puis la saisir dans le
back-office.

### Autres chefs-lieux

| Ville | Quartiers pré-chargés | Fiabilité |
|---|---|---|
| Sarh | 27 | Moyenne — noms issus d'une étude Banque mondiale, rattachement aux 6 arrondissements inconnu |
| Moundou | 20 | Moyenne — découpage à 4 arrondissements probablement périmé (un 6ᵉ est évoqué en 2025) |
| Abéché | 5 | Faible — la ville compte **57 quartiers** ; 52 ne sont pas documentés |
| Doba, Koumra, Moussoro, Faya-Largeau, Am Timan | 4 à 5 chacun | Faible — OpenStreetMap, listes manifestement incomplètes |
| **13 autres chefs-lieux** | **aucun** | Aucun quartier attesté publiquement |

Les 13 villes concernées : Ati, Massenya, Am-Djarass, Fada, Mongo, Massaguet,
Mao, Bol, Bongor, Pala, Goz Beïda, Laï, Bardaï, Biltine.

**Ce n'est pas bloquant** : pour ces villes, l'application affiche directement un
champ libre « décrivez votre quartier », et le repère écrit à la main
(« derrière le marché », « à côté de la mosquée centrale ») reste de toute façon
l'information la plus utile au soignant. L'écran **Géographie** du back-office
liste ces villes pour qu'un correspondant local les complète.

---

## 4. Hôpitaux de référence

Noms confirmés, numéros rarement disponibles :

| Ville | Établissement | Numéro |
|---|---|---|
| N'Djamena | Hôpital Général de Référence Nationale (HGRN) | +235 22 51 43 61 — annuaire privé, **à confirmer** |
| N'Djamena | Hôpital de l'Amitié Tchad-Chine | non trouvé |
| Moundou | Hôpital Provincial de Moundou | non trouvé |
| Sarh | Hôpital Provincial de Sarh | non trouvé |
| Abéché | CHU d'Abéché | non trouvé |

---

## 5. Services de secours pré-créés

Pour chacun des 23 chefs-lieux, trois fiches sont créées d'office : commissariat
de police, brigade de gendarmerie, sapeurs-pompiers — soit **69 fiches**. Un seul
numéro a été trouvé publiquement (sapeurs-pompiers de N'Djamena,
+235 22 52 25 55, annoncé par la Mairie en 2021), et il est marqué **à
confirmer**.

Les 68 autres apparaissent dans l'annuaire avec la mention **« Numéro à
compléter »** et remontent dans le compteur *Services sans numéro* du tableau de
bord, pour être remplis au fil des contacts avec les autorités locales.
