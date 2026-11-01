-- =====================================================================
--  13. PHASE PILOTE : garder les soignants inscrits visibles
--  Constat du 1er novembre 2026 : 92 soignants reels sont encore en
--  statut « provisoire », et 88 d'entre eux ont depasse leurs 45 jours
--  sans que la tache planifiee ne les fasse expirer (a verifier dans les
--  journaux Netlify). Decision d'Amine : tout reste operationnel pendant
--  la phase pilote, le temps que les Ordres valident les inscriptions
--  depuis le nouveau back-office. On prolonge donc les periodes de
--  verification de 120 jours, et on l'inscrit au journal.
--  Re-executable : ne prolonge que ce qui est deja echu ou proche de l'etre.
-- =====================================================================
with maj as (
  update professionnels
     set probation_fin = greatest(coalesce(probation_fin, now()), now()) + interval '120 days',
         updated_at = now()
   where statut = 'provisoire'
     and demo is not true
     and service_officiel is not true
     and (probation_fin is null or probation_fin < now() + interval '30 days')
  returning id
)
insert into journal_admin (admin_id, action, cible_type, cible_id, detail)
select null, 'probation:prolongation_pilote', 'professionnel', id::text,
       jsonb_build_object('jours', 120, 'motif', 'phase pilote, validation par les Ordres a venir')
  from maj;

select statut, count(*) as n,
       min(probation_fin)::date as premiere_echeance,
       max(probation_fin)::date as derniere_echeance
  from professionnels
 where demo is not true and service_officiel is not true
 group by statut order by 1;
