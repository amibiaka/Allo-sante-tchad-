-- =====================================================================
--  10. QUATRE FONCTIONNALITES (septembre 2026)
--  Applique en production le 13 septembre 2026. Ce fichier a ete
--  reconstitue le 1er novembre 2026 puis realigne sur la base de
--  production le 7 novembre (tables donneurs_sang et releves_prix,
--  quatre fonctions relues depuis pg_get_functiondef). Re-executable.
--
--   1. Registre des donneurs de sang (inscription, retrait, compteur)
--   3. Veille syndromique et anomalies (lecture reservee aux autorites)
--   4. Releves de prix des medicaments et indice median
--  (la 2, procuration de sante, vit entierement dans le telephone)
-- =====================================================================

-- Les accents sont retires par une simple table de correspondance :
-- immutable (donc utilisable dans un index), sans extension.
create or replace function public.unaccent_immuable(t text)
returns text language sql immutable parallel safe strict
set search_path = pg_catalog, pg_temp as $$
  select translate(
    $1,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );
$$;

-- ---------------------------------------------------------------------
--  1. DONNEURS DE SANG
-- ---------------------------------------------------------------------
do $$ begin
  create type groupe_sanguin as enum ('A+','A-','B+','B-','AB+','AB-','O+','O-','inconnu');
exception when duplicate_object then null; end $$;

create table if not exists donneurs_sang (
  id           uuid primary key default gen_random_uuid(),
  telephone    text not null unique,
  nom          text,
  groupe       groupe_sanguin not null default 'inconnu',
  province_id  int references provinces(id),
  ville_id     int references villes(id),
  quartier_id  int references quartiers(id),
  code         text not null,                                 -- 2 lettres : retrait sans compte
  disponible   boolean not null default true,
  dernier_don  date,
  consentement boolean not null check (consentement = true),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_don_ville  on donneurs_sang(ville_id, groupe) where disponible;

alter table donneurs_sang enable row level security;
revoke all on donneurs_sang from anon, authenticated;
grant select, update on donneurs_sang to authenticated;
drop policy if exists don_lecture_admin on donneurs_sang;
create policy don_lecture_admin on donneurs_sang for select to authenticated
  using (public.est_admin() and public.admin_couvre(ville_id, province_id));
drop policy if exists don_maj_admin on donneurs_sang;
create policy don_maj_admin on donneurs_sang for update to authenticated
  using (public.est_admin() and public.admin_couvre(ville_id, province_id));

create or replace function public.inscrire_donneur(
  p_telephone text, p_groupe text, p_ville_code text, p_nom text default null, p_quartier_id int default null
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tel   text := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
  v_code  text;
  v_grp   groupe_sanguin;
  v_ville int;
  v_prov  int;
begin
  if length(v_tel) < 8 then
    raise exception 'Numero de telephone invalide' using errcode = '22023';
  end if;

  -- La ville est designee par son code, pas par son identifiant : le
  -- navigateur travaille sur une copie de la geographie qui peut dater,
  -- la base fait foi. La province se deduit, l'appelant ne la fournit pas.
  select v.id, v.province_id into v_ville, v_prov
    from public.villes v where v.code = p_ville_code;
  if v_ville is null then
    raise exception 'Ville inconnue' using errcode = '22023';
  end if;

  -- Meme garde-fou que les demandes : un numero ne doit pas s'inscrire en
  -- boucle. Seuils larges a dessein.
  perform public.limiter('donneur_tel:' || v_tel, 3);
  perform public.limiter('donneur_ville:' || v_ville::text, 200);

  begin
    v_grp := coalesce(nullif(p_groupe, ''), 'inconnu')::groupe_sanguin;
  exception when others then
    v_grp := 'inconnu';
  end;

  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 2));

  insert into public.donneurs_sang
    (telephone, nom, groupe, province_id, ville_id, quartier_id, code, consentement)
  values
    (v_tel, nullif(trim(coalesce(p_nom, '')), ''), v_grp,
     v_prov, v_ville, p_quartier_id, v_code, true)
  on conflict (telephone) do update set
    nom         = coalesce(excluded.nom, public.donneurs_sang.nom),
    groupe      = excluded.groupe,
    province_id = excluded.province_id,
    ville_id    = excluded.ville_id,
    quartier_id = excluded.quartier_id,
    disponible  = true,
    updated_at  = now()
  returning code into v_code;

  -- On ne rend que le code de retrait. Jamais l'identifiant, jamais la
  -- ligne : l'appelant est anonyme.
  return v_code;
