-- =====================================================================
--  14. ESPACE DE GESTION : DROITS DES ORDRES ET DU PROGRAMME, STATISTIQUES
--  A executer APRES 14a_types_soignants.sql. Re-executable.
--
--  A. Droits, tels que decrits par Amine le 7 novembre :
--     - Ordre des medecins : valide medecins, infirmiers, sages-femmes,
--       aides-soignants ; suit leur activite (regles deontologiques,
--       jamais les donnees des patients).
--     - Ordre des pharmaciens : valide pharmacies et pharmaciens ; meme
--       suivi.
--     - Programme national de sante numerique (role centre_numerique) :
--       cree des circonscriptions (districts) et des formations
--       sanitaires, lance des campagnes et des publications, lit toutes
--       les statistiques et les exporte, attribue les roles.
--     Les autorites (nationale, provinciale) gardent leurs droits.
--  B. Donnees de demonstration isolees : un soignant reel ne voit jamais
--     une demande de demonstration ; les statistiques les excluent sauf
--     demande explicite (interrupteur dans le back-office, toujours
--     affiche a l'ecran quand il est actif).
--  C. Statistiques : un resume, une requete generique a dimensions
--     choisies (geographie, temps, motif, niveau, sexe, age...), le suivi
--     d'activite pour les Ordres, les contacts de diffusion. Toutes
--     bornees au perimetre du lecteur, toutes en comptages.
--  D. Transcription des messages vocaux (colonnes, remplies par la
--     fonction Netlify « voix »).
-- =====================================================================

-- ---------------------------------------------------------------------
--  A. DROITS
-- ---------------------------------------------------------------------
create or replace function public.peut_valider(p_type type_pro, p_ville int, p_province int)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.admin_couvre(p_ville, p_province)
    or exists (
      select 1 from profils pr where pr.id = auth.uid() and pr.actif and (
        (pr.role::text = 'ordre_medecins'
           and p_type::text in ('medecin','infirmier','sage_femme','aide_soignant'))
        or (pr.role::text = 'ordre_pharmaciens'
           and p_type::text in ('pharmacie','pharmacien'))
        or (pr.role::text in ('autorite_nationale','centre_numerique')
           and p_type::text in ('centre_sante','ambulance','protection_civile','autre'))
        or (pr.role::text = 'autorite_provinciale'
           and p_type::text in ('centre_sante','ambulance','protection_civile','autre')
           and pr.province_id is not distinct from p_province)
      ))
$$;

create or replace function public.peut_gerer_campagnes() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','autorite_nationale','autorite_provinciale','centre_numerique'))
$$;

-- Le referentiel (districts, formations sanitaires, villes) : programme
-- national, autorite nationale, super-administrateur.
create or replace function public.peut_gerer_referentiel() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid() and actif
    and role::text in ('super_admin','autorite_nationale','centre_numerique'))
$$;

grant insert, update on districts_sanitaires, formations_sanitaires to authenticated;
drop policy if exists ds_gestion on districts_sanitaires;
create policy ds_gestion on districts_sanitaires for all to authenticated
  using (public.peut_gerer_referentiel()) with check (public.peut_gerer_referentiel());
drop policy if exists fs_gestion on formations_sanitaires;
create policy fs_gestion on formations_sanitaires for all to authenticated
  using (public.peut_gerer_referentiel()) with check (public.peut_gerer_referentiel());
-- Le programme cree aussi des villes (la politique existante est admin_couvre).
drop policy if exists geo_ecriture_villes_programme on villes;
create policy geo_ecriture_villes_programme on villes for all to authenticated
  using (public.peut_gerer_referentiel()) with check (public.peut_gerer_referentiel());

-- Numero suivant pour une nouvelle formation sanitaire creee a la main
-- (les codes MSP vont jusqu'a ~60 000 ; on part de 900 000).
create or replace function public.prochain_code_formation() returns int
language sql stable security definer set search_path = public as $$
  select greatest(900000, coalesce(max(code_msp), 0) + 1) from formations_sanitaires
$$;
create or replace function public.prochain_id_district() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(id), 0) + 1 from districts_sanitaires
$$;

-- ---------------------------------------------------------------------
--  B. DONNEES DE DEMONSTRATION
-- ---------------------------------------------------------------------
alter table declarations_vaccin add column if not exists demo boolean not null default false;
alter table entraide_cas        add column if not exists demo boolean not null default false;
alter table publications        add column if not exists demo boolean not null default false;
alter table campagnes_vaccination add column if not exists demo boolean not null default false;

-- Le compte connecte est-il un soignant de demonstration ?
create or replace function public.est_pro_demo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professionnels p where p.profil_id = auth.uid() and p.demo)
$$;

