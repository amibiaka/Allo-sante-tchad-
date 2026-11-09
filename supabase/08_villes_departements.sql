-- =====================================================================
--  Chefs-lieux de departement — ajoutes le 5 septembre 2026
--  Source : liste des departements du Tchad (ordonnance n°001/PR/2024,
--  23 provinces / 120 departements). Seuls les chefs-lieux dont le nom
--  est confirme par la source sont ajoutes.
--  Volontairement SANS coordonnees : on ne devine pas une position dans
--  une application d'urgence. Consequence assumee : la detection
--  automatique par GPS ne propose pas encore ces villes, on les choisit
--  dans la liste. A completer depuis une source officielle.
--  Les graphies arabes sont des translitterations, a faire relire.
-- =====================================================================
insert into villes (province_id, code, nom_fr, nom_ar, chef_lieu, lat, lng) values
  ((select id from provinces where code = 'BAT'), 'BAT-OUM', 'Oum Hadjer', 'أم حجر', false, null, null),
  ((select id from provinces where code = 'BAT'), 'BAT-YAO', 'Yao', 'ياو', false, null, null),
  ((select id from provinces where code = 'BEG'), 'BEG-SAL', 'Salal', 'صلال', false, null, null),
  ((select id from provinces where code = 'BOR'), 'BOR-KIR', 'Kirdimi', 'كرديمي', false, null, null),
  ((select id from provinces where code = 'CHB'), 'CHB-MDL', 'Mandélia', 'مانداليا', false, null, null),
  ((select id from provinces where code = 'CHB'), 'CHB-BOU', 'Bousso', 'بوسو', false, null, null),
  ((select id from provinces where code = 'GUE'), 'GUE-BIT', 'Bitkine', 'بتكين', false, null, null),
  ((select id from provinces where code = 'GUE'), 'GUE-MEL', 'Melfi', 'ملفي', false, null, null),
  ((select id from provinces where code = 'GUE'), 'GUE-MGL', 'Mangalmé', 'منقلمي', false, null, null),
  ((select id from provinces where code = 'HAL'), 'HAL-BOK', 'Bokoro', 'بوكورو', false, null, null),
  ((select id from provinces where code = 'HAL'), 'HAL-MSK', 'Massakory', 'ماساكوري', false, null, null),
  ((select id from provinces where code = 'KAN'), 'KAN-NOK', 'Nokou', 'نوكو', false, null, null),
  ((select id from provinces where code = 'KAN'), 'KAN-MDO', 'Mondo', 'موندو', false, null, null),
  ((select id from provinces where code = 'LAC'), 'LAC-NGO', 'Ngouri', 'نقوري', false, null, null),
  ((select id from provinces where code = 'LOC'), 'LOC-BEI', 'Beinamar', 'بيناما', false, null, null),
  ((select id from provinces where code = 'LOC'), 'LOC-KRI', 'Krim Krim', 'كريم كريم', false, null, null),
  ((select id from provinces where code = 'LOC'), 'LOC-BEN', 'Benoye', 'بنوي', false, null, null),
  ((select id from provinces where code = 'LOR'), 'LOR-BOD', 'Bodo', 'بودو', false, null, null),
  ((select id from provinces where code = 'LOR'), 'LOR-BEB', 'Béboto', 'بيبوتو', false, null, null),
  ((select id from provinces where code = 'LOR'), 'LOR-BBD', 'Bébédjia', 'بيبيجيا', false, null, null),
  ((select id from provinces where code = 'LOR'), 'LOR-GOR', 'Goré', 'قوري', false, null, null),
  ((select id from provinces where code = 'LOR'), 'LOR-BAI', 'Baïbokoum', 'بايبوكوم', false, null, null),
  ((select id from provinces where code = 'MAN'), 'MAN-MOI', 'Moïssala', 'مويسالا', false, null, null),
  ((select id from provinces where code = 'MAN'), 'MAN-BED', 'Bédjondo', 'بيجوندو', false, null, null),
  ((select id from provinces where code = 'MKE'), 'MKE-GNG', 'Gounou Gaya', 'قونو قايا', false, null, null),
  ((select id from provinces where code = 'MKE'), 'MKE-GUL', 'Guélengdeng', 'قيلنغدنغ', false, null, null),
  ((select id from provinces where code = 'MKE'), 'MKE-FIA', 'Fianga', 'فيانغا', false, null, null),
  ((select id from provinces where code = 'MKO'), 'MKO-LER', 'Léré', 'ليري', false, null, null),
  ((select id from provinces where code = 'MOC'), 'MOC-MAR', 'Maro', 'مارو', false, null, null),
  ((select id from provinces where code = 'MOC'), 'MOC-KYA', 'Kyabé', 'كيابي', false, null, null),
  ((select id from provinces where code = 'OUA'), 'OUA-ABD', 'Abdi', 'عبدي', false, null, null),
  ((select id from provinces where code = 'OUA'), 'OUA-ADR', 'Adré', 'أدري', false, null, null),
  ((select id from provinces where code = 'SAL'), 'SAL-ABO', 'Aboudeïa', 'أبو دية', false, null, null),
  ((select id from provinces where code = 'SAL'), 'SAL-HAR', 'Haraze', 'هراز', false, null, null),
  ((select id from provinces where code = 'SIL'), 'SIL-AMD', 'Am Dam', 'أم دم', false, null, null),
  ((select id from provinces where code = 'TAN'), 'TAN-KEL', 'Kélo', 'كيلو', false, null, null),
  ((select id from provinces where code = 'TIB'), 'TIB-ZOU', 'Zouar', 'زوار', false, null, null),
  ((select id from provinces where code = 'WAF'), 'WAF-GUE', 'Guéréda', 'قيريدا', false, null, null),
  ((select id from provinces where code = 'WAF'), 'WAF-IRI', 'Iriba', 'إريبا', false, null, null)
on conflict (code) do update set nom_fr = excluded.nom_fr, nom_ar = excluded.nom_ar;
