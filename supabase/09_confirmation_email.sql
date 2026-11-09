-- =====================================================================
--  Allo Sante Tchad — confirmation du compte soignant par courriel
--  5 septembre 2026. Rejouable sans risque.
--
--  A executer AVANT d'activer « Confirm email » dans Supabase, et
--  seulement une fois un vrai expediteur SMTP configure : le service
--  integre est limite a 2 messages par heure et bloquerait la 3e
--  inscription de la journee.
--
--  Probleme resolu : quand la confirmation est active, l'inscription ne
--  renvoie pas de session. Le navigateur ne peut donc pas creer la fiche
--  du soignant — il n'a aucun droit tant que le compte n'est pas
--  confirme. La fiche est desormais creee par la base, au moment ou le
--  compte est confirme, a partir des informations deposees a
--  l'inscription. Consequence utile : confirmer depuis un autre appareil
--  fonctionne aussi.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Creation de la fiche a partir des metadonnees d'inscription
-- ---------------------------------------------------------------------
create or replace function public.creer_pro_depuis_metadonnees(p_uid uuid, m jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v villes%rowtype; qid int; tel text; t_pro text;
begin
  -- Un compte cree sans les champs du formulaire (un administrateur, par
  -- exemple) ne doit pas fabriquer de fiche vide dans l'annuaire.
  t_pro := nullif(m->>'type', '');
  if t_pro is null or coalesce(m->>'nom', '') = '' then return; end if;
  if not exists (select 1 from pg_enum e join pg_type y on y.oid = e.enumtypid
                  where y.typname = 'type_pro' and e.enumlabel = t_pro) then return; end if;
  if exists (select 1 from professionnels where profil_id = p_uid) then return; end if;

  select * into v from villes where code = nullif(m->>'ville_code', '');
  if v.id is not null and coalesce(m->>'quartier_nom', '') <> '' then
    select id into qid from quartiers
     where ville_id = v.id and lower(nom_fr) = lower(m->>'quartier_nom')
     limit 1;
  end if;

  tel := regexp_replace(coalesce(m->>'telephone', ''), '[^0-9]', '', 'g');

  insert into professionnels (
    profil_id, type, nom, specialite, province_id, ville_id, quartier_id,
    adresse_texte, telephone, whatsapp, horaires,
    en_ligne, derniere_activite, lat, lng
  ) values (
    p_uid, t_pro::type_pro, m->>'nom', nullif(m->>'specialite', ''),
    v.province_id, v.id, qid, nullif(m->>'adresse', ''),
    '+235' || tel,
    coalesce(nullif(m->>'whatsapp', ''), '+235' || tel),
    nullif(m->>'horaires', ''),
    true, now(), v.lat, v.lng
  );
end $$;
revoke all on function public.creer_pro_depuis_metadonnees(uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Pourquoi l'inscription n'est pas touchee
-- ---------------------------------------------------------------------
-- creer_profil_auto n'est PAS touchee, et c'est volontaire. Tant que la
-- confirmation est desactivee, Supabase marque le compte confirme des
-- l'insertion : si ce declencheur creait la fiche, le navigateur — qui
-- recoit une session — en creerait une seconde dans la foulee. La fiche
-- n'est donc creee ici QUE sur le passage de non confirme a confirme,
-- c'est-a-dire exactement quand le navigateur ne peut pas le faire.

-- ---------------------------------------------------------------------
-- 3. A la confirmation : on cree le profil et la fiche.
-- ---------------------------------------------------------------------
create or replace function public.pro_apres_confirmation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    insert into public.profils (id, role, nom, telephone)
    values (new.id, 'pro',
            coalesce(new.raw_user_meta_data->>'nom', ''),
            coalesce(new.raw_user_meta_data->>'telephone', new.phone, ''))
    on conflict (id) do nothing;

    perform public.creer_pro_depuis_metadonnees(new.id, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  end if;
  return new;
end $$;
revoke all on function public.pro_apres_confirmation() from public, anon, authenticated;

drop trigger if exists trg_pro_confirme on auth.users;
create trigger trg_pro_confirme after update on auth.users
  for each row execute function public.pro_apres_confirmation();

commit;
