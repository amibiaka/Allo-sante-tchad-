/* =====================================================================
 * Genere supabase/02_donnees_geo.sql a partir de src/data/geo.json et
 * src/data/urgences.json.
 *   node scripts/generate-geo-sql.mjs
 * Le fichier produit est idempotent (on conflict do nothing/update).
 * ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const geo = JSON.parse(readFileSync(join(racine, 'src/data/geo.json'), 'utf8'))
const urg = JSON.parse(readFileSync(join(racine, 'src/data/urgences.json'), 'utf8'))

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'null' : String(v))
const b = (v) => (v ? 'true' : 'false')

const L = []
L.push(`-- =====================================================================
--  ALLO SANTE TCHAD — donnees geographiques et services de secours
--  GENERE AUTOMATIQUEMENT par scripts/generate-geo-sql.mjs — ne pas
--  modifier a la main : editez src/data/geo.json puis relancez
--  \`npm run geo:sql\`.
--  A coller dans Supabase > SQL Editor apres 01_installation.sql.
--  Version des donnees : ${geo.version}
-- =====================================================================
`)

// --- Provinces --------------------------------------------------------
L.push('-- 1. Les 23 provinces ------------------------------------------------')
L.push('insert into provinces (code, nom_fr, nom_ar, ordre) values')
L.push(geo.provinces.map((p, i) => `  (${q(p.code)}, ${q(p.fr)}, ${q(p.ar)}, ${i * 10})`).join(',\n') +
  `\non conflict (code) do update set nom_fr = excluded.nom_fr, nom_ar = excluded.nom_ar;\n`)

// --- Villes -----------------------------------------------------------
L.push('-- 2. Chefs-lieux -----------------------------------------------------')
const villes = []
for (const p of geo.provinces) for (const c of p.cities) villes.push({ ...c, prov: p.code })
L.push('insert into villes (province_id, code, nom_fr, nom_ar, chef_lieu, lat, lng) values')
L.push(villes.map((c) =>
  `  ((select id from provinces where code = ${q(c.prov)}), ${q(c.code)}, ${q(c.fr)}, ${q(c.ar)}, ${b(c.cl)}, ${n(c.lat)}, ${n(c.lng)})`
).join(',\n') + `\non conflict (code) do update set nom_fr = excluded.nom_fr, nom_ar = excluded.nom_ar, lat = excluded.lat, lng = excluded.lng;\n`)

// --- Quartiers --------------------------------------------------------
L.push('-- 3. Quartiers (le champ qualite indique la fiabilite de la source) ---')
const quartiers = []
for (const c of villes) for (const d of c.districts || []) quartiers.push({ ...d, ville: c.code })
if (quartiers.length) {
  const paquets = []
  for (let i = 0; i < quartiers.length; i += 60) paquets.push(quartiers.slice(i, i + 60))
  for (const paquet of paquets) {
    L.push('insert into quartiers (ville_id, nom_fr, nom_ar, groupe, qualite, approuve) values')
    L.push(paquet.map((d) =>
      `  ((select id from villes where code = ${q(d.ville)}), ${q(d.fr)}, ${q(d.ar || null)}, ${n(d.g)}, ${q(d.q || 'local')}, true)`
    ).join(',\n') + '\non conflict (ville_id, nom_fr) do nothing;\n')
  }
}

// --- Services de secours ---------------------------------------------
L.push(`-- 4. Services de secours pre-crees pour chaque chef-lieu -------------
--    Ils sont visibles immediatement. Ceux dont le numero est inconnu
--    apparaissent avec la mention "numero a completer" et remontent dans
--    le back-office (Admin > Secours > numeros manquants).`)
const SERVICES = [
  { type: 'police',      prefixe: 'Commissariat de police' },
  { type: 'gendarmerie', prefixe: 'Brigade de gendarmerie' },
  { type: 'pompiers',    prefixe: 'Sapeurs-pompiers' },
]
// Seul numero de service trouve publiquement (presse citant la Mairie, 2021).
const NUMEROS_CONNUS = { 'NDJ-NDJ|pompiers': { tel: '+23522522555', confirme: false } }

const lignes = []
for (const c of villes) {
  for (const s of SERVICES) {
    const cle = `${c.code}|${s.type}`
    const info = NUMEROS_CONNUS[cle]
    lignes.push(`  ((select id from provinces where code = ${q(c.prov)}),
   (select id from villes where code = ${q(c.code)}),
   '${s.type}'::type_pro, ${q(`${s.prefixe} de ${c.fr}`)}, ${q('Service de secours')},
   ${q(info?.tel || null)}, 'verifie'::statut_pro, true, ${b(info ? info.confirme : false)}, ${n(c.lat)}, ${n(c.lng)}, '24h/24')`)
  }
}
L.push(`insert into professionnels
  (province_id, ville_id, type, nom, specialite, telephone, statut, service_officiel, numero_confirme, lat, lng, horaires)
values
${lignes.join(',\n')}
on conflict do nothing;\n`)

// --- Numeros d'urgence ------------------------------------------------
L.push(`-- 5. Numeros d'urgence affiches en bandeau ---------------------------
--    ATTENTION : les entrees "verifie = false" proviennent de sources qui
--    se contredisent. Testez-les depuis un telephone tchadien (Airtel ET
--    Moov) avant la mise en production, puis passez-les a true depuis
--    Admin > Numeros d'urgence.`)
L.push('insert into numeros_urgence (libelle_fr, libelle_ar, tel, tel2, ville_id, national, h24, verifie, source, ordre) values')
L.push(urg.numeros.map((u, i) =>
  `  (${q(u.fr)}, ${q(u.ar)}, ${q(u.tel)}, ${q(u.tel2 || null)}, ${u.ville ? `(select id from villes where nom_fr = ${q(u.ville)} limit 1)` : 'null'}, ${b(u.national)}, ${b(u.h24)}, ${b(u.verifie)}, ${q(u.source)}, ${i * 10})`
).join(',\n') + '\non conflict do nothing;\n')

// --- Hopitaux de reference -------------------------------------------
L.push('-- 6. Hopitaux de reference (affiches en cas d\'escalade) --------------')
L.push(`insert into professionnels
  (province_id, ville_id, type, nom, specialite, telephone, statut, service_officiel, numero_confirme, horaires)
values
${urg.hopitaux_reference.map((h) =>
  `  ((select province_id from villes where nom_fr = ${q(h.ville)} limit 1),
   (select id from villes where nom_fr = ${q(h.ville)} limit 1),
   'centre_sante'::type_pro, ${q(h.fr)}, 'Hôpital de référence', ${q(h.tel)},
   'verifie'::statut_pro, true, ${b(h.verifie)}, '24h/24')`).join(',\n')}
on conflict do nothing;\n`)

L.push(`select
  (select count(*) from provinces)      as provinces,
  (select count(*) from villes)         as villes,
  (select count(*) from quartiers)      as quartiers,
  (select count(*) from professionnels where service_officiel) as services_secours,
  (select count(*) from numeros_urgence) as numeros,
  'Etape 2/3 terminee. Facultatif : 03_donnees_demo.sql' as resultat;`)

writeFileSync(join(racine, 'supabase/02_donnees_geo.sql'), L.join('\n') + '\n')
console.log(`02_donnees_geo.sql genere : ${geo.provinces.length} provinces, ${villes.length} villes, ${quartiers.length} quartiers, ${lignes.length} services de secours, ${urg.numeros.length} numeros d'urgence.`)

/* --------------------------------------------------------------------
 * 03_donnees_demo.sql : jeu de demonstration, clairement etiquete.
 * ------------------------------------------------------------------ */