-- Un soignant reel ne voit pas les demandes de demonstration ; un
-- soignant de demonstration ne voit qu'elles. Les administrateurs voient
-- tout (avec le badge).
drop policy if exists dem_lecture_pro on demandes;
create policy dem_lecture_pro on demandes for select to authenticated
  using (
    public.admin_couvre(ville_id, province_id)
    or exists (
      select 1 from professionnels p
      where p.profil_id = auth.uid()
        and p.statut in ('provisoire','verifie')
        and (demandes.demo is not true) = (p.demo is not true)
        and (
          p.ville_id = demandes.ville_id
          or (demandes.escalade_le is not null and p.province_id = demandes.province_id)
        )
    )
  );

drop policy if exists ord_lecture on ordonnances;
create policy ord_lecture on ordonnances for select to authenticated
  using (
    public.admin_couvre(ville_id, province_id)
    or (masquee = false and exists (
          select 1 from professionnels p
          where p.profil_id = auth.uid()
            and p.type in ('pharmacie','pharmacien')
            and p.statut in ('provisoire','verifie')
            and (ordonnances.demo is not true) = (p.demo is not true)
            and (ordonnances.pharmacie_id = p.id
                 or (ordonnances.diffusion and p.ville_id = ordonnances.ville_id))))
  );

-- Un compte de demonstration (soignant marque demo, rattache a un vrai
-- compte pour la presentation) agit comme un soignant, mais uniquement
-- sur les donnees de demonstration. Les deux fonctions de 12_ excluaient
-- la demonstration : la separation se fait desormais ligne par ligne.
create or replace function public.est_soignant_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professionnels p where p.profil_id = auth.uid()
                   and p.statut in ('provisoire','verifie'))
$$;
create or replace function public.est_medecin_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professionnels p where p.profil_id = auth.uid()
                   and p.type = 'medecin' and p.statut in ('provisoire','verifie'))
$$;
-- Vrai si la ligne (demo ou non) est du meme monde que le compte connecte.
create or replace function public.meme_monde(p_demo boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_demo is not true) = (not public.est_pro_demo())
$$;

drop policy if exists cas_lecture on entraide_cas;
create policy cas_lecture on entraide_cas for select to authenticated
  using (public.est_lecteur() or (public.est_soignant_actif() and public.meme_monde(entraide_cas.demo)));
drop policy if exists rep_cas_lecture on entraide_reponses;
create policy rep_cas_lecture on entraide_reponses for select to authenticated
  using (public.est_lecteur()
         or (public.est_soignant_actif()
             and exists (select 1 from entraide_cas c where c.id = entraide_reponses.cas_id and public.meme_monde(c.demo))));
drop policy if exists rep_cas_depot on entraide_reponses;
create policy rep_cas_depot on entraide_reponses for insert to authenticated
  with check (
    auteur_pro = public.mon_pro()
    and exists (select 1 from entraide_cas c where c.id = cas_id and public.meme_monde(c.demo)
                  and (public.est_medecin_actif() or c.auteur_pro = public.mon_pro())));
-- Le cas herite du monde de son auteur (le trigger de 12_ est complete).
create or replace function public.preparer_cas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code is null then
    new.code := 'E-' || upper(substr(translate(replace(gen_random_uuid()::text, '-', ''), '0o1il', 'XYZWV'), 1, 4));
  end if;
  if new.titre ~ '\d{6,}' or new.description ~ '\d{8,}' then
    raise exception 'IDENTIFIANT_INTERDIT' using hint = 'Aucun numero de telephone ni identifiant dans un cas d''entraide.';
  end if;
  select coalesce(new.ville_id, p.ville_id), coalesce(new.province_id, p.province_id), coalesce(p.demo, false)
    into new.ville_id, new.province_id, new.demo
    from professionnels p where p.id = new.auteur_pro;
  perform public.limiter('cas:pro:' || new.auteur_pro::text, 10);
  return new;
end $$;

-- Reponses aux demandes : un soignant ne repond et ne lit que dans son
-- monde (en plus du perimetre geographique deja en place).
drop policy if exists rep_depot on reponses;
create policy rep_depot on reponses for insert to authenticated
  with check (
    public.est_admin()
    or (pro_id = public.mon_pro()
        and exists (select 1 from demandes d where d.id = demande_id and public.meme_monde(d.demo))));
drop policy if exists rep_lecture on reponses;
create policy rep_lecture on reponses for select to authenticated
  using (
    public.est_admin()
    or exists (
      select 1 from demandes d join professionnels p on p.profil_id = auth.uid()
       where d.id = reponses.demande_id
         and p.statut in ('provisoire','verifie')
         and (d.demo is not true) = (p.demo is not true)
         and (p.ville_id = d.ville_id or (d.escalade_le is not null and p.province_id = d.province_id))));

