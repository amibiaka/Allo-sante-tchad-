-- =====================================================================
--  ALLO SANTE TCHAD — installation de la base de donnees
--  ---------------------------------------------------------------
--  A COLLER EN ENTIER dans Supabase > SQL Editor > New query > Run.
--  Ce fichier est idempotent : vous pouvez le relancer sans risque.
--  Ordre : 01_installation.sql -> 02_donnees_geo.sql -> (03_donnees_demo.sql)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. TYPES
-- ---------------------------------------------------------------------
do $$ begin
  create type role_utilisateur as enum ('pro','admin_ville','admin_province','super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_pro as enum (
    'medecin','infirmier','sage_femme','pharmacie','centre_sante',
    'police','gendarmerie','pompiers','ambulance','protection_civile','autre');
exception when duplicate_object then null; end $$;

do $$ begin
  create type statut_pro as enum ('provisoire','verifie','suspendu','refuse','expire');
exception when duplicate_object then null; end $$;

do $$ begin
  create type statut_demande as enum ('nouveau','vu','pris_en_charge','resolu','non_pris_en_charge','annule');
exception when duplicate_object then null; end $$;

do $$ begin
  create type action_reponse as enum ('vu','en_route','appelle','whatsapp','indisponible','resolu');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispo_ordonnance as enum ('complete','partielle','indisponible');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. GEOGRAPHIE
-- ---------------------------------------------------------------------
create table if not exists provinces (
  id          serial primary key,
  code        text unique not null,
  nom_fr      text not null,
  nom_ar      text,
  ordre       int default 100
);

create table if not exists villes (
  id          serial primary key,
  province_id int not null references provinces(id) on delete cascade,
  code        text unique not null,
  nom_fr      text not null,
  nom_ar      text,
  chef_lieu   boolean default false,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz default now()
);
create index if not exists idx_villes_province on villes(province_id);

create table if not exists quartiers (
  id          serial primary key,
  ville_id    int not null references villes(id) on delete cascade,
  nom_fr      text not null,
  nom_ar      text,
  groupe      int,                       -- numero d'arrondissement, si connu
  qualite     text default 'local',      -- officiel | presse | wiki | osm | local | suggere
  approuve    boolean default true,
  suggere_par text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz default now(),
  unique (ville_id, nom_fr)
);
create index if not exists idx_quartiers_ville on quartiers(ville_id);

-- ---------------------------------------------------------------------
-- 3. UTILISATEURS (profils lies a auth.users)
-- ---------------------------------------------------------------------
create table if not exists profils (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        role_utilisateur not null default 'pro',
  nom         text,
  telephone   text,
  province_id int references provinces(id),   -- perimetre pour admin_province
  ville_id    int references villes(id),      -- perimetre pour admin_ville
  actif       boolean default true,
  created_at  timestamptz default now()
);

