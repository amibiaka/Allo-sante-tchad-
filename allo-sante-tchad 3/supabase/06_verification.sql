-- =====================================================================
--  ALLO SANTE TCHAD — verification de l'installation
--  ---------------------------------------------------------------
--  A lancer dans Supabase > SQL Editor apres les etapes 01 a 03.
--  Ce script ne modifie RIEN : il verifie et affiche un verdict.
--  Toutes les lignes doivent afficher « OK ».
-- =====================================================================
with controles as (

  select 1 as n, 'Les 23 provinces sont chargees' as controle,
         (select count(*) from provinces) = 23 as ok,
         (select count(*)::text from provinces) as valeur
  union all select 2, 'Les 23 chefs-lieux sont chargees',
         (select count(*) from villes) >= 23, (select count(*)::text from villes)
  union all select 3, 'Les quartiers sont charges',
         (select count(*) from quartiers) >= 160, (select count(*)::text from quartiers)
  union all select 4, 'Les services de secours sont visibles (police, pompiers, gendarmerie)',
         (select count(*) from professionnels where service_officiel and statut = 'verifie') >= 69,
         (select count(*)::text from professionnels where service_officiel and statut = 'verifie')
  union all select 5, 'Les numeros d''urgence sont charges',
         (select count(*) from numeros_urgence) >= 8, (select count(*)::text from numeros_urgence)
  union all select 6, 'La securite au niveau des lignes est active sur les tables sensibles',
         (select bool_and(relrowsecurity) from pg_class
           where relname in ('demandes','reponses','ordonnances','professionnels','profils')
             and relnamespace = 'public'::regnamespace), 'RLS'
  union all select 7, 'Le numero du patient est inaccessible depuis le navigateur',
         not has_column_privilege('anon', 'public.demandes', 'contact_tel', 'select')
         and not has_column_privilege('authenticated', 'public.demandes', 'contact_tel', 'select'),
         'contact_tel'
  union all select 8, 'Les fonctions de maintenance sont fermees au public',
         not has_function_privilege('anon', 'public.purger_medias(int)', 'execute')
         and not has_function_privilege('authenticated', 'public.purger_medias(int)', 'execute'),
         'purger_medias'
  union all select 9, 'Le suivi par code est ouvert aux patients sans compte',
         has_function_privilege('anon', 'public.suivre_demande(text)', 'execute'), 'suivre_demande'
  union all select 10, 'Le stockage des photos et vocaux est prive',
         (select not public from storage.buckets where id = 'medias'), 'medias'
  union all select 11, 'Un super-administrateur existe',
         (select count(*) from profils where role = 'super_admin' and actif) >= 1,
         (select count(*)::text from profils where role = 'super_admin' and actif)
  union all select 12, 'Les numeros d''urgence ont ete testes localement',
         coalesce((select valeur = 'true'::jsonb from reglages where cle = 'numeros_verifies_localement'), false),
         coalesce((select valeur::text from reglages where cle = 'numeros_verifies_localement'), 'absent')
  union all select 13, 'Les donnees de demonstration ont ete retirees',
         (select count(*) from professionnels where demo) = 0,
         (select count(*)::text from professionnels where demo)
)
select n as "#",
       case when ok then 'OK' else 'A FAIRE' end as etat,
       controle, valeur
  from controles order by n;

-- ---------------------------------------------------------------------
--  Lecture du resultat
--  1 a 10  : doivent tous afficher OK. Sinon, relancez le script
--            d'installation correspondant.
--  11      : lancez 05_creer_administrateur.sql.
--  12      : testez les numeros d'urgence depuis un telephone tchadien
--            (Airtel ET Moov), puis validez-les dans le back-office.
--            NE PAS OUVRIR AU PUBLIC AVANT.
--  13      : « A FAIRE » est normal tant que vous montrez la
--            demonstration. Lancez 04_effacer_demo.sql avant la mise en
--            service reelle.
-- ---------------------------------------------------------------------