-- Publications pour les pharmaciens : le nouveau type « pharmacien »
-- compte comme « pharmacie ».
drop policy if exists pub_lecture_soignants on publications;
create policy pub_lecture_soignants on publications for select to authenticated
  using (publie and (expire_le is null or expire_le > now()) and (
    audience = 'soignants'
    or (audience = 'medecins' and exists (select 1 from professionnels p where p.profil_id = auth.uid() and p.type = 'medecin'))
    or (audience = 'pharmaciens' and exists (select 1 from professionnels p where p.profil_id = auth.uid() and p.type in ('pharmacie','pharmacien')))));

-- Signalements : chaque Ordre lit et traite ceux qui visent un soignant
-- de sa competence (c'est son role deontologique) ; rien d'autre.
drop policy if exists sig_ordre on signalements;
create policy sig_ordre on signalements for all to authenticated
  using (cible_type = 'professionnel' and exists (
           select 1 from professionnels p where p.id = signalements.cible_id
              and public.peut_valider(p.type, p.ville_id, p.province_id)))
  with check (cible_type = 'professionnel' and exists (
           select 1 from professionnels p where p.id = signalements.cible_id
              and public.peut_valider(p.type, p.ville_id, p.province_id)));

-- Rattacher un vrai compte (cree par l'inscription normale) a la
-- demonstration, ou l'en sortir : super-administrateur et programme.
create or replace function public.basculer_demo(p_pro uuid, p_demo boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.peut_gerer_referentiel() then raise exception 'HORS_PERIMETRE' using errcode = '42501'; end if;
  update professionnels set demo = p_demo, updated_at = now() where id = p_pro and service_officiel is not true;
  if not found then return false; end if;
  insert into journal_admin (admin_id, action, cible_type, cible_id, detail)
  values (auth.uid(), 'demo.bascule', 'professionnel', p_pro::text, jsonb_build_object('demo', p_demo));
  return true;
end $$;

-- L'interrupteur du back-office : statistiques et veille avec ou sans
-- la demonstration. Lisible par tous (reglages l'est deja), modifiable
-- par le super-administrateur et le programme.
insert into reglages (cle, valeur) values ('stats_inclure_demo', '{"actif": false}'::jsonb)
  on conflict (cle) do nothing;
drop policy if exists reg_ecriture_programme on reglages;
create policy reg_ecriture_programme on reglages for update to authenticated
  using (public.peut_gerer_referentiel()) with check (public.peut_gerer_referentiel());

-- Effacement complet de la demonstration, en une fois, dans le bon ordre.
create or replace function public.effacer_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n jsonb := '{}'::jsonb; c int;
begin
  if not public.est_super_admin() then raise exception 'HORS_PERIMETRE' using errcode = '42501'; end if;
  delete from entraide_reponses where cas_id in (select id from entraide_cas where demo); get diagnostics c = row_count; n := n || jsonb_build_object('entraide_reponses', c);
  delete from entraide_cas where demo; get diagnostics c = row_count; n := n || jsonb_build_object('entraide_cas', c);
  delete from declarations_vaccin where demo; get diagnostics c = row_count; n := n || jsonb_build_object('declarations_vaccin', c);
  delete from evenements_communautaires where demo; get diagnostics c = row_count; n := n || jsonb_build_object('evenements', c);
  delete from publications where demo; get diagnostics c = row_count; n := n || jsonb_build_object('publications', c);
  delete from campagnes_vaccination where demo; get diagnostics c = row_count; n := n || jsonb_build_object('campagnes', c);
  delete from reponses_ordonnance where ordonnance_id in (select id from ordonnances where demo);
  delete from ordonnances where demo; get diagnostics c = row_count; n := n || jsonb_build_object('ordonnances', c);
  delete from reponses where demande_id in (select id from demandes where demo);
  delete from demandes where demo; get diagnostics c = row_count; n := n || jsonb_build_object('demandes', c);
  delete from signalements where cible_id in (select id from professionnels where demo);
  delete from releves_prix where pharmacie_id in (select id from professionnels where demo);
  -- Toutes les fiches de demonstration disparaissent, y compris celles
  -- rattachees a un compte : le compte reste, sans fiche (il peut se
  -- reinscrire). Un vrai soignant ne doit donc pas etre bascule en demo.
  delete from professionnels where demo; get diagnostics c = row_count; n := n || jsonb_build_object('professionnels', c);
  insert into journal_admin (admin_id, action, cible_type, cible_id, detail) values (auth.uid(), 'demo.effacement', 'base', 'demo', n);
  return n;
end $$;

-- ---------------------------------------------------------------------
--  C. STATISTIQUES
-- ---------------------------------------------------------------------
-- Perimetre d'un lecteur, en SQL reutilisable : vrai si la ligne (ville,
-- province) est dans ce qu'il a le droit de voir.
create or replace function public.lecteur_couvre(p_ville int, p_province int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.admin_couvre(p_ville, p_province) or public.institution_couvre(p_province)
$$;

-- Tranche d'age a partir d'un age en texte (le formulaire ne garde que
-- des chiffres ; tout le reste tombe dans « inconnu »).
create or replace function public.tranche_age(p text) returns text
language sql immutable as $$
  select case
    when p is null or p !~ '^\d{1,3}$' then 'inconnu'
    when p::int < 1 then '0'
    when p::int < 5 then '1-4'
    when p::int < 15 then '5-14'
    when p::int < 25 then '15-24'
    when p::int < 50 then '25-49'
    when p::int < 65 then '50-64'
    else '65+' end
$$;

-- Resume chiffre du secteur, pour le tableau de bord et le rapport.
create or replace function public.stats_resume(p_jours int default 30, p_inclure_demo boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (
    select * from demandes x
     where x.created_at > now() - make_interval(days => greatest(p_jours, 1))
       and (p_inclure_demo or x.demo is not true)
       and public.lecteur_couvre(x.ville_id, x.province_id)
  ), premiere as (
    -- Premiere action de prise en charge (un simple « vu » ne compte pas).
    select r.demande_id, min(r.created_at) as t from reponses r join d on d.id = r.demande_id
     where r.action in ('en_route','appelle','whatsapp','resolu') group by 1
  )
  select jsonb_build_object(
    'jours', p_jours,
    'demo_inclus', p_inclure_demo,
    'demandes', (select count(*) from d),
    'demandes_vitales', (select count(*) from d where niveau = 1),
    'demandes_par_niveau', (select coalesce(jsonb_object_agg(niveau, n), '{}') from (select niveau, count(*) n from d group by 1) z),
    'demandes_par_statut', (select coalesce(jsonb_object_agg(statut, n), '{}') from (select statut, count(*) n from d group by 1) z),
    'prises_en_charge', (select count(*) from d where statut in ('pris_en_charge','resolu')),
    'taux_prise_en_charge', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where statut in ('pris_en_charge','resolu')) / count(*), 1) end from d),
    'delai_prise_en_charge_min', (select round(percentile_cont(0.5) within group (order by extract(epoch from (premiere.t - d.created_at)) / 60)::numeric, 0)
                                     from d join premiere on premiere.demande_id = d.id),
    'escaladees', (select count(*) from d where escalade_le is not null),
    'soignants_actifs', (select count(distinct r.pro_id) from reponses r join d on d.id = r.demande_id),
    'soignants_inscrits', (select count(*) from professionnels p where p.statut in ('provisoire','verifie') and p.service_officiel is not true
                              and (p_inclure_demo or p.demo is not true) and public.lecteur_couvre(p.ville_id, p.province_id)),
    'soignants_verifies', (select count(*) from professionnels p where p.statut = 'verifie' and p.service_officiel is not true
                              and (p_inclure_demo or p.demo is not true) and public.lecteur_couvre(p.ville_id, p.province_id)),
    'soignants_par_type', (select coalesce(jsonb_object_agg(type, n), '{}') from (
                              select p.type, count(*) n from professionnels p where p.statut in ('provisoire','verifie') and p.service_officiel is not true
                                and (p_inclure_demo or p.demo is not true) and public.lecteur_couvre(p.ville_id, p.province_id) group by 1) z),
    'ordonnances', (select count(*) from ordonnances o where o.created_at > now() - make_interval(days => greatest(p_jours, 1))
                       and (p_inclure_demo or o.demo is not true) and public.lecteur_couvre(o.ville_id, o.province_id)),
    'ordonnances_servies', (select count(*) from ordonnances o where o.created_at > now() - make_interval(days => greatest(p_jours, 1))
                       and (p_inclure_demo or o.demo is not true) and public.lecteur_couvre(o.ville_id, o.province_id) and o.statut = 'servie'),
    'evenements', (select count(*) from evenements_communautaires e where e.created_at > now() - make_interval(days => greatest(p_jours, 1))
                       and (p_inclure_demo or e.demo is not true) and public.lecteur_couvre(e.ville_id, e.province_id)),
    'evenements_confirmes', (select count(*) from evenements_communautaires e where e.created_at > now() - make_interval(days => greatest(p_jours, 1))
                       and (p_inclure_demo or e.demo is not true) and public.lecteur_couvre(e.ville_id, e.province_id) and e.statut in ('confirme','transmis')),
    'doses_declarees', (select count(*) from declarations_vaccin v where v.created_at > now() - make_interval(days => greatest(p_jours, 1))
                       and (p_inclure_demo or v.demo is not true) and public.lecteur_couvre(v.ville_id, v.province_id)),
    'cas_entraide', (select count(*) from entraide_cas c where c.created_at > now() - make_interval(days => greatest(p_jours, 1))
                       and (p_inclure_demo or c.demo is not true)),
    'villes_actives', (select count(distinct ville_id) from d)
  ) where public.est_lecteur()
$$;

-- Requete generique. p (jsonb) :
--   source : demandes | reponses | ordonnances | professionnels | evenements | vaccins | entraide
--   mesure : nombre | delai_median (demandes seulement : minutes jusqu'a la
--            premiere prise en charge — en route, appel, WhatsApp ou resolu)
--   dim1, dim2 : cles de dimension (liste blanche ci-dessous), dim2 facultatif
--   jours (defaut 90 ; ignore pour professionnels, qui est un stock),
--   province_id, ville_id, district_id (filtres facultatifs), inclure_demo (defaut false),
--   langue ('ar' : noms arabes des provinces, villes, quartiers quand ils existent)
-- Renvoie cle1, cle2, valeur. Aucune donnee individuelle ne sort :
-- uniquement des comptages ou des medianes.

-- Expression SQL de chaque dimension. Liste blanche : une cle inconnue
-- renvoie null et la requete est refusee. C'est ce qui rend le SQL
-- dynamique sur : rien de ce que l'utilisateur tape n'entre dans la requete.
drop function if exists public.stats_dimension_sql(text);
create or replace function public.stats_dimension_sql(dim text, p_ar boolean default false) returns text
language sql immutable as $$
  select case dim
    when 'province'   then case when p_ar then 'coalesce(nullif(pv.nom_ar, ''''), pv.nom_fr, ''—'')' else 'coalesce(pv.nom_fr, ''(sans province)'')' end
    when 'ville'      then case when p_ar then 'coalesce(nullif(vi.nom_ar, ''''), vi.nom_fr, ''—'')' else 'coalesce(vi.nom_fr, ''(sans ville)'')' end
    when 'district'   then 'coalesce(ds.nom, ''(sans district)'')'
    when 'quartier'   then case when p_ar then 'coalesce(nullif(qu.nom_ar, ''''), qu.nom_fr, ''—'')' else 'coalesce(qu.nom_fr, ''(sans quartier)'')' end
    when 'jour'       then 'to_char(x.created_at, ''YYYY-MM-DD'')'
    when 'semaine'    then 'to_char(date_trunc(''week'', x.created_at), ''YYYY-MM-DD'')'
    when 'mois'       then 'to_char(x.created_at, ''YYYY-MM'')'
    when 'categorie'  then 'c.cat'
    when 'niveau'     then 'x.niveau::text'
    when 'statut'     then 'x.statut::text'
    when 'sexe'       then 'coalesce(x.sexe, ''inconnu'')'
    when 'tranche_age' then 'public.tranche_age(x.age_approx)'
    when 'pour_qui'   then 'coalesce(x.pour_qui, ''inconnu'')'
    when 'escalade'   then 'case when x.escalade_le is null then ''non'' else ''oui'' end'
    when 'action'     then 'x0.action::text'
    when 'type_pro'   then 'coalesce(pr.type::text, ''inconnu'')'
    when 'type'       then 'x.type::text'
    when 'en_ligne'   then 'case when x.en_ligne then ''oui'' else ''non'' end'
    when 'diffusion'  then 'case when x.diffusion then ''diffusion'' else ''pharmacie_choisie'' end'
    when 'disponibilite' then 'coalesce(ro.disponibilite::text, ''sans_reponse'')'
    when 'vaccin'     then 'x.vaccin'
    when 'dose'       then 'x.dose::text'
    when 'a_l_heure'  then 'case when x.a_l_heure then ''oui'' when x.a_l_heure is false then ''non'' else ''inconnu'' end'
    when 'urgence'    then 'x.urgence::text'
    when 'specialite' then 'coalesce(x.specialite, ''non_precisee'')'
    else null end
$$;

create or replace function public.stats_requete(p jsonb)
returns table (cle1 text, cle2 text, valeur numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  src text := coalesce(p->>'source', 'demandes');
  mesure text := coalesce(p->>'mesure', 'nombre');
  d1 text := coalesce(p->>'dim1', 'province');
  d2 text := nullif(p->>'dim2', '');
  jours int := greatest(coalesce((p->>'jours')::int, 90), 1);
  demo boolean := coalesce((p->>'inclure_demo')::boolean, false);
  f_prov int := nullif(p->>'province_id', '')::int;
  f_ville int := nullif(p->>'ville_id', '')::int;
  f_dist int := nullif(p->>'district_id', '')::int;
  ar boolean := coalesce(p->>'langue', 'fr') = 'ar';
  base text; e1 text; e2 text; sel text; ou text; sql text; geo text;
begin
  if not public.est_lecteur() then raise exception 'HORS_PERIMETRE' using errcode = '42501'; end if;
  e1 := public.stats_dimension_sql(d1, ar);
  e2 := case when d2 is null then quote_literal('') else public.stats_dimension_sql(d2, ar) end;
  if e1 is null or e2 is null then raise exception 'dimension inconnue'; end if;
  if (d1 = 'action' or d2 = 'action' or d1 = 'type_pro' or d2 = 'type_pro') and src <> 'reponses' then
    raise exception 'dimension reservee a la source reponses';
  end if;

  geo := ' left join provinces pv on pv.id = x.province_id left join villes vi on vi.id = x.ville_id'
      || ' left join districts_sanitaires ds on ds.id = ' || case when src = 'vaccins' then 'x.district_id' else 'vi.district_id' end
      || ' left join quartiers qu on ' || case when src in ('demandes','reponses','ordonnances','evenements','professionnels') then 'qu.id = x.quartier_id' else 'false' end;
  base := case src
    when 'demandes'       then 'from demandes x'
    when 'reponses'       then 'from reponses x0 join demandes x on x.id = x0.demande_id left join professionnels pr on pr.id = x0.pro_id'
    when 'ordonnances'    then 'from ordonnances x left join lateral (select ro.disponibilite from reponses_ordonnance ro where ro.ordonnance_id = x.id order by ro.created_at limit 1) ro on true'
    when 'professionnels' then 'from professionnels x'
    when 'evenements'     then 'from evenements_communautaires x'
    when 'vaccins'        then 'from declarations_vaccin x'
    when 'entraide'       then 'from entraide_cas x'
    else null end;
  if base is null then raise exception 'source inconnue'; end if;
  base := base || geo;
  if d1 = 'categorie' or d2 = 'categorie' then
    if src not in ('demandes','reponses') then raise exception 'dimension categorie : demandes ou reponses seulement'; end if;
    base := base || ' cross join lateral unnest(case when cardinality(x.categories) = 0 then array[''non_precise''] else x.categories end) as c(cat)';
  end if;

  ou := case when src = 'professionnels' then ' where true'
             else format(' where %s > now() - make_interval(days => %s)', case when src = 'reponses' then 'x0.created_at' else 'x.created_at' end, jours) end;
  if not demo then ou := ou || ' and x.demo is not true'; end if;
  if src = 'entraide' then ou := ou || ' and public.est_lecteur()';
  else ou := ou || ' and public.lecteur_couvre(x.ville_id, x.province_id)'; end if;
  if src = 'professionnels' then ou := ou || ' and x.service_officiel is not true'; end if;
  if f_prov  is not null then ou := ou || format(' and x.province_id = %s', f_prov); end if;
  if f_ville is not null then ou := ou || format(' and x.ville_id = %s', f_ville); end if;
  if f_dist  is not null then ou := ou || format(' and %s = %s', case when src = 'vaccins' then 'x.district_id' else 'vi.district_id' end, f_dist); end if;

  if mesure = 'nombre' then
    sel := 'count(*)::numeric';
  elsif mesure = 'delai_median' and src = 'demandes' then
    base := base || ' join lateral (select min(r.created_at) as t from reponses r where r.demande_id = x.id and r.action in (''en_route'',''appelle'',''whatsapp'',''resolu'')) r1 on r1.t is not null';
    sel := 'round(percentile_cont(0.5) within group (order by extract(epoch from (r1.t - x.created_at)) / 60)::numeric, 0)';
  else
    raise exception 'mesure inconnue pour cette source';
  end if;

  sql := format('select (%s)::text, (%s)::text, %s %s %s group by 1, 2 order by 3 desc nulls last, 1, 2 limit 500', e1, e2, sel, base, ou);
  return query execute sql;
end $$;

-- Suivi d'activite pour les Ordres : par soignant de leur competence,
-- des comptages et des delais, jamais le contenu des demandes.
create or replace function public.activite_professionnels(p_jours int default 90, p_inclure_demo boolean default false)
returns table (
  id uuid, nom text, type text, statut text, ville text, province text, en_ligne boolean,
  inscrit_le timestamptz, probation_fin timestamptz, derniere_activite timestamptz,
  reponses bigint, demandes_distinctes bigint, prises_en_charge bigint,
  delai_median_min numeric, signalements_ouverts bigint, demo boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.nom, p.type::text, p.statut::text, vi.nom_fr, pv.nom_fr, p.en_ligne,
         p.created_at, p.probation_fin, p.derniere_activite,
         (select count(*) from reponses r where r.pro_id = p.id and r.created_at > now() - make_interval(days => greatest(p_jours,1))),
         (select count(distinct r.demande_id) from reponses r where r.pro_id = p.id and r.created_at > now() - make_interval(days => greatest(p_jours,1))),
         (select count(*) from reponses r where r.pro_id = p.id and r.action in ('en_route','appelle','whatsapp','resolu') and r.created_at > now() - make_interval(days => greatest(p_jours,1))),
         (select round(percentile_cont(0.5) within group (order by extract(epoch from (r.created_at - d.created_at)) / 60)::numeric, 0)
            from reponses r join demandes d on d.id = r.demande_id
           where r.pro_id = p.id and r.action in ('en_route','appelle','whatsapp','resolu')
             and r.created_at > now() - make_interval(days => greatest(p_jours,1))),
         (select count(*) from signalements s where s.cible_type = 'professionnel' and s.cible_id = p.id and s.statut = 'ouvert'),
         p.demo
    from professionnels p
    left join villes vi on vi.id = p.ville_id
    left join provinces pv on pv.id = p.province_id
   where p.service_officiel is not true
     and (p_inclure_demo or p.demo is not true)
     and public.peut_valider(p.type, p.ville_id, p.province_id)
   order by p.created_at desc
   limit 1000
$$;

-- Contacts de diffusion : les numeros WhatsApp des soignants inscrits
-- (ils se sont inscrits pour etre joints), par type et par province,
-- pour qu'une campagne ou une alerte parte par liste de diffusion. Les
-- patients n'ont pas de compte : aucun numero de patient ne sort jamais.
-- Chaque export est journalise.
create or replace function public.contacts_diffusion(p_types text[] default null, p_province int default null)
returns table (nom text, type text, ville text, province text, whatsapp text)
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.peut_publier() then raise exception 'HORS_PERIMETRE' using errcode = '42501'; end if;
  if p_province is not null and not public.institution_couvre(p_province) then raise exception 'HORS_PERIMETRE' using errcode = '42501'; end if;
  select count(*) into n from professionnels p
   where p.statut in ('provisoire','verifie') and p.demo is not true and p.service_officiel is not true
     and coalesce(p.whatsapp, p.telephone) is not null
     and (p_types is null or p.type::text = any(p_types))
     and (p_province is not null and p.province_id = p_province or p_province is null and public.institution_couvre(p.province_id));
  insert into journal_admin (admin_id, action, cible_type, cible_id, detail)
  values (auth.uid(), 'diffusion.export', 'contacts', coalesce(p_province::text, 'national'), jsonb_build_object('types', p_types, 'n', n));
  return query
    select p.nom, p.type::text, vi.nom_fr, pv.nom_fr, coalesce(p.whatsapp, p.telephone)
      from professionnels p left join villes vi on vi.id = p.ville_id left join provinces pv on pv.id = p.province_id
     where p.statut in ('provisoire','verifie') and p.demo is not true and p.service_officiel is not true
       and coalesce(p.whatsapp, p.telephone) is not null
       and (p_types is null or p.type::text = any(p_types))
       and (p_province is not null and p.province_id = p_province or p_province is null and public.institution_couvre(p.province_id))
     order by pv.nom_fr, vi.nom_fr, p.nom;
end $$;

-- Les veilles acceptent l'interrupteur de demonstration (signatures
-- changees : on retire les anciennes pour eviter toute ambiguite).
drop function if exists public.veille_syndromique(int);
create or replace function public.veille_syndromique(p_jours int default 30, p_inclure_demo boolean default false)
returns table (jour date, ville_id int, categorie text, niveau smallint, nombre bigint)
language sql stable security definer set search_path = public, pg_temp as $fn$
  select (d.created_at at time zone 'UTC')::date, d.ville_id, c, d.niveau, count(*)::bigint
    from public.demandes d
    cross join lateral unnest(case when cardinality(d.categories) = 0 then array['non_precise'] else d.categories end) as c
   where (p_inclure_demo or d.demo is not true)
     and d.created_at > now() - make_interval(days => greatest(p_jours, 1))
     and public.est_lecteur()
     and public.lecteur_couvre(d.ville_id, d.province_id)
   group by 1, 2, 3, 4
   order by 1 desc, 5 desc;
$fn$;

drop function if exists public.veille_anomalies();
create or replace function public.veille_anomalies(p_inclure_demo boolean default false)
returns table (ville_id int, categorie text, semaine bigint, moyenne_4sem numeric, rapport numeric)
language sql stable security definer set search_path = public, pg_temp as $fn$
  with base as (
    select d.ville_id, c as categorie, d.created_at
      from public.demandes d
      cross join lateral unnest(case when cardinality(d.categories) = 0 then array['non_precise'] else d.categories end) as c
     where (p_inclure_demo or d.demo is not true)
       and d.created_at > now() - interval '35 days'
       and public.est_lecteur()
       and public.lecteur_couvre(d.ville_id, d.province_id)
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

drop function if exists public.veille_vaccination(int);
create or replace function public.veille_vaccination(p_jours int default 90, p_inclure_demo boolean default false)
returns table (semaine date, province_id int, vaccin text, dose smallint, nombre bigint, part_a_l_heure numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', d.created_at)::date, d.province_id, d.vaccin, d.dose,
         count(*)::bigint,
         round(avg(case when d.a_l_heure then 1 else 0 end)::numeric, 2)
    from declarations_vaccin d
   where d.created_at > now() - make_interval(days => greatest(p_jours, 1))
     and (p_inclure_demo or d.demo is not true)
     and public.est_lecteur()
     and public.lecteur_couvre(d.ville_id, d.province_id)
   group by 1, 2, 3, 4
   order by 1 desc, 5 desc
$$;

-- Le declarant anonyme peut marquer une declaration comme demonstration
-- (le mode demonstration du telephone le fait) : signature etendue.
drop function if exists public.declarer_vaccin(text, text, int, int, boolean);
create or replace function public.declarer_vaccin(p_ville_code text, p_vaccin text, p_dose int, p_age_mois int, p_a_l_heure boolean, p_demo boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare v villes%rowtype;
begin
  select * into v from villes where code = p_ville_code;
  if not found then return false; end if;
  if p_vaccin !~ '^[A-Z0-9_]{2,12}$' then return false; end if;
  perform public.limiter('vac:ville:' || v.id::text, 600);
  insert into declarations_vaccin (ville_id, province_id, district_id, vaccin, dose, age_mois, a_l_heure, demo)
  values (v.id, v.province_id, v.district_id, p_vaccin, greatest(1, least(6, p_dose)),
          least(240, greatest(0, p_age_mois)), p_a_l_heure, coalesce(p_demo, false));
  return true;
end $$;

-- ---------------------------------------------------------------------
--  D. TRANSCRIPTION DES MESSAGES VOCAUX (remplie par la fonction Netlify)
-- ---------------------------------------------------------------------
alter table demandes add column if not exists transcription text;
alter table demandes add column if not exists analyse_vocale jsonb;  -- « analyse » seul est un mot reserve
alter table demandes add column if not exists transcrit_le timestamptz;
-- La lecture de demandes est accordee colonne par colonne (07_) : les
-- soignants lisent la transcription, jamais le numero du patient.
grant select (transcription, analyse_vocale, transcrit_le) on demandes to authenticated;

-- ---------------------------------------------------------------------
--  E. DROITS D'EXECUTION
-- ---------------------------------------------------------------------
do $$
declare f record;
  fermees text[] := array['peut_valider','peut_gerer_campagnes','peut_gerer_referentiel','prochain_code_formation','prochain_id_district',
    'est_pro_demo','meme_monde','est_soignant_actif','est_medecin_actif','basculer_demo','effacer_demo','lecteur_couvre','tranche_age',
    'stats_dimension_sql','stats_resume','stats_requete','activite_professionnels',
    'contacts_diffusion','veille_syndromique','veille_anomalies','veille_vaccination','declarer_vaccin'];
  pour_anon text[] := array['peut_valider','peut_gerer_campagnes','peut_gerer_referentiel','est_pro_demo','meme_monde',
    'est_soignant_actif','est_medecin_actif','declarer_vaccin'];
  pour_connecte text[] := array['peut_valider','peut_gerer_campagnes','peut_gerer_referentiel','prochain_code_formation','prochain_id_district',
    'est_pro_demo','meme_monde','est_soignant_actif','est_medecin_actif','basculer_demo','effacer_demo','lecteur_couvre',
    'stats_resume','stats_requete','activite_professionnels',
    'contacts_diffusion','veille_syndromique','veille_anomalies','veille_vaccination','declarer_vaccin'];
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

select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
         and p.proname in ('stats_resume','stats_requete','activite_professionnels','contacts_diffusion','effacer_demo','peut_gerer_referentiel')) as fonctions_attendues_6,
       (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'type_pro') as types_pro,
       (select valeur from reglages where cle = 'stats_inclure_demo') as demo_dans_stats;
