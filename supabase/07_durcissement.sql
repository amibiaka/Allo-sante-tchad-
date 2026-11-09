-- =====================================================================
--  Allo Sante Tchad — durcissement de securite
--  5 septembre 2026. Rejouable sans risque.
--
--  Contexte : 127 demandes, 10 ordonnances, 13 fichiers medicaux et
--  83 comptes reels sont deja en base. Ce script ferme des portes qui
--  etaient ouvertes ; il ne modifie aucune donnee patient.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. MEDIAS — LA FAILLE PRINCIPALE
--    Ancienne politique : « bucket = medias ET (admin OU soignant) ».
--    Autrement dit, n'importe quel soignant inscrit — et l'inscription
--    est ouverte sans mot de passe — pouvait telecharger TOUTES les
--    ordonnances et TOUS les messages vocaux du pays, y compris ceux
--    de villes ou il n'exerce pas.
--    Nouvelle regle : un fichier n'est lisible que s'il est rattache a
--    une demande ou une ordonnance que l'appelant a deja le droit de
--    voir. Les politiques de ces deux tables sont evaluees avec les
--    droits de l'appelant, donc la regle de zone (meme ville, ou meme
--    province si l'urgence a ete escaladee) s'applique d'elle-meme et
--    restera coherente si elle evolue un jour.
-- ---------------------------------------------------------------------
drop policy if exists "lecture soignants"   on storage.objects;
drop policy if exists "lecture medias lies" on storage.objects;
create policy "lecture medias lies" on storage.objects for select
  to authenticated using (
    bucket_id = 'medias'
    and (
      exists (select 1 from public.demandes d
               where d.vocal_url = storage.objects.name)
      or exists (select 1 from public.ordonnances o
                  where o.image_url = storage.objects.name
                     or o.vocal_url = storage.objects.name)
    )
  );

-- ---------------------------------------------------------------------
-- 2. DEPOT DE FICHIERS
--    Le depot anonyme acceptait n'importe quel nom, n'importe ou dans
--    le bucket. On le borne aux deux dossiers de l'application et a la
--    forme de nom que le client produit.
-- ---------------------------------------------------------------------
drop policy if exists "depot anonyme" on storage.objects;
create policy "depot anonyme" on storage.objects for insert
  to anon, authenticated with check (
    bucket_id = 'medias'
    and name ~ '^(ordonnances|vocaux)/[0-9]{10,17}-[a-z0-9]{1,12}\.(jpg|jpeg|png|webp|webm|m4a|ogg|mp3)$'
  );

-- ---------------------------------------------------------------------
-- 3. DEPOT DES DEMANDES ET ORDONNANCES
--    L'insertion directe par la cle publique laissait fixer n'importe
--    quelle colonne : statut, escalade, demo, code. L'application ne
--    s'en sert plus depuis le 25 aout, elle passe par creer_demande()
--    et creer_ordonnance(), qui valident le consentement et le niveau.
--    On ferme donc la porte directe.
-- ---------------------------------------------------------------------
drop policy if exists dem_depot on demandes;
drop policy if exists ord_depot on ordonnances;

-- ---------------------------------------------------------------------
-- 4. ANNUAIRE — FUITE DE NOTES INTERNES
--    « select=* » sur professionnels renvoyait note_admin, la note de
--    moderation ecrite par l'administration sur un soignant, ainsi que
--    verifie_par et profil_id. Lisible par quiconque avec la cle
--    publique. On passe a des droits colonne par colonne.
-- ---------------------------------------------------------------------
revoke select on public.professionnels from anon;
grant select (
  id, type, nom, specialite, province_id, ville_id, quartier_id,
  adresse_texte, telephone, whatsapp, telegram, horaires, lat, lng,
  statut, probation_fin, en_ligne, derniere_activite,
  service_officiel, numero_confirme, demo, created_at
) on public.professionnels to anon;

-- ---------------------------------------------------------------------
-- 5. DROITS DE BASE DE LA CLE PUBLIQUE
--    Par defaut Supabase accorde a « anon » tous les droits sur toutes
--    les tables : INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER. Seules les
--    politiques RLS empechaient d'en faire usage — une seule ligne de
--    defense. Et TRUNCATE n'est pas soumis aux politiques RLS.
--    On ne laisse que ce dont l'application a reellement besoin.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;

