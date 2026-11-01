-- =====================================================================
--  12. PROGRAMMES ET INSTITUTIONS
--  A executer APRES 12a_roles_institutionnels.sql. Re-executable.
--
--  Ce fichier ajoute quatre choses a la base :
--
--   A. La gouvernance institutionnelle : qui peut valider un soignant,
--      publier une directive, gerer une campagne, attribuer des roles.
--      Chaque decision passe par une fonction qui verifie le role de
--      l'appelant et inscrit la decision au journal.
--   B. Les publications : actualites vaccinales pour les familles,
--      directives pour les soignants, alertes sanitaires.
--   C. La vaccination : campagnes gerees par les autorites, et un
--      comptage anonyme des doses que les familles acceptent de
--      declarer. Le carnet lui-meme reste sur le telephone : aucun nom
--      d'enfant, aucune date de naissance ne sont stockes ici.
--   D. L'entraide entre soignants (un agent isole demande conseil, un
--      medecin repond) et le signalement communautaire d'evenements
--      sanitaires (plusieurs malades, deces inhabituels...), qui alimente
--      la veille.
--
--  Regle de droits, apprise le 13 septembre : Supabase accorde par
--  defaut tous les droits a anon et authenticated sur toute table neuve
--  et EXECUTE a public sur toute fonction neuve. On referme donc tout,
--  puis on ouvre par nom, pour chaque objet de ce fichier.
-- =====================================================================

-- ---------------------------------------------------------------------
--  A. GOUVERNANCE
-- ---------------------------------------------------------------------

-- Roles qui voient le back-office sans etre des administrateurs
-- operationnels. est_admin() ne change pas : les ecrans existants
-- (demandes, moderation, numeros) restent reserves aux admins.
create or replace function public.est_institution() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('autorite_nationale','autorite_provinciale','ordre_medecins',
                       'ordre_pharmaciens','centre_numerique'))
$$;

-- Lecture etendue : administrateurs + institutions. Sert aux ecrans de
-- lecture (veille, soignants a valider, journal).
create or replace function public.est_lecteur() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin() or public.est_institution()
$$;

-- Perimetre d'une autorite : le national voit tout, le provincial sa
-- province. Les ordres et le centre numerique sont nationaux par nature.
create or replace function public.institution_couvre(p_province int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profils pr where pr.id = auth.uid() and pr.actif and (
      pr.role::text in ('autorite_nationale','ordre_medecins','ordre_pharmaciens','centre_numerique','super_admin')
      or (pr.role::text = 'autorite_provinciale' and pr.province_id is not distinct from p_province)
    ))
$$;

-- Quels types de soignants un role peut-il valider ?
--   ordre_medecins     : medecins
--   ordre_pharmaciens  : pharmacies
--   autorites          : infirmiers, sages-femmes, centres de sante
--                        (les agents du systeme public)
--   administrateurs    : tous, comme aujourd'hui (perimetre admin_couvre)
create or replace function public.peut_valider(p_type type_pro, p_ville int, p_province int)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.admin_couvre(p_ville, p_province)
    or exists (
      select 1 from profils pr where pr.id = auth.uid() and pr.actif and (
        (pr.role::text = 'ordre_medecins'    and p_type = 'medecin')
        or (pr.role::text = 'ordre_pharmaciens' and p_type = 'pharmacie')
        or (pr.role::text = 'autorite_nationale' and p_type in ('infirmier','sage_femme','centre_sante'))
        or (pr.role::text = 'autorite_provinciale' and p_type in ('infirmier','sage_femme','centre_sante')
            and pr.province_id is not distinct from p_province)
      ))
$$;

create or replace function public.peut_publier() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','autorite_nationale','autorite_provinciale',
                       'ordre_medecins','ordre_pharmaciens','centre_numerique'))
$$;

create or replace function public.peut_gerer_campagnes() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','autorite_nationale','autorite_provinciale'))
$$;

-- Attribution des roles : le super-administrateur et le centre numerique.
create or replace function public.peut_attribuer_roles() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','centre_numerique'))
$$;

-- Les institutions lisent les fiches de soignants qu'elles peuvent valider
-- (y compris les colonnes privees : note, verifie_le). Politique ajoutee
-- a cote de pro_lecture_privee, qui ne bouge pas.
drop policy if exists pro_lecture_institution on professionnels;
create policy pro_lecture_institution on professionnels for select to authenticated
  using (public.peut_valider(type, ville_id, province_id) or public.est_institution());