-- Cree automatiquement un profil a chaque inscription.
create or replace function public.creer_profil_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, role, nom, telephone)
  values (
    new.id,
    'pro',
    coalesce(new.raw_user_meta_data->>'nom', ''),
    coalesce(new.raw_user_meta_data->>'telephone', new.phone, '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_creer_profil on auth.users;
create trigger trg_creer_profil after insert on auth.users
  for each row execute function public.creer_profil_auto();

-- ---------------------------------------------------------------------
-- 4. PROFESSIONNELS ET SERVICES DE SECOURS
-- ---------------------------------------------------------------------
create table if not exists professionnels (
  id            uuid primary key default gen_random_uuid(),
  profil_id     uuid references profils(id) on delete set null,
  type          type_pro not null,
  nom           text not null,
  specialite    text,
  province_id   int references provinces(id),
  ville_id      int references villes(id),
  quartier_id   int references quartiers(id),
  adresse_texte text,
  telephone     text,
  whatsapp      text,
  telegram      text,
  horaires      text,
  lat           double precision,
  lng           double precision,

  -- Inscription souple : actif des la creation, 45 jours pour etre verifie.
  statut          statut_pro not null default 'provisoire',
  probation_fin   timestamptz default (now() + interval '45 days'),
  verifie_par     uuid references profils(id),
  verifie_le      timestamptz,
  note_admin      text,

  en_ligne          boolean default false,
  derniere_activite timestamptz,

  service_officiel boolean default false,  -- police, pompiers, gendarmerie...
  numero_confirme  boolean default true,   -- false = numero trouve mais non teste
  demo             boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_pro_ville    on professionnels(ville_id);
create index if not exists idx_pro_province on professionnels(province_id);
create index if not exists idx_pro_statut   on professionnels(statut);
create index if not exists idx_pro_type     on professionnels(type);
create index if not exists idx_pro_profil   on professionnels(profil_id);

-- Un professionnel est "public" tant qu'il est provisoire ou verifie.
create or replace function public.pro_visible(p statut_pro)
returns boolean language sql immutable as $$
  select p in ('provisoire','verifie')
$$;

-- ---------------------------------------------------------------------
-- 5. DEMANDES D'AIDE
-- ---------------------------------------------------------------------
create table if not exists demandes (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,          -- code de suivi, ex. A4F7K
  pour_qui      text,                          -- moi | proche | assiste
  niveau        smallint not null check (niveau between 1 and 4),  -- 1 = vitale
  categories    text[] default '{}',
  description   text,
  vocal_url     text,
  age_approx    text,
  sexe          text,

  province_id   int references provinces(id),
  ville_id      int references villes(id),
  quartier_id   int references quartiers(id),
  quartier_libre text,
  ville_libre   text,          -- village ou localite hors chef-lieu
  lieu_texte    text,
  lat           double precision,
  lng           double precision,

  contact_tel      text,
  contact_whatsapp text,
  -- Colonne derivee : permet a l'interface de dire « ce patient a laisse
  -- un numero » sans jamais exposer le numero lui-meme.
  a_contact        boolean generated always as (contact_tel is not null) stored,
  contact_visible  boolean default false,   -- le patient autorise l'affichage

  statut        statut_demande not null default 'nouveau',
  escalade_le   timestamptz,
  resolu_le     timestamptz,
  consentement  boolean not null default false,
  demo          boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_dem_ville   on demandes(ville_id);
create index if not exists idx_dem_statut  on demandes(statut);
create index if not exists idx_dem_niveau  on demandes(niveau);
create index if not exists idx_dem_created on demandes(created_at desc);
create index if not exists idx_dem_code    on demandes(code);

create table if not exists reponses (
  id           uuid primary key default gen_random_uuid(),
  demande_id   uuid not null references demandes(id) on delete cascade,
  pro_id       uuid references professionnels(id) on delete set null,
  action       action_reponse not null,
  message      text,
  created_at   timestamptz default now()
);
create index if not exists idx_rep_demande on reponses(demande_id);
create index if not exists idx_rep_pro     on reponses(pro_id);

-- ---------------------------------------------------------------------
-- 6. ORDONNANCES / PHARMACIES
-- ---------------------------------------------------------------------
create table if not exists ordonnances (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  image_url      text,
  vocal_url      text,
  note           text,
  province_id    int references provinces(id),
  ville_id       int references villes(id),
  quartier_id    int references quartiers(id),
  quartier_libre text,
  ville_libre    text,
  pharmacie_id   uuid references professionnels(id) on delete set null, -- null = diffusion
  diffusion      boolean default true,
  contact_tel    text,
  a_contact      boolean generated always as (contact_tel is not null) stored,
  livraison_souhaitee boolean default false,
  statut         text default 'ouverte',   -- ouverte | servie | close
  masquee        boolean default false,    -- moderation
  consentement   boolean not null default false,
  demo           boolean default false,
  expire_le      timestamptz default (now() + interval '30 days'),
  created_at     timestamptz default now()
);
create index if not exists idx_ord_ville on ordonnances(ville_id);
create index if not exists idx_ord_code  on ordonnances(code);

create table if not exists reponses_ordonnance (
  id              uuid primary key default gen_random_uuid(),
  ordonnance_id   uuid not null references ordonnances(id) on delete cascade,
  pharmacie_id    uuid references professionnels(id) on delete set null,
  disponibilite   dispo_ordonnance not null,
  prix_indicatif  text,
  livraison       boolean default false,
  message         text,
  created_at      timestamptz default now()
);
create index if not exists idx_repord on reponses_ordonnance(ordonnance_id);

-- ---------------------------------------------------------------------
-- 7. MODERATION, REGLAGES, NUMEROS D'URGENCE, JOURNAL
-- ---------------------------------------------------------------------
create table if not exists signalements (
  id          uuid primary key default gen_random_uuid(),
  cible_type  text not null,          -- demande | ordonnance | professionnel
  cible_id    uuid not null,
  motif       text,
  detail      text,
  statut      text default 'ouvert',  -- ouvert | traite | rejete
  traite_par  uuid references profils(id),
  created_at  timestamptz default now()
);

create table if not exists reglages (
  cle        text primary key,
  valeur     jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists numeros_urgence (
  id          serial primary key,
  libelle_fr  text not null,
  libelle_ar  text,
  tel         text,
  tel2        text,
  province_id int references provinces(id),
  ville_id    int references villes(id),
  national    boolean default false,
  h24         boolean default false,
  verifie     boolean default false,
  source      text,
  ordre       int default 100,
  actif       boolean default true
);

create table if not exists journal_admin (
  id          bigserial primary key,
  admin_id    uuid references profils(id),
  action      text not null,
  cible_type  text,
  cible_id    text,
  detail      jsonb,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 8. FONCTIONS UTILITAIRES
-- ---------------------------------------------------------------------
create or replace function public.mon_role() returns role_utilisateur
language sql stable security definer set search_path = public as $$
  select role from profils where id = auth.uid()
$$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils
    where id = auth.uid() and actif
      and role in ('admin_ville','admin_province','super_admin'))
$$;

create or replace function public.est_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils
    where id = auth.uid() and actif and role = 'super_admin')
$$;

-- Un admin couvre-t-il cette ville ? (national > province > ville)
create or replace function public.admin_couvre(p_ville int, p_province int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profils pr
    where pr.id = auth.uid() and pr.actif
      and (
        pr.role = 'super_admin'
        or (pr.role = 'admin_province' and pr.province_id is not distinct from p_province)
        or (pr.role = 'admin_ville'    and pr.ville_id    is not distinct from p_ville)
      )
  )
$$;

-- Le professionnel connecte (actif = provisoire ou verifie)
create or replace function public.mon_pro() returns uuid
language sql stable security definer set search_path = public as $$
  select id from professionnels
  where profil_id = auth.uid() and statut in ('provisoire','verifie')
  limit 1
$$;

create or replace function public.mes_zones() returns table(ville_id int, province_id int)
language sql stable security definer set search_path = public as $$
  select p.ville_id, p.province_id from professionnels p
  where p.profil_id = auth.uid() and p.statut in ('provisoire','verifie')
$$;

-- Generateur de code de suivi lisible (sans caracteres ambigus).
create or replace function public.nouveau_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ACDEFGHJKLMNPQRTUVWXY34679';
  c text;
  i int;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from demandes d where d.code = c)
          and not exists (select 1 from ordonnances o where o.code = c);
  end loop;
  return c;
end $$;

/* Code de suivi = numero de telephone du patient + 2 lettres.
   Le patient n'a donc rien a memoriser : il connait deja son numero.
   Sans numero (le patient n'en a pas laisse), on retombe sur un code
   aleatoire de 6 caracteres. */
create or replace function public.remplir_code() returns trigger
language plpgsql as $$
declare
  alphabet text := 'ACDEFGHJKLMNPQRTUVWXY';   -- sans lettres ambigues (I, O, S, B, Z)
  chiffres text;
  suffixe  text;
  i int;
  essais int := 0;
begin
  if new.code is not null and new.code <> '' then return new; end if;

  chiffres := regexp_replace(coalesce(new.contact_tel, ''), '[^0-9]', '', 'g');
  -- On retire l'indicatif pays : le patient tape le numero qu'il connait.
  if length(chiffres) > 8 and left(chiffres, 3) = '235' then
    chiffres := substr(chiffres, 4);
  end if;

  if chiffres = '' then
    new.code := public.nouveau_code();
    return new;
  end if;

  loop
    suffixe := '';
    for i in 1..2 loop
      suffixe := suffixe || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    new.code := chiffres || suffixe;
    exit when not exists (select 1 from demandes d where d.code = new.code)
          and not exists (select 1 from ordonnances o where o.code = new.code);
    essais := essais + 1;
    -- Toutes les combinaisons prises pour ce numero : on bascule en aleatoire.
    if essais > 40 then new.code := public.nouveau_code(); exit; end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_code_demande on demandes;
create trigger trg_code_demande before insert on demandes
  for each row execute function public.remplir_code();

drop trigger if exists trg_code_ordonnance on ordonnances;
create trigger trg_code_ordonnance before insert on ordonnances
  for each row execute function public.remplir_code();

create or replace function public.touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_dem on demandes;
create trigger trg_touch_dem before update on demandes
  for each row execute function public.touch_updated();
drop trigger if exists trg_touch_pro on professionnels;
create trigger trg_touch_pro before update on professionnels
  for each row execute function public.touch_updated();

-- Passe la demande a "vu" des la premiere reponse, "pris_en_charge" si
-- un soignant s'engage, "resolu" s'il cloture.
create or replace function public.maj_statut_demande() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.action = 'resolu' then
    update demandes set statut = 'resolu', resolu_le = now() where id = new.demande_id;
  elsif new.action in ('en_route','appelle','whatsapp') then
    update demandes set statut = 'pris_en_charge'
      where id = new.demande_id and statut in ('nouveau','vu');
  elsif new.action = 'vu' then
    update demandes set statut = 'vu' where id = new.demande_id and statut = 'nouveau';
  end if;
  return new;
end $$;

drop trigger if exists trg_maj_statut on reponses;
create trigger trg_maj_statut after insert on reponses
  for each row execute function public.maj_statut_demande();

-- ---------------------------------------------------------------------
-- 9. SUIVI PATIENT SANS COMPTE (acces par code uniquement)
--
--    Le code contenant le numero de telephone, quelqu'un qui connait ce
--    numero n'aurait que 441 combinaisons de lettres a essayer. On
--    compte donc les echecs par numero et par heure, et on ferme la
--    porte au-dela de 12. Un patient qui se trompe une ou deux fois
--    n'est jamais gene ; un balayage automatique est arrete net.
-- ---------------------------------------------------------------------
create table if not exists tentatives_suivi (
  cle    text        not null,
  heure  timestamptz not null,
  echecs int         not null default 0,
  primary key (cle, heure)
);
alter table tentatives_suivi enable row level security;
-- Aucune politique : la table n'est accessible qu'aux fonctions
-- security definer ci-dessous.

create or replace function public.suivi_bloque(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare k text; n int;
begin
  k := nullif(regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g'), '');
  if k is null then return false; end if;
  select echecs into n from tentatives_suivi
   where cle = k and heure = date_trunc('hour', now());
  return coalesce(n, 0) >= 12;
end $$;

create or replace function public.suivi_echec(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  k := nullif(regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g'), '');
  if k is null then return; end if;
  insert into tentatives_suivi (cle, heure, echecs)
  values (k, date_trunc('hour', now()), 1)
  on conflict (cle, heure) do update set echecs = tentatives_suivi.echecs + 1;
  delete from tentatives_suivi where heure < now() - interval '6 hours';
end $$;

create or replace function public.suivre_demande(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d demandes; res jsonb;
begin
  if public.suivi_bloque(p_code) then
    return jsonb_build_object('bloque', true);
  end if;
  select * into d from demandes where upper(code) = upper(trim(p_code));
  if not found then
    perform public.suivi_echec(p_code);
    return null;
  end if;

  select jsonb_build_object(
    'code', d.code, 'niveau', d.niveau, 'statut', d.statut,
    'categories', d.categories, 'description', d.description,
    'created_at', d.created_at, 'escalade_le', d.escalade_le, 'resolu_le', d.resolu_le,
    'ville', (select nom_fr from villes where id = d.ville_id),
    'quartier', coalesce((select nom_fr from quartiers where id = d.quartier_id), d.quartier_libre),
    'lieu_texte', d.lieu_texte,
    'vus', (select count(*) from reponses r where r.demande_id = d.id),
    'reponses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', r.action, 'message', r.message, 'created_at', r.created_at,
        'pro_nom', p.nom, 'pro_type', p.type, 'pro_statut', p.statut,
        'pro_id', p.id, 'pro_demo', coalesce(p.demo, false),
        'pro_tel', case when r.action in ('en_route','appelle','whatsapp') then p.telephone else null end,
        'pro_whatsapp', case when r.action in ('en_route','appelle','whatsapp') then p.whatsapp else null end
      ) order by r.created_at)
      from reponses r left join professionnels p on p.id = r.pro_id
      where r.demande_id = d.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

create or replace function public.suivre_ordonnance(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o ordonnances; res jsonb;
begin
  if public.suivi_bloque(p_code) then
    return jsonb_build_object('bloque', true);
  end if;
  select * into o from ordonnances where upper(code) = upper(trim(p_code));
  if not found or o.masquee then
    perform public.suivi_echec(p_code);
    return null;
  end if;
  select jsonb_build_object(
    'code', o.code, 'statut', o.statut, 'created_at', o.created_at,
    'note', o.note, 'diffusion', o.diffusion, 'image_url', o.image_url,
    'ville', (select nom_fr from villes where id = o.ville_id),
    'reponses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'disponibilite', ro.disponibilite, 'prix_indicatif', ro.prix_indicatif,
        'livraison', ro.livraison, 'message', ro.message, 'created_at', ro.created_at,
        'pharmacie', p.nom, 'quartier', (select nom_fr from quartiers q where q.id = p.quartier_id),
        'tel', p.telephone, 'whatsapp', p.whatsapp, 'statut_pharmacie', p.statut, 'demo', p.demo
      ) order by ro.created_at)
      from reponses_ordonnance ro left join professionnels p on p.id = ro.pharmacie_id
      where ro.ordonnance_id = o.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Annulation par le patient (il connait son code).
create or replace function public.annuler_demande(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.suivi_bloque(p_code) then return false; end if;
  update demandes set statut = 'annule'
   where upper(code) = upper(trim(p_code)) and statut in ('nouveau','vu');
  if not found then perform public.suivi_echec(p_code); end if;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- 10. ESCALADE ET PROBATION (appelees par la tache planifiee Netlify)
-- ---------------------------------------------------------------------
create or replace function public.escalader_urgences(p_delai_minutes int default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int; delai int;
begin
  delai := coalesce(p_delai_minutes,
           (select (valeur->>'minutes')::int from reglages where cle = 'delai_escalade'), 15);
  with maj as (
    update demandes d set escalade_le = now()
     where d.niveau = 1
       and d.statut in ('nouveau','vu')
       and d.escalade_le is null
       and d.created_at < now() - make_interval(mins => delai)
    returning 1)
  select count(*) into n from maj;
  return n;
end $$;

create or replace function public.expirer_probations()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with maj as (
    update professionnels set statut = 'expire'
     where statut = 'provisoire' and probation_fin is not null and probation_fin < now()
       and service_officiel = false
    returning 1)
  select count(*) into n from maj;
  return n;
end $$;

-- Purge des medias et des donnees sensibles arrivees a echeance.
create or replace function public.purger_medias(p_jours int default null)
returns int language plpgsql security definer set search_path = public as $$
declare jours int; n int;
begin
  jours := coalesce(p_jours,
           (select (valeur->>'jours')::int from reglages where cle = 'retention_medias'), 30);
  with maj as (
    update ordonnances set image_url = null, vocal_url = null, statut = 'close'
     where created_at < now() - make_interval(days => jours)
       and (image_url is not null or vocal_url is not null)
    returning 1)
  select count(*) into n from maj;
  update demandes set vocal_url = null
   where created_at < now() - make_interval(days => jours) and vocal_url is not null;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 11. STATISTIQUES PUBLIQUES ANONYMISEES (tableau de transparence)
-- ---------------------------------------------------------------------
create or replace function public.stats_publiques(p_jours int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'periode_jours', p_jours,
    'total', (select count(*) from demandes where created_at > now() - make_interval(days => p_jours) and not demo),
    'pris_en_charge', (select count(*) from demandes where created_at > now() - make_interval(days => p_jours) and not demo and statut in ('pris_en_charge','resolu')),
    'delai_median_minutes', (
      select round(percentile_cont(0.5) within group (
        order by extract(epoch from (r.premiere - d.created_at))/60)::numeric, 0)
      from demandes d
      join lateral (select min(created_at) as premiere from reponses where demande_id = d.id) r on true
      where d.created_at > now() - make_interval(days => p_jours) and not d.demo and r.premiere is not null),
    'par_ville', coalesce((
      select jsonb_agg(x) from (
        select v.nom_fr as ville,
               count(*) as demandes,
               count(*) filter (where d.statut in ('pris_en_charge','resolu')) as prises_en_charge
        from demandes d join villes v on v.id = d.ville_id
        where d.created_at > now() - make_interval(days => p_jours) and not d.demo
        group by v.nom_fr order by count(*) desc limit 25) x), '[]'::jsonb),
    'pros_actifs', (select count(*) from professionnels where statut in ('provisoire','verifie') and not demo)
  )
$$;

-- ---------------------------------------------------------------------
-- 12. REGLAGES PAR DEFAUT
-- ---------------------------------------------------------------------
insert into reglages (cle, valeur) values
  ('delai_escalade',      '{"minutes": 15}'),
  ('retention_medias',    '{"jours": 30}'),
  ('probation_jours',     '{"jours": 45}'),
  ('transparence_active', 'true'),
  ('numeros_verifies_localement', 'false'),
  ('message_accueil',     '{"fr": "", "ar": ""}')
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------
-- 13. STOCKAGE (photos d'ordonnance + messages vocaux)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medias', 'medias', false, 3145728,
        array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg','audio/mpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728;

-- Le patient (anonyme) peut deposer un fichier, jamais le relire.
drop policy if exists "depot anonyme" on storage.objects;
create policy "depot anonyme" on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'medias');

-- Seuls les soignants actifs et les admins peuvent lire les medias.
drop policy if exists "lecture soignants" on storage.objects;
create policy "lecture soignants" on storage.objects for select
  to authenticated using (
    bucket_id = 'medias'
    and (public.est_admin() or public.mon_pro() is not null)
  );

drop policy if exists "menage admin" on storage.objects;
create policy "menage admin" on storage.objects for delete
  to authenticated using (bucket_id = 'medias' and public.est_admin());

-- ---------------------------------------------------------------------
-- 14. TEMPS REEL
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table demandes;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table reponses;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table ordonnances;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table reponses_ordonnance;
exception when duplicate_object then null; when others then null; end $$;

-- ---------------------------------------------------------------------
-- 15. GARDE-FOUS : personne ne peut se promouvoir soi-meme
-- ---------------------------------------------------------------------
-- Un professionnel peut modifier sa fiche, mais jamais son statut de
-- verification, sa probation, son caractere officiel ou son drapeau demo.
create or replace function public.proteger_statut_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est nul dans l'editeur SQL et avec la cle service_role :
  -- contexte serveur, deja privilegie. On ne bride que le navigateur,
  -- sinon les scripts d'installation seraient silencieusement annules.
  if auth.uid() is not null and not public.est_admin() then
    new.statut           := old.statut;
    new.probation_fin    := old.probation_fin;
    new.verifie_par      := old.verifie_par;
    new.verifie_le       := old.verifie_le;
    new.service_officiel := old.service_officiel;
    new.demo             := old.demo;
    new.note_admin       := old.note_admin;
    new.profil_id        := old.profil_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_pro on professionnels;
create trigger trg_proteger_pro before update on professionnels
  for each row execute function public.proteger_statut_pro();

-- Idem sur les profils : seul un super-admin distribue les roles.
create or replace function public.proteger_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Voir proteger_statut_pro : un contexte sans JWT est un contexte serveur.
  if auth.uid() is not null and not public.est_super_admin() then
    new.role        := old.role;
    new.province_id := old.province_id;
    new.ville_id    := old.ville_id;
    new.actif       := old.actif;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_role on profils;
create trigger trg_proteger_role before update on profils
  for each row execute function public.proteger_role();

-- A l'inscription, on force toujours le statut provisoire (45 jours).
create or replace function public.forcer_provisoire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Voir proteger_statut_pro : sans ce test, 02_donnees_geo.sql et
  -- 03_donnees_demo.sql seraient reecrits a l'insertion (services de
  -- secours degrades en fiches provisoires, drapeau demo efface).
  if auth.uid() is not null and not public.est_admin() then
    new.statut           := 'provisoire';
    new.service_officiel := false;
    new.demo             := false;
    new.verifie_le       := null;
    new.verifie_par      := null;
    new.probation_fin    := now() + make_interval(days =>
      coalesce((select (valeur->>'jours')::int from reglages where cle = 'probation_jours'), 45));
  end if;
  return new;
end $$;

drop trigger if exists trg_forcer_provisoire on professionnels;
create trigger trg_forcer_provisoire before insert on professionnels
  for each row execute function public.forcer_provisoire();

-- ---------------------------------------------------------------------
-- 16. SECURITE AU NIVEAU DES LIGNES (RLS)
-- ---------------------------------------------------------------------
alter table provinces           enable row level security;
alter table villes              enable row level security;
alter table quartiers           enable row level security;
alter table profils             enable row level security;
alter table professionnels      enable row level security;
alter table demandes            enable row level security;
alter table reponses            enable row level security;
alter table ordonnances         enable row level security;
alter table reponses_ordonnance enable row level security;
alter table signalements        enable row level security;
alter table reglages            enable row level security;
alter table numeros_urgence     enable row level security;
alter table journal_admin       enable row level security;

-- --- Geographie : lecture pour tous, ecriture pour les admins ---------
drop policy if exists geo_lecture_prov on provinces;
create policy geo_lecture_prov on provinces for select to anon, authenticated using (true);
drop policy if exists geo_ecriture_prov on provinces;
create policy geo_ecriture_prov on provinces for all to authenticated
  using (public.est_super_admin()) with check (public.est_super_admin());

drop policy if exists geo_lecture_villes on villes;
create policy geo_lecture_villes on villes for select to anon, authenticated using (true);
drop policy if exists geo_ecriture_villes on villes;
create policy geo_ecriture_villes on villes for all to authenticated
  using (public.admin_couvre(id, province_id)) with check (public.admin_couvre(id, province_id));

drop policy if exists geo_lecture_quartiers on quartiers;
create policy geo_lecture_quartiers on quartiers for select to anon, authenticated
  using (approuve or public.est_admin());
-- Un patient peut proposer un quartier manquant : il arrive non approuve.
drop policy if exists geo_suggestion on quartiers;
create policy geo_suggestion on quartiers for insert to anon, authenticated
  with check (approuve = false);
drop policy if exists geo_ecriture_quartiers on quartiers;
create policy geo_ecriture_quartiers on quartiers for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- --- Profils ---------------------------------------------------------
drop policy if exists profil_lecture on profils;
create policy profil_lecture on profils for select to authenticated
  using (id = auth.uid() or public.est_admin());
drop policy if exists profil_maj on profils;
create policy profil_maj on profils for update to authenticated
  using (id = auth.uid() or public.est_super_admin())
  with check (id = auth.uid() or public.est_super_admin());
drop policy if exists profil_insert on profils;
create policy profil_insert on profils for insert to authenticated
  with check (id = auth.uid() or public.est_super_admin());

-- --- Professionnels --------------------------------------------------
-- Public : les fiches provisoires ET verifiees sont visibles (c'est le
-- principe des 45 jours). Les fiches suspendues/refusees/expirees non.
drop policy if exists pro_lecture_publique on professionnels;
create policy pro_lecture_publique on professionnels for select to anon, authenticated
  using (statut in ('provisoire','verifie'));

drop policy if exists pro_lecture_privee on professionnels;
create policy pro_lecture_privee on professionnels for select to authenticated
  using (profil_id = auth.uid() or public.admin_couvre(ville_id, province_id));

drop policy if exists pro_creation on professionnels;
create policy pro_creation on professionnels for insert to authenticated
  with check (profil_id = auth.uid() or public.est_admin());

drop policy if exists pro_maj on professionnels;
create policy pro_maj on professionnels for update to authenticated
  using (profil_id = auth.uid() or public.admin_couvre(ville_id, province_id))
  with check (profil_id = auth.uid() or public.admin_couvre(ville_id, province_id));

drop policy if exists pro_suppression on professionnels;
create policy pro_suppression on professionnels for delete to authenticated
  using (public.est_super_admin());

-- --- Demandes d'aide -------------------------------------------------
-- Le patient depose sa demande sans compte ; le consentement est obligatoire.
drop policy if exists dem_depot on demandes;
create policy dem_depot on demandes for insert to anon, authenticated
  with check (consentement = true);

-- Un soignant actif voit les demandes de sa ville ; si l'urgence a ete
-- escaladee, toute la province la voit.
drop policy if exists dem_lecture_pro on demandes;
create policy dem_lecture_pro on demandes for select to authenticated
  using (
    public.admin_couvre(ville_id, province_id)
    or exists (
      select 1 from professionnels p
      where p.profil_id = auth.uid()
        and p.statut in ('provisoire','verifie')
        and (
          p.ville_id = demandes.ville_id
          or (demandes.escalade_le is not null and p.province_id = demandes.province_id)
        )
    )
  );

drop policy if exists dem_maj_admin on demandes;
create policy dem_maj_admin on demandes for update to authenticated
  using (public.admin_couvre(ville_id, province_id))
  with check (public.admin_couvre(ville_id, province_id));

-- --- Reponses des soignants -----------------------------------------
drop policy if exists rep_lecture on reponses;
-- Alignee exactement sur dem_lecture_pro : on ne doit pas pouvoir lire
-- les reponses d'une demande qu'on n'a pas le droit de voir.
create policy rep_lecture on reponses for select to authenticated
  using (
    public.est_admin()
    or exists (select 1 from demandes d where d.id = reponses.demande_id
               and exists (select 1 from professionnels p
                           where p.profil_id = auth.uid()
                             and p.statut in ('provisoire','verifie')
                             and (p.ville_id = d.ville_id
                                  or (d.escalade_le is not null and p.province_id = d.province_id))))
  );

drop policy if exists rep_depot on reponses;
create policy rep_depot on reponses for insert to authenticated
  with check (pro_id = public.mon_pro() or public.est_admin());

-- --- Ordonnances -----------------------------------------------------
drop policy if exists ord_depot on ordonnances;
create policy ord_depot on ordonnances for insert to anon, authenticated
  with check (consentement = true);

drop policy if exists ord_lecture on ordonnances;
create policy ord_lecture on ordonnances for select to authenticated
  using (
    public.admin_couvre(ville_id, province_id)
    or (masquee = false and exists (
          select 1 from professionnels p
          where p.profil_id = auth.uid()
            and p.type = 'pharmacie'
            and p.statut in ('provisoire','verifie')
            and (ordonnances.pharmacie_id = p.id
                 or (ordonnances.diffusion and p.ville_id = ordonnances.ville_id))))
  );

drop policy if exists ord_maj on ordonnances;
create policy ord_maj on ordonnances for update to authenticated
  using (public.admin_couvre(ville_id, province_id))
  with check (public.admin_couvre(ville_id, province_id));

drop policy if exists repord_lecture on reponses_ordonnance;
create policy repord_lecture on reponses_ordonnance for select to authenticated
  using (public.est_admin() or pharmacie_id = public.mon_pro());

drop policy if exists repord_depot on reponses_ordonnance;
create policy repord_depot on reponses_ordonnance for insert to authenticated
  with check (pharmacie_id = public.mon_pro());

-- --- Signalements : tout le monde peut signaler, seuls les admins lisent
drop policy if exists sig_depot on signalements;
create policy sig_depot on signalements for insert to anon, authenticated with check (true);
drop policy if exists sig_admin on signalements;
create policy sig_admin on signalements for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- --- Reglages et numeros d'urgence ----------------------------------
drop policy if exists reg_lecture on reglages;
create policy reg_lecture on reglages for select to anon, authenticated using (true);
drop policy if exists reg_ecriture on reglages;
create policy reg_ecriture on reglages for all to authenticated
  using (public.est_super_admin()) with check (public.est_super_admin());

drop policy if exists num_lecture on numeros_urgence;
create policy num_lecture on numeros_urgence for select to anon, authenticated
  using (actif or public.est_admin());
drop policy if exists num_ecriture on numeros_urgence;
create policy num_ecriture on numeros_urgence for all to authenticated
  using (public.admin_couvre(ville_id, province_id) or public.est_super_admin())
  with check (public.admin_couvre(ville_id, province_id) or public.est_super_admin());

-- --- Journal ---------------------------------------------------------
drop policy if exists journal_admin_pol on journal_admin;
create policy journal_admin_pol on journal_admin for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ---------------------------------------------------------------------
-- 17. DROITS D'EXECUTION DES FONCTIONS PUBLIQUES
-- ---------------------------------------------------------------------
-- Ces trois fonctions sont reservees aux taches planifiees. PostgreSQL
-- accorde EXECUTE a PUBLIC par defaut : il faut donc revoquer PUBLIC,
-- et non seulement anon (qui en est membre). Sans cela, n'importe qui
-- pourrait appeler purger_medias(0) et effacer toutes les pieces jointes.
revoke execute on function public.escalader_urgences(int) from public, anon, authenticated;
revoke execute on function public.expirer_probations()    from public, anon, authenticated;
revoke execute on function public.purger_medias(int)      from public, anon, authenticated;
grant  execute on function public.escalader_urgences(int) to service_role;
grant  execute on function public.expirer_probations()    to service_role;
grant  execute on function public.purger_medias(int)      to service_role;

grant execute on function public.suivre_demande(text)   to anon, authenticated;
grant execute on function public.suivre_ordonnance(text) to anon, authenticated;
grant execute on function public.annuler_demande(text)  to anon, authenticated;
grant execute on function public.stats_publiques(int)   to anon, authenticated;
revoke execute on function public.suivi_bloque(text) from public, anon, authenticated;
revoke execute on function public.suivi_echec(text)  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 18. LE NUMERO DU PATIENT
--     Promesse faite au patient a l'ecran : « seul le soignant qui
--     accepte votre demande peut voir votre numero ». On la tient dans
--     la base, pas seulement dans l'interface : les colonnes de contact
--     sont retirees a tout le monde, et rendues par une fonction qui
--     verifie l'engagement.
-- ---------------------------------------------------------------------
-- Attention : revoquer un droit de COLONNE est sans effet tant qu'un
-- droit de SELECT existe au niveau de la TABLE (et Supabase en accorde
-- un par defaut a anon et authenticated). Il faut donc retirer le droit
-- de table, puis le re-accorder colonne par colonne, en omettant celles
-- que l'on protege. service_role garde l'acces complet : les taches
-- planifiees en ont besoin.
do $$
declare colonnes text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into colonnes
    from information_schema.columns
   where table_schema = 'public' and table_name = 'demandes'
     and column_name not in ('contact_tel', 'contact_whatsapp');
  execute 'revoke select on public.demandes from anon, authenticated';
  execute format('grant select (%s) on public.demandes to anon, authenticated', colonnes);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into colonnes
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ordonnances'
     and column_name not in ('contact_tel');
  execute 'revoke select on public.ordonnances from anon, authenticated';
  execute format('grant select (%s) on public.ordonnances to anon, authenticated', colonnes);
end $$;

-- Rappel pour la maintenance : toute colonne ajoutee plus tard a ces
-- deux tables devra etre explicitement accordee ici, sinon elle restera
-- illisible depuis l'application.

create or replace function public.contact_demande(p_demande uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d demandes; autorise boolean;
begin
  select * into d from demandes where id = p_demande;
  if not found then return null; end if;

  autorise :=
    public.admin_couvre(d.ville_id, d.province_id)
    or exists (
      select 1 from reponses r
      where r.demande_id = p_demande
        and r.pro_id = public.mon_pro()
        and r.action in ('en_route','appelle','whatsapp')
    );

  if not autorise then return null; end if;
  return jsonb_build_object('tel', d.contact_tel, 'whatsapp', d.contact_whatsapp);
end $$;

create or replace function public.contact_ordonnance(p_ordonnance uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o ordonnances; autorise boolean;
begin
  select * into o from ordonnances where id = p_ordonnance;
  if not found then return null; end if;

  autorise :=
    public.admin_couvre(o.ville_id, o.province_id)
    or exists (
      select 1 from reponses_ordonnance r
      where r.ordonnance_id = p_ordonnance and r.pharmacie_id = public.mon_pro()
    );

  if not autorise then return null; end if;
  return jsonb_build_object('tel', o.contact_tel);
end $$;

grant execute on function public.contact_demande(uuid)    to authenticated;
grant execute on function public.contact_ordonnance(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 19. STATISTIQUES DU BACK-OFFICE
--     Une seule requete au lieu de onze : le tableau de bord se
--     rafraichit souvent, et chaque aller-retour coute cher en 2G.
--     Le perimetre de l'administrateur est applique ici.
-- ---------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr profils; res jsonb;
begin
  select * into pr from profils where id = auth.uid();
  if pr is null or pr.role not in ('admin_ville','admin_province','super_admin') or not pr.actif then
    return null;
  end if;

  with perimetre as (
    select pr.role as role, pr.ville_id as ville, pr.province_id as province
  ),
  dem as (
    select d.* from demandes d, perimetre p
     where p.role = 'super_admin'
        or (p.role = 'admin_province' and d.province_id is not distinct from p.province)
        or (p.role = 'admin_ville'    and d.ville_id    is not distinct from p.ville)
  ),
  pro as (
    select x.* from professionnels x, perimetre p
     where p.role = 'super_admin'
        or (p.role = 'admin_province' and x.province_id is not distinct from p.province)
        or (p.role = 'admin_ville'    and x.ville_id    is not distinct from p.ville)
  )
  select jsonb_build_object(
    'demandes_ouvertes',    (select count(*) from dem where statut in ('nouveau','vu')),
    'urgences_non_prises',  (select count(*) from dem where niveau = 1 and statut in ('nouveau','vu')),
    'escalades',            (select count(*) from dem where escalade_le is not null and statut in ('nouveau','vu')),
    'demandes_24h',         (select count(*) from dem where created_at > now() - interval '24 hours'),
    'pros_en_ligne',        (select count(*) from pro where en_ligne and statut in ('provisoire','verifie')),
    'pros_a_verifier',      (select count(*) from pro where statut = 'provisoire' and not service_officiel),
    'pros_expires',         (select count(*) from pro where statut = 'expire'),
    'services_sans_numero', (select count(*) from pro where service_officiel and telephone is null),
    'signalements_ouverts', (select count(*) from signalements where statut = 'ouvert'),
    'numeros_a_confirmer',  (select count(*) from numeros_urgence where actif and not verifie),
    'numeros_valides_localement',
      coalesce((select valeur = 'true'::jsonb from reglages where cle = 'numeros_verifies_localement'), false)
  ) into res;
  return res;
end $$;

grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 20. IDEMPOTENCE DES DONNEES PRE-CHARGEES
--     Sans ces index, relancer 02_donnees_geo.sql cree un deuxieme jeu
--     complet de commissariats, casernes et numeros d'urgence.
-- ---------------------------------------------------------------------
create unique index if not exists uq_pro_service_officiel
  on professionnels (ville_id, type, nom) where service_officiel;
create unique index if not exists uq_pro_demo
  on professionnels (ville_id, type, nom) where demo;
create unique index if not exists uq_numero_urgence
  on numeros_urgence (libelle_fr, coalesce(ville_id, 0));

select 'Etape 1/3 terminee. Lancez maintenant 02_donnees_geo.sql' as resultat;
