-- =====================================================================
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
  (1, 'TDDS20191901', 'Chaddra', (select id from provinces where code = 'BEG'), false),
  (2, 'TDDS20191902', 'Michemire', (select id from provinces where code = 'BEG'), false),
  (3, 'TDDS20191903', 'Moussoro', (select id from provinces where code = 'BEG'), false),
  (4, 'TDDS20191904', 'Salal', (select id from provinces where code = 'BEG'), false),
  (5, 'TDDS20190101', 'Alifa', (select id from provinces where code = 'BAT'), false),
  (6, 'TDDS20190102', 'Assinet', (select id from provinces where code = 'BAT'), false),
  (7, 'TDDS20190103', 'Ati', (select id from provinces where code = 'BAT'), false),
  (8, 'TDDS20190104', 'Djedda', (select id from provinces where code = 'BAT'), false),
  (9, 'TDDS20190105', 'Koundjourou', (select id from provinces where code = 'BAT'), false),
  (10, 'TDDS20190106', 'Oum-Hadjer', (select id from provinces where code = 'BAT'), false),
  (11, 'TDDS20190107', 'Yao', (select id from provinces where code = 'BAT'), false),
  (12, 'TDDS20190201', 'Faya', (select id from provinces where code = 'BOR'), false),
  (13, 'TDDS20190202', 'Kirdimi', (select id from provinces where code = 'BOR'), false),
  (14, 'TDDS20190203', 'Kouba Olanga', (select id from provinces where code = 'BOR'), false),
  (15, 'TDDS20190301', 'Ba Illi', (select id from provinces where code = 'CHB'), false),
  (16, 'TDDS20190302', 'Bousso', (select id from provinces where code = 'CHB'), false),
  (17, 'TDDS20190303', 'Dourbali', (select id from provinces where code = 'CHB'), false),
  (18, 'TDDS20190304', 'Kouno', (select id from provinces where code = 'CHB'), false),
  (19, 'TDDS20190305', 'Mandelia', (select id from provinces where code = 'CHB'), false),
  (20, 'TDDS20190306', 'Massenya', (select id from provinces where code = 'CHB'), false),
  (21, 'TDDS20192001', 'Amdjarass', (select id from provinces where code = 'ENE'), false),
  (22, 'TDDS20192002', 'Bahai', (select id from provinces where code = 'ENE'), false),
  (23, 'TDDS20192003', 'Kaoura', (select id from provinces where code = 'ENE'), false),
  (24, 'TDDS20192004', 'Mourdi', (select id from provinces where code = 'ENE'), false),
  (25, 'TDDS20192301', 'Fada', (select id from provinces where code = 'ENO'), false),
  (26, 'TDDS20192302', 'Kalait', (select id from provinces where code = 'ENO'), false),
  (27, 'TDDS20192303', 'Ounianga Kebir', (select id from provinces where code = 'ENO'), false),
  (28, 'TDDS20190401', 'Baro', (select id from provinces where code = 'GUE'), false),
  (29, 'TDDS20190402', 'Bitkine', (select id from provinces where code = 'GUE'), false),
  (30, 'TDDS20190403', 'Mangalme', (select id from provinces where code = 'GUE'), false),
  (31, 'TDDS20190404', 'Melfi', (select id from provinces where code = 'GUE'), false),
  (32, 'TDDS20190405', 'Mongo', (select id from provinces where code = 'GUE'), false),
  (33, 'TDDS20190501', 'Bokoro', (select id from provinces where code = 'HAL'), false),
  (34, 'TDDS20190502', 'Gama', (select id from provinces where code = 'HAL'), false),
  (35, 'TDDS20190503', 'Karal', (select id from provinces where code = 'HAL'), false),
  (36, 'TDDS20190504', 'Mani', (select id from provinces where code = 'HAL'), false),
  (37, 'TDDS20190505', 'Massaguet', (select id from provinces where code = 'HAL'), false),
  (38, 'TDDS20190506', 'Massakory', (select id from provinces where code = 'HAL'), false),
  (39, 'TDDS20190601', 'Mao', (select id from provinces where code = 'KAN'), false),
  (40, 'TDDS20190602', 'Mondo', (select id from provinces where code = 'KAN'), false),
  (41, 'TDDS20190603', 'Nokou', (select id from provinces where code = 'KAN'), false),
  (42, 'TDDS20190604', 'N''Tiona', (select id from provinces where code = 'KAN'), false),
  (43, 'TDDS20190605', 'Rig-Rig', (select id from provinces where code = 'KAN'), false),
  (44, 'TDDS20190701', 'Bagasola', (select id from provinces where code = 'LAC'), false),
  (45, 'TDDS20190702', 'Bol', (select id from provinces where code = 'LAC'), false),
  (46, 'TDDS20190703', 'Isseirom', (select id from provinces where code = 'LAC'), false),
  (47, 'TDDS20190704', 'Kouloudia', (select id from provinces where code = 'LAC'), false),
  (48, 'TDDS20190705', 'Liwa', (select id from provinces where code = 'LAC'), false),
  (49, 'TDDS20190706', 'Ngouri', (select id from provinces where code = 'LAC'), false),
  (50, 'TDDS20190801', 'Beïnamar', (select id from provinces where code = 'LOC'), false),
  (51, 'TDDS20190802', 'Benoye', (select id from provinces where code = 'LOC'), false),
  (52, 'TDDS20190803', 'Laokassy', (select id from provinces where code = 'LOC'), false),
  (53, 'TDDS20190804', 'Moundou', (select id from provinces where code = 'LOC'), false),
  (54, 'TDDS20190901', 'Baïbokoum', (select id from provinces where code = 'LOR'), false),
  (55, 'TDDS20190902', 'Bebedja', (select id from provinces where code = 'LOR'), false),
  (56, 'TDDS20190903', 'Beboto', (select id from provinces where code = 'LOR'), false),
  (57, 'TDDS20190904', 'Bessao', (select id from provinces where code = 'LOR'), false),
  (58, 'TDDS20190905', 'Bodo', (select id from provinces where code = 'LOR'), false),
  (59, 'TDDS20190906', 'Doba', (select id from provinces where code = 'LOR'), false),
  (60, 'TDDS20190907', 'Donia', (select id from provinces where code = 'LOR'), false),
  (61, 'TDDS20190908', 'Gore', (select id from provinces where code = 'LOR'), false),
  (62, 'TDDS20190909', 'Kara', (select id from provinces where code = 'LOR'), false),
  (63, 'TDDS20190910', 'Larmanaye', (select id from provinces where code = 'LOR'), false),
  (64, 'TDDS20191001', 'Bedaya', (select id from provinces where code = 'MAN'), false),
  (65, 'TDDS20191002', 'Bedjondo', (select id from provinces where code = 'MAN'), false),
  (66, 'TDDS20191003', 'Bekourou', (select id from provinces where code = 'MAN'), false),
  (67, 'TDDS20191004', 'Bouna', (select id from provinces where code = 'MAN'), false),
  (68, 'TDDS20191005', 'Goundi', (select id from provinces where code = 'MAN'), false),
  (69, 'TDDS20191006', 'Koumra', (select id from provinces where code = 'MAN'), false),
  (70, 'TDDS20191007', 'Moïssala', (select id from provinces where code = 'MAN'), false),
  (71, 'TDDS20191101', 'Bongor', (select id from provinces where code = 'MKE'), false),
  (72, 'TDDS20191102', 'Fianga', (select id from provinces where code = 'MKE'), false),
  (73, 'TDDS20191103', 'Gounou-Gaya', (select id from provinces where code = 'MKE'), false),
  (74, 'TDDS20191104', 'Guelendeng', (select id from provinces where code = 'MKE'), false),
  (75, 'TDDS20191105', 'Moulkou', (select id from provinces where code = 'MKE'), false),
  (76, 'TDDS20191106', 'Pont Carol', (select id from provinces where code = 'MKE'), false),
  (77, 'TDDS20191107', 'Youe', (select id from provinces where code = 'MKE'), false),
  (78, 'TDDS20191201', 'Binder', (select id from provinces where code = 'MKO'), false),
  (79, 'TDDS20191202', 'Gagal', (select id from provinces where code = 'MKO'), false),
  (80, 'TDDS20191203', 'Guegou', (select id from provinces where code = 'MKO'), false),
  (81, 'TDDS20191204', 'Guelo', (select id from provinces where code = 'MKO'), false),
  (82, 'TDDS20191205', 'Lagon', (select id from provinces where code = 'MKO'), false),
  (83, 'TDDS20191206', 'Lame', (select id from provinces where code = 'MKO'), false),
  (84, 'TDDS20191207', 'Lere', (select id from provinces where code = 'MKO'), false),
  (85, 'TDDS20191208', 'Pala', (select id from provinces where code = 'MKO'), false),
  (86, 'TDDS20191209', 'Torrock', (select id from provinces where code = 'MKO'), false),
  (87, 'TDDS20191301', 'Balimba', (select id from provinces where code = 'MOC'), false),
  (88, 'TDDS20191302', 'Biobe', (select id from provinces where code = 'MOC'), false),
  (89, 'TDDS20191303', 'Danamadji', (select id from provinces where code = 'MOC'), false),
  (90, 'TDDS20191304', 'Korbol', (select id from provinces where code = 'MOC'), false),
  (91, 'TDDS20191305', 'Koumogo', (select id from provinces where code = 'MOC'), false),
  (92, 'TDDS20191306', 'Kyabe', (select id from provinces where code = 'MOC'), false),
  (93, 'TDDS20191307', 'Maro', (select id from provinces where code = 'MOC'), false),
  (94, 'TDDS20191308', 'Sarh', (select id from provinces where code = 'MOC'), false),
  (95, 'TDDS20191805', '9e Arrondissement', (select id from provinces where code = 'NDJ'), false),
  (96, 'TDDS20191801', 'Ndjamena-Centre', (select id from provinces where code = 'NDJ'), false),
  (97, 'TDDS20191802', 'Ndjamena-Est', (select id from provinces where code = 'NDJ'), false),
  (98, 'TDDS20191803', 'Ndjamena-Nord', (select id from provinces where code = 'NDJ'), false),
  (99, 'TDDS20191804', 'Ndjamena-Sud', (select id from provinces where code = 'NDJ'), false),
  (100, 'TDDS20191402', 'Abeche', (select id from provinces where code = 'OUA'), false),
  (101, 'TDDS20191403', 'Abougoudam', (select id from provinces where code = 'OUA'), false),
  (102, 'TDDS20191404', 'Adre', (select id from provinces where code = 'OUA'), false),
  (103, 'TDDS20192101', 'Am Dam', (select id from provinces where code = 'SIL'), false),
  (104, 'TDDS20191501', 'Aboudeia', (select id from provinces where code = 'SAL'), false),
  (105, 'TDDS20191502', 'Am Timan', (select id from provinces where code = 'SAL'), false),
  (106, 'TDDS20191503', 'Haraze', (select id from provinces where code = 'SAL'), false),
  (107, 'TDDS20191401', 'Abdi', (select id from provinces where code = 'OUA'), false),
  (108, 'TDDS20192102', 'Goz-Beida', (select id from provinces where code = 'SIL'), false),
  (109, 'TDDS20192103', 'Koukou Angarana', (select id from provinces where code = 'SIL'), true),
  (110, 'TDDS20192104', 'Tissi', (select id from provinces where code = 'SIL'), false),
  (111, 'TDDS20191601', 'Baktchoro', (select id from provinces where code = 'TAN'), false),
  (112, 'TDDS20191602', 'Bere', (select id from provinces where code = 'TAN'), false),
  (113, 'TDDS20191603', 'Dafra', (select id from provinces where code = 'TAN'), false),
  (114, 'TDDS20191604', 'Donomanga', (select id from provinces where code = 'TAN'), false),
  (115, 'TDDS20191605', 'Guidari', (select id from provinces where code = 'TAN'), false),
  (116, 'TDDS20191606', 'Kelo', (select id from provinces where code = 'TAN'), false),
  (117, 'TDDS20191607', 'Kolon', (select id from provinces where code = 'TAN'), false),
  (118, 'TDDS20191608', 'Laï', (select id from provinces where code = 'TAN'), false),
  (119, 'TDDS20192201', 'Bardai', (select id from provinces where code = 'TIB'), false),
  (120, 'TDDS20192202', 'Zouar', (select id from provinces where code = 'TIB'), false),
  (121, 'TDDS20191701', 'Amzoer', (select id from provinces where code = 'WAF'), false),
  (122, 'TDDS20191702', 'Arada', (select id from provinces where code = 'WAF'), false),
  (123, 'TDDS20191703', 'Biltine', (select id from provinces where code = 'WAF'), false),
  (124, 'TDDS20191704', 'Guereda', (select id from provinces where code = 'WAF'), false),
  (125, 'TDDS20191705', 'Iriba', (select id from provinces where code = 'WAF'), false),
  (126, 'TDDS20191706', 'Matadjana', (select id from provinces where code = 'WAF'), false)
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
