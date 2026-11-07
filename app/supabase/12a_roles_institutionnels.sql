-- =====================================================================
--  12a. ROLES INSTITUTIONNELS (a executer SEUL, avant 12_...)
--  PostgreSQL interdit d'utiliser une valeur d'enumeration dans la
--  transaction qui la cree : ce fichier ne fait donc qu'ajouter les
--  valeurs. Le fichier 12 s'en sert.
--
--  Les cinq roles ajoutes a cote des roles existants (pro, admin_ville,
--  admin_province, super_admin) :
--    autorite_nationale    ministere (DG, DSPEV, surveillance) : lecture
--                          nationale, campagnes, publications, alertes
--    autorite_provinciale  delegation sanitaire provinciale : meme chose,
--                          bornee a sa province
--    ordre_medecins        Ordre national des medecins : valide, suspend
--                          ou refuse les medecins inscrits
--    ordre_pharmaciens     Ordre national des pharmaciens : idem pour les
--                          pharmacies
--    centre_numerique      centre national de sante numerique : attribue
--                          les roles, regle la plateforme, lit le journal
-- =====================================================================
alter type role_utilisateur add value if not exists 'autorite_nationale';
alter type role_utilisateur add value if not exists 'autorite_provinciale';
alter type role_utilisateur add value if not exists 'ordre_medecins';
alter type role_utilisateur add value if not exists 'ordre_pharmaciens';
alter type role_utilisateur add value if not exists 'centre_numerique';

-- Pas de requete de controle ici : l'editeur SQL de Supabase execute tout
-- le fichier dans une seule transaction, et PostgreSQL refuse de lire une
-- valeur d'enum dans la transaction qui l'a creee (erreur 55P04). Pour
-- verifier, executer a part :  select unnest(enum_range(null::role_utilisateur));
