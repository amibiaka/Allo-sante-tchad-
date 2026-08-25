-- =====================================================================
--  ALLO SANTE TCHAD — effacer toutes les donnees de demonstration
--  A lancer AVANT la mise en service reelle.
-- =====================================================================
delete from reponses            where pro_id in (select id from professionnels where demo);
delete from reponses_ordonnance where pharmacie_id in (select id from professionnels where demo);
delete from ordonnances         where demo;
delete from demandes            where demo;
delete from professionnels      where demo;

select 'Donnees de demonstration effacees.' as resultat,
       (select count(*) from professionnels where demo) as reste;