const demo = JSON.parse(readFileSync(join(racine, 'src/data/demo.json'), 'utf8'))
const D = []
D.push(`-- =====================================================================
--  ALLO SANTE TCHAD — jeu de donnees de DEMONSTRATION (facultatif)
--  GENERE AUTOMATIQUEMENT — ne pas modifier a la main.
--
--  ${demo.avertissement}
--
--  Pour tout effacer d'un coup : lancez 04_effacer_demo.sql
-- =====================================================================

insert into professionnels
  (type, nom, specialite, province_id, ville_id, quartier_id, horaires,
   en_ligne, derniere_activite, statut, demo, numero_confirme, telephone, lat, lng)
values`)
D.push(demo.professionnels.map((p) => {
  const ville = `(select id from villes where code = ${q(p.ville)})`
  return `  ('${p.type}'::type_pro, ${q(p.nom + ' (DÉMO)')}, ${q(p.specialite)},
   (select province_id from villes where code = ${q(p.ville)}),
   ${ville},
   (select id from quartiers where ville_id = ${ville} and nom_fr = ${q(p.quartier)} limit 1),
   ${q(p.horaires)}, ${b(p.enligne)}, now(), 'verifie'::statut_pro, true, false, null,
   (select lat from villes where code = ${q(p.ville)}),
   (select lng from villes where code = ${q(p.ville)}))`
}).join(',\n') + '\non conflict do nothing;\n')
D.push(`select count(*) as fiches_demo, 'Jeu de demonstration installe.' as resultat
from professionnels where demo;`)
writeFileSync(join(racine, 'supabase/03_donnees_demo.sql'), D.join('\n') + '\n')

