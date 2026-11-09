-- =====================================================================
--  17. PILOTAGE ETENDU (novembre 2026)
--  1. Les Ordres (medecins, pharmaciens) gerent aussi les campagnes et
--     le territoire (regions, districts, formations, villes), comme le
--     programme national et l'autorite nationale.
--  2. Les regions (table provinces) se creent et se corrigent depuis
--     l'application ; jamais de suppression depuis un navigateur (une
--     region supprimee emporterait ses villes et leurs demandes).
--  3. L'entraide devient aussi un espace de partage de connaissances :
--     chaque fil porte un genre (question, partage d'experience,
--     protocole) ; tout soignant actif peut commenter un partage.
--  4. pilotage_resume() : les chiffres des tableaux de bord de pilotage
--     en un seul appel.
--  Re-executable.
-- =====================================================================

-- ---------------------------------------------------------------------
--  A. DROITS ETENDUS AUX ORDRES
-- ---------------------------------------------------------------------
create or replace function public.peut_gerer_campagnes() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','autorite_nationale','autorite_provinciale','centre_numerique',
                       'ordre_medecins','ordre_pharmaciens'))
$$;

create or replace function public.peut_gerer_referentiel() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','autorite_nationale','centre_numerique',
                       'ordre_medecins','ordre_pharmaciens'))
$$;

-- ---------------------------------------------------------------------
--  B. REGIONS (provinces) : creation et correction, pas de suppression
-- ---------------------------------------------------------------------
grant select, insert, update on provinces to authenticated;
revoke delete on provinces from authenticated;
revoke delete on villes    from authenticated;   -- cascade vers quartiers et demandes

drop policy if exists geo_ecriture_prov on provinces;
drop policy if exists geo_prov_insertion on provinces;
create policy geo_prov_insertion on provinces for insert to authenticated
  with check (public.peut_gerer_referentiel());
drop policy if exists geo_prov_maj on provinces;
create policy geo_prov_maj on provinces for update to authenticated
  using (public.peut_gerer_referentiel()) with check (public.peut_gerer_referentiel());

-- Un code court unique (3 lettres) est exige par l'application ; la base
-- le normalise en majuscules pour que deux saisies ne se heurtent pas.
create or replace function public.normaliser_province() returns trigger
language plpgsql as $$
begin
  new.code := upper(trim(new.code));
  if new.code !~ '^[A-Z0-9]{2,6}$' then
    raise exception 'CODE_REGION_INVALIDE' using hint = 'Deux a six lettres ou chiffres.';
  end if;
  new.nom_fr := trim(new.nom_fr);
  if new.ordre is null then new.ordre := 100; end if;
  return new;
end $$;
drop trigger if exists trg_normaliser_province on provinces;
create trigger trg_normaliser_province before insert or update on provinces
  for each row execute function public.normaliser_province();

-- ---------------------------------------------------------------------
--  C. ENTRAIDE : PARTAGE DE CONNAISSANCES
-- ---------------------------------------------------------------------
alter table entraide_cas add column if not exists genre text not null default 'question';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entraide_cas_genre_check') then
    alter table entraide_cas add constraint entraide_cas_genre_check
      check (genre in ('question','partage','protocole'));
  end if;
end $$;
create index if not exists idx_cas_genre on entraide_cas(genre, updated_at desc);

-- Un partage d'experience ou un protocole se commente par tout soignant
-- actif ; une question reste reservee aux medecins (et a son auteur).
drop policy if exists rep_cas_depot on entraide_reponses;
create policy rep_cas_depot on entraide_reponses for insert to authenticated
  with check (
    auteur_pro = public.mon_pro() and public.est_soignant_actif() and (
      public.est_medecin_actif()
      or exists (select 1 from entraide_cas c where c.id = cas_id
                   and (c.auteur_pro = public.mon_pro() or c.genre <> 'question'))
    ));

-- ---------------------------------------------------------------------
--  D. RESUME DE PILOTAGE
-- ---------------------------------------------------------------------
create or replace function public.pilotage_resume()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'comptes_gestion',     (select count(*) from profils where role::text <> 'pro' and actif),
    'comptes_inactifs',    (select count(*) from profils where role::text <> 'pro' and not actif),
    'provinces',           (select count(*) from provinces),
    'villes',              (select count(*) from villes),
    'quartiers_attente',   (select count(*) from quartiers where approuve = false),
    'districts',           (select count(*) from districts_sanitaires),
    'formations',          (select count(*) from formations_sanitaires),
    'a_valider',           (select count(*) from professionnels p where p.demo is not true and p.statut = 'provisoire'
                              and public.peut_valider(p.type, p.ville_id, p.province_id)),
    'soignants_verifies',  (select count(*) from professionnels p where p.demo is not true and p.statut = 'verifie'),
    'campagnes_actives',   (select count(*) from campagnes_vaccination c where c.demo is not true
                              and c.statut = 'publiee' and c.fin >= current_date),
    'campagnes_brouillons',(select count(*) from campagnes_vaccination c where c.demo is not true and c.statut = 'brouillon'),
    'publications',        (select count(*) from publications where demo is not true and publie
                              and (expire_le is null or expire_le > now())),
    'cas_ouverts',         (select count(*) from entraide_cas where demo is not true and statut = 'ouvert' and genre = 'question'),
    'partages',            (select count(*) from entraide_cas where demo is not true and genre <> 'question'),
    'evenements_nouveaux', (select count(*) from evenements_communautaires e where e.demo is not true and e.statut = 'nouveau'),
    'signalements_ouverts',(select count(*) from signalements where statut = 'ouvert'),
    'demandes_7j',         (select count(*) from demandes where demo is not true and created_at > now() - interval '7 days'),
    'journal_7j',          (select count(*) from journal_admin where created_at > now() - interval '7 days')
  ) where public.est_lecteur()
$$;

-- ---------------------------------------------------------------------
--  E. DROITS D'EXECUTION (par nom, comme dans les fichiers precedents)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pilotage_resume','normaliser_province')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname = 'pilotage_resume' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- Controle
select (select count(*) from pg_policies where tablename = 'provinces') as politiques_provinces,
       (select count(*) from pg_proc where proname = 'pilotage_resume') as pilotage_resume,
       (select count(*) from information_schema.columns where table_name = 'entraide_cas' and column_name = 'genre') as colonne_genre;
