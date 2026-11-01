-- =====================================================================
--  10. QUATRE FONCTIONNALITES (septembre 2026)
--  Applique en production le 13 septembre 2026. Ce fichier a ete
--  reconstitue le 1er novembre 2026 : la version appliquee n'avait pas
--  ete versee au depot. Re-executable (create or replace, if not exists).
--  En cas de doute, la base fait foi : comparer avec
--    select pg_get_functiondef('public.inscrire_donneur'::regproc);
--
--   1. Registre des donneurs de sang (inscription, retrait, compteur)
--   3. Veille syndromique et anomalies (lecture reservee aux autorites)
--   4. Releves de prix des medicaments et indice median
--  (la 2, procuration de sante, vit entierement dans le telephone)
-- =====================================================================

-- unaccent() n'est pas immutable : une colonne generee exige une
-- fonction immutable. On l'enveloppe. Definie en premier : la table
-- releves_prix s'en sert.
create extension if not exists unaccent;
create or replace function public.unaccent_immuable(t text)
returns text language sql immutable parallel safe strict
set search_path = public, pg_temp as $$
  select public.unaccent(t)
$$;

-- ---------------------------------------------------------------------
--  1. DONNEURS DE SANG
-- ---------------------------------------------------------------------
do $$ begin
  create type groupe_sanguin as enum ('O+','O-','A+','A-','B+','B-','AB+','AB-');
exception when duplicate_object then null; end $$;

