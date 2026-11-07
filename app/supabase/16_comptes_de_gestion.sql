-- =====================================================================
--  16. COMPTES DE GESTION PAR ADRESSE E-MAIL (novembre 2026)
--  Le super-administrateur cree les comptes institutionnels (programme
--  national, Ordres, autorites) depuis le back-office : la fonction
--  Netlify « comptes » cree l'utilisateur dans Supabase Auth (invitation
--  par e-mail ou mot de passe provisoire), puis attribue le role par
--  attribuer_role(), journalisee. Ici : l'adresse e-mail sur le profil,
--  pour la retrouver sans ouvrir Supabase, et le journal des envois.
--  Re-executable.
-- =====================================================================

alter table profils add column if not exists email text;

-- Le profil est cree automatiquement a chaque nouvel utilisateur Auth :
-- on y recopie l'adresse quand c'en est une vraie (les soignants inscrits
-- par numero ont une pseudo-adresse <numero>@tel.…, qu'on ignore).
create or replace function public.creer_profil_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, role, nom, telephone, email)
  values (
    new.id,
    'pro',
    coalesce(new.raw_user_meta_data->>'nom', ''),
    coalesce(new.raw_user_meta_data->>'telephone', new.phone, ''),
    case when new.email ~ '^[0-9]+@' then null else lower(new.email) end
  )
  on conflict (id) do update
    set email = coalesce(public.profils.email, excluded.email);
  return new;
end $$;

-- Reprise des comptes existants.
update profils p
   set email = lower(u.email)
  from auth.users u
 where u.id = p.id and p.email is null and u.email is not null and u.email !~ '^[0-9]+@';

-- La fonction Netlify renseigne l'adresse et le nom quand elle cree un
-- compte (cle service) ; le super-administrateur peut aussi corriger le
-- nom et l'adresse depuis l'ecran Equipe (politique profil_maj, deja
-- ouverte au super-administrateur).

-- Les envois (invitation, mot de passe provisoire, reinitialisation)
-- sont inscrits au journal par la fonction, avec le jeton de l'admin.
select (select count(*) from profils where email is not null) as profils_avec_email,
       (select count(*) from profils where role <> 'pro') as comptes_de_gestion;