-- Les institutions voient aussi les profils (pour l'equipe et le journal)
drop policy if exists profil_lecture_institution on profils;
create policy profil_lecture_institution on profils for select to authenticated
  using (public.est_institution());

-- Le centre numerique attribue les roles, comme le super-administrateur.
drop policy if exists profil_maj_centre on profils;
create policy profil_maj_centre on profils for update to authenticated
  using (public.peut_attribuer_roles()) with check (public.peut_attribuer_roles());

-- Le journal est lisible par toutes les institutions (transparence des
-- decisions), ecrit par les fonctions.
drop policy if exists journal_lecture_institution on journal_admin;
create policy journal_lecture_institution on journal_admin for select to authenticated
  using (public.est_institution());

-- Decision sur un soignant : verifie, suspendu, refuse, ou prolonge.
-- Une seule porte, journalisee. Le declencheur proteger_statut_pro()
-- interdit a un non-admin de changer le statut ; il doit laisser passer
-- cette fonction (security definer, mais auth.uid() reste celui de
-- l'appelant). On ouvre une porte explicite : un drapeau de transaction.
create or replace function public.proteger_statut_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Porte ouverte par valider_professionnel() le temps de sa transaction.
  if current_setting('afiya.validation_en_cours', true) = '1' then return new; end if;
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

create or replace function public.valider_professionnel(p_id uuid, p_decision text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare pro professionnels%rowtype;
begin
  select * into pro from professionnels where id = p_id;
  if not found then return false; end if;
  if not public.peut_valider(pro.type, pro.ville_id, pro.province_id) then
    raise exception 'HORS_PERIMETRE' using errcode = '42501';
  end if;
  if p_decision not in ('verifie','suspendu','refuse','prolonge') then
    raise exception 'decision inconnue';
  end if;
  perform set_config('afiya.validation_en_cours', '1', true);
  if p_decision = 'prolonge' then
    update professionnels
       set statut = 'provisoire', probation_fin = greatest(coalesce(probation_fin, now()), now()) + interval '45 days',
           note_admin = coalesce(p_note, note_admin), updated_at = now()
     where id = p_id;
  else
    update professionnels
       set statut = p_decision::statut_pro, verifie_par = auth.uid(), verifie_le = now(),
           note_admin = coalesce(p_note, note_admin), updated_at = now()
     where id = p_id;
  end if;
  perform set_config('afiya.validation_en_cours', '0', true);
  insert into journal_admin (admin_id, action, cible_type, cible_id, detail)
  values (auth.uid(), 'validation:' || p_decision, 'professionnel', p_id::text,
          jsonb_build_object('type', pro.type, 'nom', pro.nom, 'note', p_note));
  return true;
end $$;

-- Attribution d'un role institutionnel (ou retour a 'pro').
create or replace function public.attribuer_role(p_profil uuid, p_role text, p_province int default null, p_ville int default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.peut_attribuer_roles() then raise exception 'HORS_PERIMETRE' using errcode = '42501'; end if;
  if p_profil = auth.uid() then raise exception 'on ne change pas son propre role'; end if;
  perform set_config('afiya.validation_en_cours', '1', true);
  update profils set role = p_role::role_utilisateur,
         province_id = case when p_role in ('admin_province','autorite_provinciale') then p_province else null end,
         ville_id    = case when p_role = 'admin_ville' then p_ville else null end
   where id = p_profil;
  perform set_config('afiya.validation_en_cours', '0', true);
  insert into journal_admin (admin_id, action, cible_type, cible_id, detail)
  values (auth.uid(), 'role:' || p_role, 'profil', p_profil::text, jsonb_build_object('province', p_province, 'ville', p_ville));
  return found;
end $$;

-- Le declencheur proteger_role() doit laisser passer attribuer_role().
create or replace function public.proteger_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('afiya.validation_en_cours', true) = '1' then return new; end if;
  if auth.uid() is not null and not public.est_super_admin() then
    new.role        := old.role;
    new.province_id := old.province_id;
    new.ville_id    := old.ville_id;
    new.actif       := old.actif;
  end if;
  return new;
end $$;

-- Soignants a valider pour l'institution connectee, avec perimetre.
create or replace function public.pros_a_valider(p_statut text default 'provisoire')
returns setof professionnels language sql stable security definer set search_path = public as $$
  select p.* from professionnels p
   where p.demo is not true
     and p.statut::text = p_statut
     and public.peut_valider(p.type, p.ville_id, p.province_id)
   order by p.created_at desc
   limit 500
$$;

-- ---------------------------------------------------------------------
--  B. PUBLICATIONS : actualites, directives, alertes
-- ---------------------------------------------------------------------
create table if not exists publications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('actualite','directive','alerte','vaccination')),
  audience    text not null default 'public' check (audience in ('public','soignants','medecins','pharmaciens')),
  titre       text not null check (length(titre) between 3 and 160),
  corps       text not null check (length(corps) between 3 and 4000),
  lien        text,                       -- source officielle (facultatif)
  province_id int references provinces(id),   -- null = national
  auteur_id   uuid references profils(id),
  auteur_role text,
  publie      boolean not null default false,
  publie_le   timestamptz,
  expire_le   timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_pub_publie on publications(publie, publie_le desc);

alter table publications enable row level security;
revoke all on publications from anon, authenticated;
grant select on publications to anon, authenticated;
grant insert, update, delete on publications to authenticated;

drop policy if exists pub_lecture_publique on publications;
create policy pub_lecture_publique on publications for select to anon, authenticated
  using (publie and audience = 'public' and (expire_le is null or expire_le > now()));
drop policy if exists pub_lecture_soignants on publications;
create policy pub_lecture_soignants on publications for select to authenticated
  using (publie and (expire_le is null or expire_le > now()) and (
    audience = 'soignants'
    or (audience = 'medecins'    and exists (select 1 from professionnels p where p.profil_id = auth.uid() and p.type = 'medecin'))
    or (audience = 'pharmaciens' and exists (select 1 from professionnels p where p.profil_id = auth.uid() and p.type = 'pharmacie'))
  ));
drop policy if exists pub_gestion on publications;
create policy pub_gestion on publications for all to authenticated
  using (public.peut_publier() and public.institution_couvre(province_id))
  with check (public.peut_publier() and public.institution_couvre(province_id));

create or replace function public.touch_publication() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.publie and (tg_op = 'INSERT' or old.publie is distinct from true) then new.publie_le := now(); end if;
  if new.auteur_id is null then new.auteur_id := auth.uid(); end if;
  if new.auteur_role is null then new.auteur_role := (select role::text from profils where id = auth.uid()); end if;
  return new;
end $$;
drop trigger if exists trg_touch_pub on publications;
create trigger trg_touch_pub before insert or update on publications
  for each row execute function public.touch_publication();

-- ---------------------------------------------------------------------
--  C. VACCINATION : campagnes et declarations anonymes
-- ---------------------------------------------------------------------
create table if not exists campagnes_vaccination (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null check (length(nom) between 3 and 160),
  vaccins       text[] not null default '{}',          -- codes du calendrier (ex : RR, VAA, R21)
  age_min_mois  int not null default 0 check (age_min_mois >= 0),
  age_max_mois  int not null default 59 check (age_max_mois >= age_min_mois),
  province_id   int references provinces(id),           -- null = nationale
  district_ids  int[] not null default '{}',             -- vide = toute la province / tout le pays
  debut         date not null,
  fin           date not null check (fin >= debut),
  lieux         text,                                    -- texte libre : ou se presenter
  message       text,                                    -- message aux familles
  statut        text not null default 'brouillon' check (statut in ('brouillon','publiee','terminee','annulee')),
  auteur_id     uuid references profils(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_camp_statut on campagnes_vaccination(statut, debut);

alter table campagnes_vaccination enable row level security;
revoke all on campagnes_vaccination from anon, authenticated;
grant select on campagnes_vaccination to anon, authenticated;
grant insert, update, delete on campagnes_vaccination to authenticated;

drop policy if exists camp_lecture on campagnes_vaccination;
create policy camp_lecture on campagnes_vaccination for select to anon, authenticated
  using (statut = 'publiee' and fin >= current_date - 7 or public.peut_gerer_campagnes());
drop policy if exists camp_gestion on campagnes_vaccination;
create policy camp_gestion on campagnes_vaccination for all to authenticated
  using (public.peut_gerer_campagnes() and public.institution_couvre(province_id))
  with check (public.peut_gerer_campagnes() and public.institution_couvre(province_id));

create or replace function public.touch_campagne() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.auteur_id is null then new.auteur_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_touch_camp on campagnes_vaccination;
create trigger trg_touch_camp before insert or update on campagnes_vaccination
  for each row execute function public.touch_campagne();

-- Declarations anonymes de doses : une ligne par dose declaree par une
-- famille qui a accepte de partager. Ni nom, ni date de naissance, ni
-- telephone. L'age est un entier en mois. Lecture reservee a la veille.
create table if not exists declarations_vaccin (
  id          bigserial primary key,
  ville_id    int references villes(id),
  province_id int references provinces(id),
  district_id int references districts_sanitaires(id),
  vaccin      text not null,
  dose        smallint not null check (dose between 1 and 6),
  age_mois    smallint check (age_mois between 0 and 240),
  a_l_heure   boolean,                 -- dose faite dans la fenetre prevue
  created_at  timestamptz default now()
);
create index if not exists idx_decl_vac on declarations_vaccin(created_at desc);
alter table declarations_vaccin enable row level security;
revoke all on declarations_vaccin from anon, authenticated;
-- Aucune politique : l'ecriture passe par declarer_vaccin(), la lecture
-- par veille_vaccination(). Rien n'est lisible ligne a ligne.

create or replace function public.declarer_vaccin(p_ville_code text, p_vaccin text, p_dose int, p_age_mois int, p_a_l_heure boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v villes%rowtype;
begin
  select * into v from villes where code = p_ville_code;
  if not found then return false; end if;
  if p_vaccin !~ '^[A-Z0-9_]{2,12}$' then return false; end if;
  perform public.limiter('vac:ville:' || v.id::text, 600);
  insert into declarations_vaccin (ville_id, province_id, district_id, vaccin, dose, age_mois, a_l_heure)
  values (v.id, v.province_id, v.district_id, p_vaccin, greatest(1, least(6, p_dose)),
          least(240, greatest(0, p_age_mois)), p_a_l_heure);
  return true;
end $$;

-- Lecture agregee pour la veille : doses declarees par province, vaccin
-- et semaine, bornee au perimetre du lecteur.
create or replace function public.veille_vaccination(p_jours int default 90)
returns table (semaine date, province_id int, vaccin text, dose smallint, nombre bigint, part_a_l_heure numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', d.created_at)::date, d.province_id, d.vaccin, d.dose,
         count(*)::bigint,
         round(avg(case when d.a_l_heure then 1 else 0 end)::numeric, 2)
    from declarations_vaccin d
   where d.created_at > now() - make_interval(days => greatest(p_jours, 1))
     and public.est_lecteur()
     and (public.admin_couvre(d.ville_id, d.province_id) or public.institution_couvre(d.province_id))
   group by 1, 2, 3, 4
   order by 1 desc, 5 desc
$$;

-- ---------------------------------------------------------------------
--  D1. ENTRAIDE ENTRE SOIGNANTS
--  Un agent isole decrit une situation (sans identifier le patient) et
--  demande conseil. Les medecins repondent. La conversation peut se
--  poursuivre sur WhatsApp si l'auteur l'accepte.
-- ---------------------------------------------------------------------
create table if not exists entraide_cas (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  auteur_pro    uuid not null references professionnels(id),
  ville_id      int references villes(id),
  province_id   int references provinces(id),
  specialite    text,                                 -- ce qu'on cherche : pediatrie, obstetrique...
  urgence       smallint not null default 2 check (urgence between 1 and 3),  -- 1 = immediat
  titre         text not null check (length(titre) between 5 and 140),
  description   text not null check (length(description) between 10 and 3000),
  whatsapp_ok   boolean not null default false,
  statut        text not null default 'ouvert' check (statut in ('ouvert','repondu','clos')),
  nb_reponses   int not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  clos_le       timestamptz
);
create index if not exists idx_cas_statut on entraide_cas(statut, created_at desc);

create table if not exists entraide_reponses (
  id          uuid primary key default gen_random_uuid(),
  cas_id      uuid not null references entraide_cas(id) on delete cascade,
  auteur_pro  uuid not null references professionnels(id),
  texte       text not null check (length(texte) between 2 and 3000),
  created_at  timestamptz default now()
);
create index if not exists idx_rep_cas on entraide_reponses(cas_id, created_at);

alter table entraide_cas      enable row level security;
alter table entraide_reponses enable row level security;
revoke all on entraide_cas, entraide_reponses from anon, authenticated;
grant select, insert, update on entraide_cas to authenticated;
grant select, insert on entraide_reponses to authenticated;

-- Un soignant actif (provisoire ou verifie) voit tous les cas du pays :
-- l'interet est justement qu'un medecin de N'Djamena reponde a un
-- infirmier du Tibesti. Les institutions lisent aussi.
create or replace function public.est_soignant_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professionnels p where p.profil_id = auth.uid()
                   and p.statut in ('provisoire','verifie') and p.demo is not true)
$$;
create or replace function public.est_medecin_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professionnels p where p.profil_id = auth.uid()
                   and p.type = 'medecin' and p.statut in ('provisoire','verifie') and p.demo is not true)
$$;

drop policy if exists cas_lecture on entraide_cas;
create policy cas_lecture on entraide_cas for select to authenticated
  using (public.est_soignant_actif() or public.est_lecteur());
drop policy if exists cas_depot on entraide_cas;
create policy cas_depot on entraide_cas for insert to authenticated
  with check (auteur_pro = public.mon_pro());
drop policy if exists cas_maj on entraide_cas;
create policy cas_maj on entraide_cas for update to authenticated
  using (auteur_pro = public.mon_pro() or public.est_admin())
  with check (auteur_pro = public.mon_pro() or public.est_admin());

drop policy if exists rep_cas_lecture on entraide_reponses;
create policy rep_cas_lecture on entraide_reponses for select to authenticated
  using (public.est_soignant_actif() or public.est_lecteur());
-- Repondent : les medecins, et l'auteur dans son propre fil.
drop policy if exists rep_cas_depot on entraide_reponses;
create policy rep_cas_depot on entraide_reponses for insert to authenticated
  with check (
    auteur_pro = public.mon_pro() and (
      public.est_medecin_actif()
      or exists (select 1 from entraide_cas c where c.id = cas_id and c.auteur_pro = public.mon_pro())
    ));

-- Code court lisible (ex : E-7K3M) et garde-fou anti-identifiants : un
-- numero de telephone dans un cas d'entraide est refuse.
create or replace function public.preparer_cas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is null then
    new.code := 'E-' || upper(substr(translate(encode(gen_random_bytes(4), 'hex'), '0o1il', 'XYZWV'), 1, 4));
  end if;
  if new.titre ~ '\d{6,}' or new.description ~ '\d{8,}' then
    raise exception 'IDENTIFIANT_INTERDIT' using hint = 'Aucun numero de telephone ni identifiant dans un cas d''entraide.';
  end if;
  if new.ville_id is null or new.province_id is null then
    select p.ville_id, p.province_id into new.ville_id, new.province_id
      from professionnels p where p.id = new.auteur_pro;
  end if;
  perform public.limiter('cas:pro:' || new.auteur_pro::text, 10);
  return new;
end $$;
drop trigger if exists trg_preparer_cas on entraide_cas;
create trigger trg_preparer_cas before insert on entraide_cas
  for each row execute function public.preparer_cas();

create or replace function public.compter_reponse_cas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.texte ~ '\d{8,}' then
    raise exception 'IDENTIFIANT_INTERDIT' using hint = 'Aucun numero dans une reponse d''entraide.';
  end if;
  update entraide_cas
     set nb_reponses = nb_reponses + 1, updated_at = now(),
         statut = case when statut = 'ouvert' and new.auteur_pro <> auteur_pro then 'repondu' else statut end
   where id = new.cas_id;
  perform public.limiter('repcas:pro:' || new.auteur_pro::text, 60);
  return new;
end $$;
drop trigger if exists trg_compter_reponse_cas on entraide_reponses;
create trigger trg_compter_reponse_cas before insert on entraide_reponses
  for each row execute function public.compter_reponse_cas();

-- Le contact WhatsApp de l'auteur n'est revele qu'a un medecin actif, et
-- seulement si l'auteur l'a accepte. Jamais dans la ligne du cas.
create or replace function public.contact_cas(p_cas uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.whatsapp, p.telephone)
    from entraide_cas c join professionnels p on p.id = c.auteur_pro
   where c.id = p_cas and c.whatsapp_ok
     and (public.est_medecin_actif() or public.est_admin())
$$;

-- ---------------------------------------------------------------------
--  D2. SIGNALEMENT COMMUNAUTAIRE D'EVENEMENTS SANITAIRES
--  N'importe qui peut signaler : plusieurs malades aux memes signes,
--  deces inhabituels, animaux morts, eau suspecte. Les autorites trient.
-- ---------------------------------------------------------------------
create table if not exists evenements_communautaires (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,
  type         text not null check (type in ('malades_groupes','deces_inhabituels','animaux_morts','eau_suspecte','autre')),
  nb_personnes smallint check (nb_personnes between 0 and 10000),
  ville_id     int references villes(id),
  province_id  int references provinces(id),
  quartier_id  int references quartiers(id),
  lieu_texte   text,
  description  text not null check (length(description) between 10 and 2000),
  contact_tel  text,                     -- facultatif, jamais lu en dehors du perimetre
  debut_estime date,
  statut       text not null default 'nouveau' check (statut in ('nouveau','en_verification','confirme','ecarte','transmis')),
  note_autorite text,
  traite_par   uuid references profils(id),
  traite_le    timestamptz,
  demo         boolean not null default false,
  created_at   timestamptz default now()
);
create index if not exists idx_evt_statut on evenements_communautaires(statut, created_at desc);

alter table evenements_communautaires enable row level security;
revoke all on evenements_communautaires from anon, authenticated;
grant select, update on evenements_communautaires to authenticated;
-- Le depot passe par signaler_evenement() (limite de debit). La lecture
-- et le tri sont reserves aux autorites et administrateurs du perimetre.
drop policy if exists evt_lecture on evenements_communautaires;
create policy evt_lecture on evenements_communautaires for select to authenticated
  using (public.admin_couvre(ville_id, province_id) or (public.est_institution() and public.institution_couvre(province_id)));
drop policy if exists evt_tri on evenements_communautaires;
create policy evt_tri on evenements_communautaires for update to authenticated
  using (public.admin_couvre(ville_id, province_id) or (public.est_institution() and public.institution_couvre(province_id)))
  with check (public.admin_couvre(ville_id, province_id) or (public.est_institution() and public.institution_couvre(province_id)));

create or replace function public.signaler_evenement(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v villes%rowtype; c text; tel text;
begin
  select * into v from villes where code = p->>'ville_code';
  if not found then raise exception 'ville inconnue'; end if;
  tel := nullif(regexp_replace(coalesce(p->>'contact_tel',''), '[^0-9+]', '', 'g'), '');
  if tel is not null then perform public.limiter('evt:tel:' || tel, 5); end if;
  perform public.limiter('evt:ville:' || v.id::text, 60);
  c := 'A-' || upper(substr(translate(encode(gen_random_bytes(4), 'hex'), '0o1il', 'XYZWV'), 1, 4));
  insert into evenements_communautaires (code, type, nb_personnes, ville_id, province_id, quartier_id, lieu_texte,
                                         description, contact_tel, debut_estime, demo)
  values (c, p->>'type', nullif(p->>'nb_personnes','')::smallint, v.id, v.province_id,
          nullif(p->>'quartier_id','')::int, left(p->>'lieu_texte', 200), left(p->>'description', 2000), tel,
          nullif(p->>'debut_estime','')::date, coalesce((p->>'demo')::boolean, false));
  return c;
end $$;

-- Tri par l'autorite : statut + note, journalise.
create or replace function public.trier_evenement(p_id uuid, p_statut text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare e evenements_communautaires%rowtype;
begin
  select * into e from evenements_communautaires where id = p_id;
  if not found then return false; end if;
  if not (public.admin_couvre(e.ville_id, e.province_id) or (public.est_institution() and public.institution_couvre(e.province_id))) then
    raise exception 'HORS_PERIMETRE' using errcode = '42501';
  end if;
  if p_statut not in ('nouveau','en_verification','confirme','ecarte','transmis') then raise exception 'statut inconnu'; end if;
  update evenements_communautaires
     set statut = p_statut, note_autorite = coalesce(p_note, note_autorite), traite_par = auth.uid(), traite_le = now()
   where id = p_id;
  insert into journal_admin (admin_id, action, cible_type, cible_id, detail)
  values (auth.uid(), 'evenement:' || p_statut, 'evenement', p_id::text, jsonb_build_object('type', e.type, 'ville', e.ville_id));
  return true;
end $$;

-- La veille syndromique et les anomalies s'ouvrent aux institutions.
create or replace function public.veille_syndromique(p_jours int default 30)
returns table (jour date, ville_id int, categorie text, niveau smallint, nombre bigint)
language sql stable security definer set search_path = public, pg_temp as $fn$
  select (d.created_at at time zone 'UTC')::date, d.ville_id, c, d.niveau, count(*)::bigint
    from public.demandes d
    cross join lateral unnest(case when cardinality(d.categories) = 0 then array['non_precise'] else d.categories end) as c
   where d.demo is not true
     and d.created_at > now() - make_interval(days => greatest(p_jours, 1))
     and public.est_lecteur()
     and (public.admin_couvre(d.ville_id, d.province_id) or public.institution_couvre(d.province_id))
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
       and public.est_lecteur()
       and (public.admin_couvre(d.ville_id, d.province_id) or public.institution_couvre(d.province_id))
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

-- Statistiques du back-office pour une institution (pas d'admin_stats
-- pour elle : perimetre different).
create or replace function public.institution_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'a_valider',      (select count(*) from professionnels p where p.demo is not true and p.statut = 'provisoire'
                          and public.peut_valider(p.type, p.ville_id, p.province_id)),
    'evenements_nouveaux', (select count(*) from evenements_communautaires e where e.statut = 'nouveau' and e.demo is not true
                          and public.institution_couvre(e.province_id)),
    'campagnes_actives', (select count(*) from campagnes_vaccination c where c.statut = 'publiee' and c.fin >= current_date
                          and public.institution_couvre(c.province_id)),
    'publications',   (select count(*) from publications where publie and (expire_le is null or expire_le > now())),
    'cas_ouverts',    (select count(*) from entraide_cas where statut = 'ouvert'),
    'doses_declarees_30j', (select count(*) from declarations_vaccin d where d.created_at > now() - interval '30 days'
                          and public.institution_couvre(d.province_id))
  ) where public.est_lecteur()
$$;

-- ---------------------------------------------------------------------
--  E. DROITS D'EXECUTION : tout fermer, ouvrir par nom.
-- ---------------------------------------------------------------------
do $$
declare f record;
  fermees text[] := array['mon_profil_actif','est_institution','est_lecteur','institution_couvre','peut_valider',
    'peut_publier','peut_gerer_campagnes','peut_attribuer_roles','valider_professionnel','attribuer_role',
    'pros_a_valider','touch_publication','touch_campagne','declarer_vaccin','veille_vaccination',
    'est_soignant_actif','est_medecin_actif','preparer_cas','compter_reponse_cas','contact_cas',
    'signaler_evenement','trier_evenement','veille_syndromique','veille_anomalies','institution_stats',
    'importer_formations','proteger_statut_pro','proteger_role'];
  -- Une politique RLS qui appelle une fonction exige que le role appelant
  -- ait EXECUTE dessus (regression du 5 septembre). Les predicats sont
  -- donc ouverts a anon : ils repondent simplement « faux ».
  pour_anon text[] := array['declarer_vaccin','signaler_evenement','est_institution','est_lecteur',
    'institution_couvre','peut_valider','peut_publier','peut_gerer_campagnes','peut_attribuer_roles',
    'est_soignant_actif','est_medecin_actif'];
  pour_connecte text[] := array['est_institution','est_lecteur','institution_couvre','peut_valider','peut_publier',
    'peut_gerer_campagnes','peut_attribuer_roles','valider_professionnel','attribuer_role','pros_a_valider',
    'declarer_vaccin','veille_vaccination','est_soignant_actif','est_medecin_actif','contact_cas',
    'signaler_evenement','trier_evenement','veille_syndromique','veille_anomalies','institution_stats',
    'importer_formations'];
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    if f.proname = any(fermees) then
      execute format('revoke all on function %s from public, anon, authenticated', f.sig);
      if f.proname = any(pour_anon)     then execute format('grant execute on function %s to anon', f.sig); end if;
      if f.proname = any(pour_connecte) then execute format('grant execute on function %s to authenticated', f.sig); end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  F. CONTROLE
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('publications','campagnes_vaccination','declarations_vaccin','entraide_cas',
                       'entraide_reponses','evenements_communautaires','districts_sanitaires','formations_sanitaires')) as tables_attendues_8,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('valider_professionnel','attribuer_role','signaler_evenement',
       'declarer_vaccin','veille_vaccination','institution_stats','contact_cas','pros_a_valider')) as fonctions_attendues_8,
  (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e
     join pg_type t on t.oid = e.enumtypid where t.typname = 'role_utilisateur') as roles;
