/* =====================================================================
 * Afiya — referentiel sanitaire (districts et formations sanitaires).
 * Source : Ministere de la Sante Publique du Tchad, « Liste des centres
 * de sante et districts sanitaires », 2020 (fichier xlsx fourni par le
 * ministere). 1 985 formations, 126 districts, 23 provinces sanitaires,
 * toutes geolocalisees.
 *
 *   node scripts/generer-sante.mjs chemin/vers/districts.xlsx
 *
 * Produit :
 *   src/data/sante.json                 (compact, embarque dans l'appli,
 *                                        sert au « centre de sante le plus
 *                                        proche » meme hors ligne)
 *   supabase/11_sante_referentiel.sql   (districts + liaison villes, pas
 *                                        les 1 985 formations : elles sont
 *                                        importees depuis l'appli par le
 *                                        super-administrateur)
 *
 * Corrections appliquees a la source, toutes documentees ici :
 *   - cinq noms en mojibake (« LaÃ¯ » pour « Laï »...) : reencodes ;
 *   - un district « Noukou » avec une espace en tete : « Nokou » ;
 *   - le district de Koukou Angarana etait range sous le Kanem avec le
 *     code du district de Nokou. Ses huit formations sont a 21,7° E,
 *     12° N : c'est le Sila. On lui rend sa province et le code manquant
 *     de la serie du Sila (TDDS20192103). Marque « corrige ».
 * Rien d'autre n'est modifie : ni la fonctionnalite, ni les noms.
 * ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let XLSX
try { XLSX = require('xlsx') } catch { console.error('npm i -D xlsx'); process.exit(1) }

const src = process.argv[2]
if (!src) { console.error('usage : node scripts/generer-sante.mjs fichier.xlsx'); process.exit(1) }

const demojibake = (s) => {
  try { return Buffer.from(String(s), 'latin1').toString('utf8').includes('�') ? s : (/Ã/.test(s) ? Buffer.from(String(s), 'latin1').toString('utf8') : s) } catch { return s }
}
const propre = (s) => demojibake(String(s ?? '').replace(/\s+/g, ' ').trim())

const PROV = { // nom MSP -> code de l'application
  'Bahr El Ghazal': 'BEG', 'Batha': 'BAT', 'Borkou': 'BOR', 'Chari Baguirmi': 'CHB', 'Ennedi Est': 'ENE',
  'Ennedi Ouest': 'ENO', 'Guera': 'GUE', 'Hadjer Lamis': 'HAL', 'Kanem': 'KAN', 'Lac': 'LAC',
  'Logone Occidental': 'LOC', 'Logone Oriental': 'LOR', 'Mandoul': 'MAN', 'Mayo Kebbi Est': 'MKE',
  'Mayo Kebbi Ouest': 'MKO', 'Moyen Chari': 'MOC', "N'Djamena": 'NDJ', 'Ouaddai': 'OUA', 'Salamat': 'SAL',
  'Sila': 'SIL', 'Tandjile': 'TAN', 'Tibesti': 'TIB', 'Wadi Fira': 'WAF',
}
const TYPE = { 'Centre de santé': 'CS', 'Hôpital de district': 'HD', 'Hôpital Provincial': 'HP', 'Hôpital National': 'HN' }
const affil = (a) => {
  const s = propre(a)
  if (!s) return 'INC'
  if (/^Publique/i.test(s)) return 'PUB'
  if (/^Confession/i.test(s)) return 'CONF'
  if (/^Priv/i.test(s)) return 'PRIV'
  if (/^(ONG|HCR)/i.test(s)) return 'ONG'
  if (/^Communaut/i.test(s)) return 'COM'
  if (/^Para/i.test(s)) return 'PARA'
  return 'INC'
}
const fonct = (f) => ({ 'Fonctionnelle': 1, 'Non Fonctionnelle': 0, 'Planifiée': 2 })[propre(f)] ?? 0

const wb = XLSX.readFile(src)
const lignes = XLSX.utils.sheet_to_json(wb.Sheets['Feuil2'], { defval: null })

const districts = new Map()
const formations = []
const corrections = []
for (const l of lignes) {
  if (!l.Nom) continue
  let dNom = propre(l.NomDistrict), dP = propre(l.PcodeDistrict), prov = propre(l.NomProvince)
  if (dNom === 'Noukou') dNom = 'Nokou'
  if (dNom === 'Koukou Angarana') { dP = 'TDDS20192103'; prov = 'Sila' }
  const codeProv = PROV[prov]
  if (!codeProv) throw new Error('province inconnue : ' + prov)
  if (!districts.has(dP)) {
    districts.set(dP, { id: districts.size + 1, pcode: dP, nom: dNom, prov: codeProv, corrige: dNom === 'Koukou Angarana' })
  }
  const d = districts.get(dP)
  if (d.nom !== dNom) throw new Error(`deux noms pour ${dP} : ${d.nom} / ${dNom}`)
  const nom = propre(l.Nom)
  if (nom !== String(l.Nom).trim()) corrections.push([l.Nom, nom])
  formations.push([
    Number(l.CODE_CS_MSP), nom, TYPE[propre(l.TYPES)] || 'CS', affil(l.AFFILIATION), fonct(l.FONCTIONNALITE),
    Math.round(Number(l.LONGITUDE) * 1e4) / 1e4, Math.round(Number(l.LATITUDE) * 1e4) / 1e4, d.id,
  ])
}
const provinces = [...new Set(lignes.map((l) => propre(l.NomProvince)))].sort().map((n) => ({
  code: PROV[n], nom: n, pcode: propre(lignes.find((l) => propre(l.NomProvince) === n).PcodeProvinceSanitaire),
}))
// Koukou Angarana : la province sanitaire du Sila existe deja dans la liste.
const sortie = {
  source: 'Ministère de la Santé Publique du Tchad, liste des formations sanitaires et districts sanitaires, 2020',
  genere: new Date().toISOString().slice(0, 10),
  types: { CS: 'Centre de santé', HD: 'Hôpital de district', HP: 'Hôpital provincial', HN: 'Hôpital national' },
  affiliations: { PUB: 'Public', CONF: 'Confessionnel', PRIV: 'Privé', ONG: 'ONG / HCR', COM: 'Communautaire', PARA: 'Paraétatique', INC: 'Non précisé' },
  fonctionnalite: { 1: 'Fonctionnelle', 0: 'Non fonctionnelle', 2: 'Planifiée' },
  colonnes: ['code_msp', 'nom', 'type', 'affiliation', 'fonctionnelle', 'lng', 'lat', 'district_id'],
  provinces,
  districts: [...districts.values()],
  formations,
}
writeFileSync('src/data/sante.json', JSON.stringify(sortie))
console.log(`sante.json : ${provinces.length} provinces, ${districts.size} districts, ${formations.length} formations, ${(JSON.stringify(sortie).length / 1024).toFixed(0)} Ko`)
console.log('corrections de graphie :', corrections.map(([a, b]) => `${a} -> ${b}`).join(', ') || 'aucune')

/* --- SQL : districts et liaison villes -> districts ------------------- */
const sqlEsc = (s) => String(s).replace(/'/g, "''")
let sql = `-- =====================================================================
--  11. REFERENTIEL SANITAIRE : provinces sanitaires, districts, formations
--  Genere par scripts/generer-sante.mjs a partir de la liste MSP 2020.
--  Re-executable. Les 1 985 formations ne sont pas dans ce fichier : le
--  super-administrateur les importe depuis l'application (bouton
--  « Importer les formations sanitaires »), qui appelle importer_formations().
-- =====================================================================

create table if not exists districts_sanitaires (
  id          int primary key,
  pcode       text unique not null,
  nom         text not null,
  province_id int references provinces(id),
  corrige     boolean not null default false,   -- source corrigee, voir generer-sante.mjs
  created_at  timestamptz default now()
);

create table if not exists formations_sanitaires (
  code_msp     int primary key,
  nom          text not null,
  type         text not null check (type in ('CS','HD','HP','HN')),
  affiliation  text not null check (affiliation in ('PUB','CONF','PRIV','ONG','COM','PARA','INC')),
  fonctionnelle smallint not null default 1 check (fonctionnelle in (0,1,2)),
  lat          double precision,
  lng          double precision,
  district_id  int references districts_sanitaires(id),
  source       text not null default 'MSP 2020',
  maj_le       timestamptz default now()
);
create index if not exists idx_fs_district on formations_sanitaires(district_id);
create index if not exists idx_fs_type     on formations_sanitaires(type);

-- Lien ville de l'application -> district sanitaire (nom pour nom, puis
-- quatre cas regles a la main : N'Djamena, Faya-Largeau, Am-Djarass, Lai).
alter table villes add column if not exists district_id int references districts_sanitaires(id);

insert into districts_sanitaires (id, pcode, nom, province_id, corrige) values
`
sql += [...districts.values()].map((d) => `  (${d.id}, '${d.pcode}', '${sqlEsc(d.nom)}', (select id from provinces where code = '${d.prov}'), ${d.corrige})`).join(',\n')
sql += `
on conflict (id) do update set pcode = excluded.pcode, nom = excluded.nom, province_id = excluded.province_id, corrige = excluded.corrige;

-- Liaison par homonymie (sans accents ni casse), puis exceptions.
update villes v set district_id = d.id
  from districts_sanitaires d
 where v.district_id is null
   and lower(public.unaccent_immuable(d.nom)) = lower(public.unaccent_immuable(v.nom_fr));
-- Meme chose en ignorant tirets et espaces (Oum-Hadjer / Oum Hadjer...).
update villes v set district_id = d.id
  from districts_sanitaires d
 where v.district_id is null
   and regexp_replace(lower(public.unaccent_immuable(d.nom)), '[^a-z]', '', 'g')
     = regexp_replace(lower(public.unaccent_immuable(v.nom_fr)), '[^a-z]', '', 'g');
-- Exceptions reglees a la main.
update villes set district_id = (select id from districts_sanitaires where nom = 'Ndjamena-Centre') where code = 'NDJ-NDJ' and district_id is null;
update villes set district_id = (select id from districts_sanitaires where nom = 'Faya')            where code = 'BOR-FAY' and district_id is null;
update villes set district_id = (select id from districts_sanitaires where nom = 'Amdjarass')       where code = 'ENE-AMD' and district_id is null;
update villes set district_id = (select id from districts_sanitaires where nom = 'Laï')             where code = 'TAN-LAI' and district_id is null;
update villes set district_id = (select id from districts_sanitaires where nom = 'Bebedja')         where code = 'LOR-BBD' and district_id is null;
update villes set district_id = (select id from districts_sanitaires where nom = 'Guelendeng')      where code = 'MKE-GUL' and district_id is null;
-- Krim Krim n'a pas de district homonyme : il releve du district de Benoye.
update villes set district_id = (select id from districts_sanitaires where nom = 'Benoye')          where code = 'LOC-KRI' and district_id is null;

-- ---------------------------------------------------------------------
--  Import des formations par lots, reserve au super-administrateur.
--  p_lot : tableau JSON de lignes [code_msp, nom, type, affiliation,
--  fonctionnelle, lng, lat, district_id], exactement le format de
--  src/data/sante.json. Renvoie le nombre de lignes ecrites.
-- ---------------------------------------------------------------------
create or replace function public.importer_formations(p_lot jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  if not public.est_super_admin() then
    raise exception 'reserve au super-administrateur' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lot) <> 'array' or jsonb_array_length(p_lot) > 600 then
    raise exception 'lot invalide (tableau de 600 lignes au plus)';
  end if;
  insert into formations_sanitaires (code_msp, nom, type, affiliation, fonctionnelle, lng, lat, district_id, maj_le)
  select (e->>0)::int, left(e->>1, 120), e->>2, e->>3, (e->>4)::smallint,
         (e->>5)::double precision, (e->>6)::double precision, (e->>7)::int, now()
    from jsonb_array_elements(p_lot) e
  on conflict (code_msp) do update
    set nom = excluded.nom, type = excluded.type, affiliation = excluded.affiliation,
        fonctionnelle = excluded.fonctionnelle, lng = excluded.lng, lat = excluded.lat,
        district_id = excluded.district_id, maj_le = now();
  get diagnostics n = row_count;
  return n;
end
$fn$;

-- ---------------------------------------------------------------------
--  Droits. Supabase accorde par defaut tous les droits a anon et
--  authenticated sur toute table nouvelle, et EXECUTE a public sur toute
--  fonction nouvelle : on referme d'abord, on ouvre ensuite par nom.
-- ---------------------------------------------------------------------
alter table districts_sanitaires  enable row level security;
alter table formations_sanitaires enable row level security;
revoke all on districts_sanitaires, formations_sanitaires from anon, authenticated;
grant select on districts_sanitaires, formations_sanitaires to anon, authenticated;

drop policy if exists ds_lecture on districts_sanitaires;
create policy ds_lecture on districts_sanitaires for select to anon, authenticated using (true);
drop policy if exists fs_lecture on formations_sanitaires;
create policy fs_lecture on formations_sanitaires for select to anon, authenticated using (true);

revoke execute on function public.importer_formations(jsonb) from public, anon, authenticated;
grant  execute on function public.importer_formations(jsonb) to authenticated;

-- Controle : 126 districts, 62 villes dont aucune sans district.
select (select count(*) from districts_sanitaires) as districts,
       (select count(*) from villes) as villes,
       (select count(*) from villes where district_id is null) as villes_sans_district;
`
writeFileSync('supabase/11_sante_referentiel.sql', sql)
console.log('11_sante_referentiel.sql ecrit,', (sql.length / 1024).toFixed(0), 'Ko')
