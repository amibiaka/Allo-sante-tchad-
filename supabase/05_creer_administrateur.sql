-- =====================================================================
--  ALLO SANTE TCHAD — creer le premier super-administrateur
--  ---------------------------------------------------------------
--  MODE D'EMPLOI (2 minutes)
--
--  1. Dans Supabase : Authentication > Users > "Add user" > "Create new user".
--     - Email    : utilisez le format telephone de la plateforme, par ex.
--                  23566000000@tel.allosante.td
--                  (l'application connecte les gens par NUMERO ; elle
--                   fabrique cette adresse toute seule. Ici vous la saisissez
--                   a la main pour le tout premier compte.)
--     - Password : choisissez un mot de passe solide.
--     - Cochez "Auto Confirm User".
--  2. Copiez l'UUID de l'utilisateur cree (colonne "UID").
--  3. Remplacez COLLEZ_ICI_L_UUID ci-dessous, puis lancez cette requete.
-- =====================================================================

update profils
   set role = 'super_admin',
       nom  = 'Super administrateur',
       actif = true
 where id = 'COLLEZ_ICI_L_UUID';

-- Verification : doit renvoyer une ligne avec role = super_admin
select id, role, nom, telephone from profils where role = 'super_admin';

-- ---------------------------------------------------------------------
--  CREER ENSUITE UN ADMIN DE PROVINCE OU DE VILLE
--  (le super-admin peut aussi le faire depuis le back-office)
-- ---------------------------------------------------------------------
-- Admin de province :
-- update profils set role = 'admin_province',
--        province_id = (select id from provinces where code = 'LOC')
--  where id = 'UUID_DE_LA_PERSONNE';
--
-- Admin de ville :
-- update profils set role = 'admin_ville',
--        ville_id = (select id from villes where code = 'LOC-MDU'),
--        province_id = (select province_id from villes where code = 'LOC-MDU')
--  where id = 'UUID_DE_LA_PERSONNE';