writeFileSync(join(racine, 'supabase/04_effacer_demo.sql'), `-- =====================================================================
--  ALLO SANTE TCHAD — effacer toutes les donnees de demonstration
--  A lancer AVANT la mise en service reelle.
-- =====================================================================
delete from reponses            where pro_id in (select id from professionnels where demo);
delete from reponses_ordonnance where pharmacie_id in (select id from professionnels where demo);
delete from ordonnances         where demo;
delete from demandes            where demo;
delete from professionnels      where demo;

select 'Donnees de demonstration effacees.' as resultat,
       (select count(*) from professionnels where demo) as reste;
`)

writeFileSync(join(racine, 'supabase/05_creer_administrateur.sql'), `-- =====================================================================
--  ALLO SANTE TCHAD — creer le premier super-administrateur
--  ---------------------------------------------------------------
--  MODE D'EMPLOI (2 minutes)
--
--  1. Dans Supabase : Authentication > Users > "Add user" > "Create new user".
--     - Email    : utilisez le format telephone de la plateforme, par ex.
--                  23566000000@tel.allosante.td
--                  (l'application connecte les gens par NUMERO ; elle
--                   fabrique cette adresse toute seule. Ici vous la saisissez
--                   a la main pour le tout premier compte.)
--     - Password : choisissez un mot de passe solide.
--     - Cochez "Auto Confirm User".
--  2. Copiez l'UUID de l'utilisateur cree (colonne "UID").
--  3. Remplacez COLLEZ_ICI_L_UUID ci-dessous, puis lancez cette requete.
-- =====================================================================

update profils
   set role = 'super_admin',
       nom  = 'Super administrateur',
       actif = true
 where id = 'COLLEZ_ICI_L_UUID';

-- Verification : doit renvoyer une ligne avec role = super_admin
select id, role, nom, telephone from profils where role = 'super_admin';

-- ---------------------------------------------------------------------
--  CREER ENSUITE UN ADMIN DE PROVINCE OU DE VILLE
--  (le super-admin peut aussi le faire depuis le back-office)
-- ---------------------------------------------------------------------
-- Admin de province :
-- update profils set role = 'admin_province',
--        province_id = (select id from provinces where code = 'LOC')
--  where id = 'UUID_DE_LA_PERSONNE';
--
-- Admin de ville :
-- update profils set role = 'admin_ville',
--        ville_id = (select id from villes where code = 'LOC-MDU'),
--        province_id = (select province_id from villes where code = 'LOC-MDU')
--  where id = 'UUID_DE_LA_PERSONNE';
`)
console.log('03_donnees_demo.sql, 04_effacer_demo.sql et 05_creer_administrateur.sql generes.')