grant select on public.provinces        to anon;
grant select on public.villes           to anon;
grant select on public.quartiers        to anon;
grant select on public.numeros_urgence  to anon;
grant select on public.reglages         to anon;
grant insert on public.quartiers        to anon;   -- suggestion de quartier
grant select (
  id, type, nom, specialite, province_id, ville_id, quartier_id,
  adresse_texte, telephone, whatsapp, telegram, horaires, lat, lng,
  statut, probation_fin, en_ligne, derniere_activite,
  service_officiel, numero_confirme, demo, created_at
) on public.professionnels to anon;

-- Personne n'a besoin de vider une table depuis un navigateur.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. FONCTIONS EXPOSEES
--    PostgreSQL accorde EXECUTE a PUBLIC par defaut : les fonctions de
--    declencheur et les aides internes se retrouvaient au bout d'une
--    URL publique. Elles se defendaient toutes correctement, mais une
--    surface qu'on n'utilise pas est une surface qu'on ferme.
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- On accorde par nom, pas par signature : une signature mal recopiee
-- annulerait toute la transaction sans qu'on comprenne pourquoi.
do $$
declare f record;
  pour_anon text[] := array['creer_demande','creer_ordonnance','suivre_demande',
                            'suivre_ordonnance','annuler_demande','stats_publiques'];
  pour_connecte text[] := array['creer_demande','creer_ordonnance','suivre_demande',
                            'suivre_ordonnance','annuler_demande','stats_publiques',
                            'est_admin','est_super_admin','mon_role','mon_pro','mes_zones',
                            'admin_couvre','admin_stats','contact_demande','contact_ordonnance',
                            'pro_visible'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    if f.proname = any(pour_anon) then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
    if f.proname = any(pour_connecte) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. UN SOIGNANT NE SE DECERNE PAS SON PROPRE BADGE
--    Le declencheur protegeait deja statut, service_officiel, demo et
--    note_admin. Il manquait numero_confirme : un soignant pouvait
--    faire passer son propre numero pour « verifie » dans un annuaire
--    d'urgence.
-- ---------------------------------------------------------------------
create or replace function public.proteger_statut_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est nul dans l'editeur SQL et avec la cle service_role :
  -- contexte serveur, deja privilegie. On ne bride que le navigateur.
  if auth.uid() is not null and not public.est_admin() then
    new.statut           := old.statut;
    new.probation_fin    := old.probation_fin;
    new.verifie_par      := old.verifie_par;
    new.verifie_le       := old.verifie_le;
    new.service_officiel := old.service_officiel;
    new.numero_confirme  := old.numero_confirme;
    new.demo             := old.demo;
    new.note_admin       := old.note_admin;
    new.profil_id        := old.profil_id;
  end if;
  return new;
end $$;
-- Un create or replace remet EXECUTE a PUBLIC : on le retire.
revoke all on function public.proteger_statut_pro() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. LIMITE DE DEBIT SUR LES DEPOTS ANONYMES
--    Sans compte ni mot de passe, rien n'empechait un robot d'inonder
--    les soignants de fausses urgences. Dans un systeme d'alerte, le
--    bruit tue l'attention : c'est un probleme de securite, pas de
--    confort. Les seuils sont volontairement larges — bloquer une vraie
--    urgence serait pire que le spam.
-- ---------------------------------------------------------------------
create table if not exists limites_depot (
  cle   text        not null,
  heure timestamptz not null,
  n     int         not null default 0,
  primary key (cle, heure)
);
alter table limites_depot enable row level security;
-- Aucune politique : seule une fonction security definer y touche.
revoke all on public.limites_depot from anon, authenticated;

create or replace function public.limiter(p_cle text, p_max int)
returns void language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into limites_depot (cle, heure, n)
  values (p_cle, date_trunc('hour', now()), 1)
  on conflict (cle, heure) do update set n = limites_depot.n + 1
  returning limites_depot.n into c;

  delete from limites_depot where heure < now() - interval '6 hours';

  if c > p_max then
    raise exception 'Trop de depots depuis ce numero dans l''heure. Appelez directement un centre de sante.'
      using errcode = '54000';
  end if;
end $$;
revoke all on function public.limiter(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. APPLICATION DE LA LIMITE AUX DEUX PORTES D'ENTREE ANONYMES
--    Seuils larges a dessein : 10 depots par numero et par heure,
--    120 par ville et par heure pour les depots sans numero. Un
--    accident de la route genere une demande, pas dix.
-- ---------------------------------------------------------------------
create or replace function public.creer_demande(p jsonb)
returns table (code text, id uuid)
language plpgsql security definer set search_path = public, extensions
as $fn$
declare d demandes%rowtype; tel text;
begin
  if coalesce((p->>'consentement')::boolean, false) is not true then
    raise exception 'consentement requis' using errcode = '22023';
  end if;
  if (p->>'niveau') is null or (p->>'niveau')::int not between 1 and 4 then
    raise exception 'niveau invalide' using errcode = '22023';
  end if;

  tel := nullif(regexp_replace(coalesce(p->>'contact_tel',''), '[^0-9]', '', 'g'), '');
  if tel is not null then
    perform public.limiter('dem:tel:' || tel, 10);
  else
    perform public.limiter('dem:ville:' || coalesce(p->>'ville_id','0'), 120);
  end if;

  insert into demandes (
    pour_qui, niveau, categories, description, vocal_url, age_approx, sexe,
    province_id, ville_id, quartier_id, quartier_libre, ville_libre,
    lieu_texte, lat, lng, contact_tel, contact_whatsapp, contact_visible,
    consentement
  ) values (
    nullif(p->>'pour_qui', ''),
    (p->>'niveau')::smallint,
    coalesce((select array_agg(x) from jsonb_array_elements_text(
               case when jsonb_typeof(p->'categories') = 'array'
                    then p->'categories' else '[]'::jsonb end) x), '{}'),
    nullif(p->>'description', ''),
    nullif(p->>'vocal_url', ''),
    nullif(p->>'age_approx', ''),
    nullif(p->>'sexe', ''),
    (p->>'province_id')::int,
    (p->>'ville_id')::int,
    (p->>'quartier_id')::int,
    nullif(p->>'quartier_libre', ''),
    nullif(p->>'ville_libre', ''),
    nullif(p->>'lieu_texte', ''),
    (p->>'lat')::double precision,
    (p->>'lng')::double precision,
    nullif(p->>'contact_tel', ''),
    nullif(p->>'contact_whatsapp', ''),
    coalesce((p->>'contact_visible')::boolean, false),
    true
  ) returning * into d;

  return query select d.code, d.id;
end $fn$;

create or replace function public.creer_ordonnance(p jsonb)
returns table (code text, id uuid)
language plpgsql security definer set search_path = public, extensions
as $fn$
declare o ordonnances%rowtype; tel text;
begin
  if coalesce((p->>'consentement')::boolean, false) is not true then
    raise exception 'consentement requis' using errcode = '22023';
  end if;

  tel := nullif(regexp_replace(coalesce(p->>'contact_tel',''), '[^0-9]', '', 'g'), '');
  if tel is not null then
    perform public.limiter('ord:tel:' || tel, 10);
  else
    perform public.limiter('ord:ville:' || coalesce(p->>'ville_id','0'), 120);
  end if;

  insert into ordonnances (
    image_url, vocal_url, note, province_id, ville_id, quartier_id,
    quartier_libre, ville_libre, pharmacie_id, diffusion, contact_tel,
    livraison_souhaitee, consentement
  ) values (
    nullif(p->>'image_url', ''),
    nullif(p->>'vocal_url', ''),
    nullif(p->>'note', ''),
    (p->>'province_id')::int,
    (p->>'ville_id')::int,
    (p->>'quartier_id')::int,
    nullif(p->>'quartier_libre', ''),
    nullif(p->>'ville_libre', ''),
    nullif(p->>'pharmacie_id', '')::uuid,
    coalesce((p->>'diffusion')::boolean, true),
    nullif(p->>'contact_tel', ''),
    coalesce((p->>'livraison_souhaitee')::boolean, false),
    true
  ) returning * into o;

  return query select o.code, o.id;
end $fn$;

-- Un create or replace remet les droits par defaut : on les refixe.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname in ('creer_demande','creer_ordonnance')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. SUGGESTIONS DE QUARTIER
--     Porte anonyme elle aussi. On plafonne les suggestions non
--     approuvees par ville, pour qu'on ne puisse pas noyer le
--     back-office sous des milliers de lignes a trier.
-- ---------------------------------------------------------------------
create or replace function public.plafonner_suggestions() returns trigger
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if new.approuve is false then
    select count(*) into c from quartiers
     where ville_id = new.ville_id and approuve = false;
    if c >= 40 then
      raise exception 'trop de quartiers en attente pour cette ville' using errcode = '54000';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_plafonner_suggestions on quartiers;
create trigger trg_plafonner_suggestions before insert on quartiers
  for each row execute function public.plafonner_suggestions();
revoke all on function public.plafonner_suggestions() from public, anon, authenticated;

commit;
