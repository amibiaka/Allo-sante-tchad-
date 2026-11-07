-- =====================================================================
--  14a. DEUX TYPES DE SOIGNANTS DE PLUS (a executer SEUL, avant 14_...)
--  L'Ordre des pharmaciens valide les pharmacies ET les pharmaciens ;
--  l'Ordre des medecins valide aussi les aides-soignants.
--  Pas de requete de controle ici : l'editeur SQL de Supabase execute
--  tout le fichier dans une seule transaction, et PostgreSQL refuse de
--  lire une valeur d'enum dans la transaction qui l'a creee (55P04).
--  Pour verifier, a part :  select unnest(enum_range(null::type_pro));
-- =====================================================================
alter type type_pro add value if not exists 'aide_soignant';
alter type type_pro add value if not exists 'pharmacien';