end $$;

create or replace function public.retirer_donneur(p_telephone text, p_code text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tel text := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
  v_n   int;
begin
  perform public.limiter('retrait_donneur:' || v_tel, 10);
  delete from public.donneurs_sang
   where telephone = v_tel
     and upper(code) = upper(coalesce(p_code, ''));
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

create or replace function public.compteur_donneurs(p_ville_code text default null)
returns table (ville_code text, nombre bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.code, count(*)::bigint
    from public.donneurs_sang d
    join public.villes v on v.id = d.ville_id
   where d.disponible
     and (p_ville_code is null or v.code = p_ville_code)
   group by v.code;
$$;

-- ---------------------------------------------------------------------
--  4. RELEVES DE PRIX DES MEDICAMENTS
--  medicament_cle (minuscules, sans accents, espaces simples) est une
--  colonne generee : on ne l'ecrit jamais.
-- ---------------------------------------------------------------------
create table if not exists releves_prix (
  id             uuid primary key default gen_random_uuid(),
  ordonnance_id  uuid references ordonnances(id) on delete set null,
  pharmacie_id   uuid not null references professionnels(id),
  ville_id       int references villes(id),
  medicament     text not null,
  medicament_cle text generated always as (lower(regexp_replace(public.unaccent_immuable(medicament), '\s+', ' ', 'g'))) stored,
  prix_fcfa      int,
  disponible     boolean,
  created_at     timestamptz not null default now()
);
create index if not exists idx_prix_cle on releves_prix(ville_id, medicament_cle, created_at desc);

alter table releves_prix enable row level security;
revoke all on releves_prix from anon, authenticated;
grant select, insert on releves_prix to authenticated;
drop policy if exists prix_depot on releves_prix;
create policy prix_depot on releves_prix for insert to authenticated
  with check (pharmacie_id = public.mon_pro());
drop policy if exists prix_lecture_pro on releves_prix;
create policy prix_lecture_pro on releves_prix for select to authenticated
  using (pharmacie_id = public.mon_pro() or public.est_admin());

-- Indice median par medicament et par ville : jamais moins de trois
-- releves, pour ne publier ni un prix isole ni celui d'une pharmacie.
create or replace function public.indice_prix(p_ville_id int default null, p_recherche text default null, p_jours int default 180)
returns table (medicament text, ville_id int, releves bigint, median numeric, bas int, haut int, dernier timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select
      -- L'orthographe la plus frequente plutot que la premiere par ordre
      -- alphabetique : c'est celle que les gens reconnaitront.
      mode() within group (order by r.medicament)           as medicament,
      r.ville_id,
      count(*)::bigint                                      as releves,
      percentile_cont(0.5) within group (order by r.prix_fcfa) as median,
      min(r.prix_fcfa)                                      as bas,
      max(r.prix_fcfa)                                      as haut,
      max(r.created_at)                                     as dernier
    from public.releves_prix r
   where r.prix_fcfa is not null
     and r.created_at > now() - make_interval(days => greatest(p_jours, 1))
     and (p_ville_id is null or r.ville_id = p_ville_id)
     and (p_recherche is null or r.medicament_cle like '%' ||
          lower(regexp_replace(unaccent_immuable(p_recherche), '\s+', ' ', 'g')) || '%')
   group by r.medicament_cle, r.ville_id
  having count(*) >= 3
   order by count(*) desc
   limit 200;
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