create table if not exists donneurs_sang (
  id           uuid primary key default gen_random_uuid(),
  telephone    text not null unique,
  nom          text,
  groupe       groupe_sanguin not null,
  ville_id     int references villes(id),
  province_id  int references provinces(id),
  quartier_id  int references quartiers(id),
  code         text not null,                                 -- 2 lettres : retrait sans compte
  consentement boolean not null check (consentement = true),
  actif        boolean not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists idx_don_ville  on donneurs_sang(ville_id, groupe) where actif;

alter table donneurs_sang enable row level security;
revoke all on donneurs_sang from anon, authenticated;
grant select, update on donneurs_sang to authenticated;
drop policy if exists don_lecture_admin on donneurs_sang;
create policy don_lecture_admin on donneurs_sang for select to authenticated
  using (public.admin_couvre(ville_id, province_id));
drop policy if exists don_maj_admin on donneurs_sang;
create policy don_maj_admin on donneurs_sang for update to authenticated
  using (public.admin_couvre(ville_id, province_id)) with check (public.admin_couvre(ville_id, province_id));

create or replace function public.inscrire_donneur(
  p_telephone text, p_groupe text, p_ville_code text, p_nom text default null, p_quartier_id int default null
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tel text; v_ville int; v_prov int; v_code text;
begin
  v_tel := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
  if length(v_tel) < 8 then raise exception 'telephone invalide'; end if;
  select id, province_id into v_ville, v_prov from villes where code = p_ville_code;
  if v_ville is null then raise exception 'ville inconnue'; end if;
  perform public.limiter('donneur_tel:' || v_tel, 3);
  perform public.limiter('donneur_ville:' || v_ville::text, 200);
  v_code := upper(substr(translate(encode(gen_random_bytes(3), 'hex'), '0o1il', 'XYZWV'), 1, 2));
  insert into donneurs_sang (telephone, nom, groupe, ville_id, province_id, quartier_id, code, consentement, actif)
  values (v_tel, left(p_nom, 80), p_groupe::groupe_sanguin, v_ville, v_prov, p_quartier_id, v_code, true, true)
  on conflict (telephone) do update
    set nom = coalesce(excluded.nom, donneurs_sang.nom), groupe = excluded.groupe,
        ville_id = excluded.ville_id, province_id = excluded.province_id, quartier_id = excluded.quartier_id,
        code = excluded.code, actif = true, updated_at = now();
  return v_code;
end $$;

create or replace function public.retirer_donneur(p_telephone text, p_code text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tel text;
begin
  v_tel := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
  perform public.limiter('donneur_retrait:' || v_tel, 10);
  update donneurs_sang set actif = false, updated_at = now()
   where telephone = v_tel and upper(code) = upper(coalesce(p_code, '')) and actif;
  return found;
end $$;

create or replace function public.compteur_donneurs(p_ville_code text default null)
returns table (ville_code text, nombre bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.code, count(d.id)::bigint
    from villes v left join donneurs_sang d on d.ville_id = v.id and d.actif
   where p_ville_code is null or v.code = p_ville_code
   group by v.code
$$;

-- ---------------------------------------------------------------------
--  4. RELEVES DE PRIX DES MEDICAMENTS
-- ---------------------------------------------------------------------
create table if not exists releves_prix (
  id             bigserial primary key,
  pharmacie_id   uuid references professionnels(id),
  ordonnance_id  uuid references ordonnances(id) on delete set null,
  ville_id       int references villes(id),
  medicament     text not null check (length(medicament) between 2 and 120),
  medicament_cle text generated always as (lower(regexp_replace(public.unaccent_immuable(medicament), '\s+', ' ', 'g'))) stored,
  prix_fcfa      int not null check (prix_fcfa between 0 and 10000000),
  conditionnement text,
  created_at     timestamptz default now()
);
create index if not exists idx_prix_cle on releves_prix(ville_id, medicament_cle, created_at desc);

alter table releves_prix enable row level security;
revoke all on releves_prix from anon, authenticated;
grant select, insert on releves_prix to authenticated;
drop policy if exists prix_depot on releves_prix;
create policy prix_depot on releves_prix for insert to authenticated
  with check (pharmacie_id = public.mon_pro());
drop policy if exists prix_lecture on releves_prix;
create policy prix_lecture on releves_prix for select to authenticated
  using (pharmacie_id = public.mon_pro() or public.est_admin());

-- Indice median par medicament et par ville : jamais moins de trois
-- releves, pour ne publier ni un prix isole ni celui d'une pharmacie.
create or replace function public.indice_prix(p_ville_id int, p_recherche text, p_jours int default 90)
returns table (medicament text, releves bigint, prix_median numeric, prix_min int, prix_max int)
language sql stable security definer set search_path = public, pg_temp as $$
  select mode() within group (order by r.medicament),
         count(*)::bigint,
         round(percentile_cont(0.5) within group (order by r.prix_fcfa)::numeric, 0),
         min(r.prix_fcfa), max(r.prix_fcfa)
    from releves_prix r
   where (p_ville_id is null or r.ville_id = p_ville_id)
     and r.created_at > now() - make_interval(days => greatest(coalesce(p_jours, 90), 1))
     and (p_recherche is null or r.medicament_cle like '%' || lower(public.unaccent_immuable(p_recherche)) || '%')
   group by r.medicament_cle
  having count(*) >= 3
   order by 2 desc
   limit 50
$$;

-- ---------------------------------------------------------------------
--  3. VEILLE SYNDROMIQUE (version du 13 septembre ; 12_ l'etend aux
--     institutions et la remplace)
-- ---------------------------------------------------------------------
create or replace function public.veille_syndromique(p_jours int default 30)
returns table (jour date, ville_id int, categorie text, niveau smallint, nombre bigint)
language sql stable security definer set search_path = public, pg_temp as $fn$
  select (d.created_at at time zone 'UTC')::date, d.ville_id, c, d.niveau, count(*)::bigint
    from public.demandes d
    cross join lateral unnest(case when cardinality(d.categories) = 0 then array['non_precise'] else d.categories end) as c
   where d.demo is not true
     and d.created_at > now() - make_interval(days => greatest(p_jours, 1))
     and public.est_admin()
     and public.admin_couvre(d.ville_id, d.province_id)
   group by 1, 2, 3, 4
   order by 1 desc, 5 desc;
$fn$;

create or replace function public.veille_anomalies()
returns table (ville_id int, categorie text, semaine bigint, moyenne_4sem numeric, rapport numeric)
language sql stable security definer set search_path = public, pg_temp as $fn$
  with base as (
    select d.ville_id, c as categorie, d.created_at
      from public.demandes d
      cross join lateral unnest(case when cardinality(d.categories) = 0 then array['non_precise'] else d.categories end) as c
     where d.demo is not true
       and d.created_at > now() - interval '35 days'
       and public.est_admin()
       and public.admin_couvre(d.ville_id, d.province_id)
  ), agg as (
    select ville_id, categorie,
           count(*) filter (where created_at > now() - interval '7 days')  as semaine,
           count(*) filter (where created_at <= now() - interval '7 days') / 4.0 as moyenne_4sem
      from base group by 1, 2
  )
  select ville_id, categorie, semaine, round(moyenne_4sem, 2),
         round(case when moyenne_4sem > 0 then semaine / moyenne_4sem else null end, 2)
    from agg
   where semaine >= 5 and moyenne_4sem > 0 and semaine / moyenne_4sem >= 2
   order by 5 desc nulls last;
$fn$;

-- ---------------------------------------------------------------------
--  DROITS. Le durcissement du 5 septembre a retire EXECUTE a PUBLIC, et
--  PostgreSQL le redonne a chaque fonction neuve : on referme, puis on
--  ouvre par nom. Note du 13 septembre : « revoke from public » ne
--  retire pas le droit que Supabase accorde explicitement a anon ; il
--  faut aussi « from anon ».
-- ---------------------------------------------------------------------
revoke execute on function public.inscrire_donneur(text, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.retirer_donneur(text, text)                        from public, anon, authenticated;
revoke execute on function public.compteur_donneurs(text)                            from public, anon, authenticated;
revoke execute on function public.indice_prix(int, text, int)                        from public, anon, authenticated;
revoke execute on function public.veille_syndromique(int)                            from public, anon, authenticated;
revoke execute on function public.veille_anomalies()                                 from public, anon, authenticated;
revoke execute on function public.unaccent_immuable(text)                            from public, anon, authenticated;

grant execute on function public.inscrire_donneur(text, text, text, text, int) to anon, authenticated;
grant execute on function public.retirer_donneur(text, text)                        to anon, authenticated;
grant execute on function public.compteur_donneurs(text)                            to anon, authenticated;
grant execute on function public.indice_prix(int, text, int)                        to anon, authenticated;
grant execute on function public.unaccent_immuable(text)                            to anon, authenticated;
grant execute on function public.veille_syndromique(int) to authenticated;
grant execute on function public.veille_anomalies()      to authenticated;

select (select count(*) from donneurs_sang) as donneurs,
       (select count(*) from releves_prix)  as releves,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('inscrire_donneur','retirer_donneur','compteur_donneurs',
               'indice_prix','veille_syndromique','veille_anomalies','unaccent_immuable')) as fonctions_7;
