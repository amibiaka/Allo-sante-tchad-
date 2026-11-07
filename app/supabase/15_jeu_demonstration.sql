-- =====================================================================
--  15. JEU DE DEMONSTRATION — novembre 2026 (presentation au ministere)
--  A executer APRES 14_gestion_et_statistiques.sql. Re-executable :
--  remplace la demonstration precedente (celle de 03_ comprise).
--
--  Jeu de donnees FICTIF : aucun de ces soignants n'existe, aucun numero
--  n'est reel (serie 60 00 xx xx), aucun patient n'est reel. Toutes les
--  lignes portent demo = true et ne sont jamais visibles d'un soignant
--  reel ; les statistiques les excluent tant que l'interrupteur
--  « inclure la demonstration » du back-office est eteint.
--  Effacement en un clic : bouton du back-office (effacer_demo()).
--
--  Contenu (~1 600 lignes) :
--   61 soignants et pharmacies dans 20 villes, 320 demandes d'aide sur
--   90 jours (dont un foyer de fievre a Abeche cette semaine, visible
--   dans la veille), ~550 reponses de soignants, 25 transcriptions
--   vocales, 70 ordonnances et leurs reponses de pharmacies, ~130
--   releves de prix, 40 cas d'entraide et leurs reponses, 35 evenements
--   communautaires, 250 declarations de vaccination, 6 publications,
--   3 campagnes, 3 signalements.
--  Les dates sont relatives a aujourd'hui : la demonstration est
--  toujours « fraiche ». Le tirage est fixe (setseed) : relancer le
--  script redonne le meme jeu.
-- =====================================================================

select setseed(0.4242);

-- ---------------------------------------------------------------------
--  0. Retrait de la demonstration precedente (meme ordre qu'effacer_demo)
-- ---------------------------------------------------------------------
do $$ begin
  delete from entraide_reponses where cas_id in (select id from entraide_cas where demo);
  delete from entraide_cas where demo;
  delete from declarations_vaccin where demo;
  delete from evenements_communautaires where demo;
  delete from publications where demo;
  delete from campagnes_vaccination where demo;
  delete from reponses_ordonnance where ordonnance_id in (select id from ordonnances where demo);
  delete from ordonnances where demo;
  delete from reponses where demande_id in (select id from demandes where demo);
  delete from demandes where demo;
  delete from signalements where cible_id in (select id from professionnels where demo);
  delete from releves_prix where pharmacie_id in (select id from professionnels where demo);
  -- Les fiches generees partent ; un vrai compte rattache a la demo reste.
  delete from professionnels where demo and profil_id is null;
end $$;

-- ---------------------------------------------------------------------
--  1. Soignants et pharmacies (61)
-- ---------------------------------------------------------------------
do $$
declare r record; v villes%rowtype; i int := 0; tel text; cree timestamptz; st statut_pro;
begin
  for r in
    select * from (values
      -- nom, type, specialite, ville, statut, en_ligne, anciennete (jours)
      ('Dr Mahamat Saleh Abakar',     'medecin', 'Médecine générale',        'NDJ-NDJ', 'verifie',    true,  380),
      ('Dr Achta Haroun Djimet',      'medecin', 'Pédiatrie',                'NDJ-NDJ', 'verifie',    true,  350),
      ('Dr Ngarmbatina Kemba',        'medecin', 'Chirurgie',                'NDJ-NDJ', 'verifie',    false, 300),
      ('Dr Fatimé Abdoulaye Zakaria', 'medecin', 'Gynécologie-obstétrique',  'NDJ-NDJ', 'verifie',    true,  290),
      ('Dr Djimadoum Nadji',          'medecin', 'Médecine d''urgence',      'NDJ-NDJ', 'verifie',    true,  260),
      ('Dr Hassan Brahim Issa',       'medecin', 'Cardiologie',              'NDJ-NDJ', 'verifie',    false, 240),
      ('Dr Mbaïlassem Rosine',        'medecin', 'Médecine interne',         'NDJ-NDJ', 'verifie',    true,  200),
      ('Dr Issa Youssouf Mahamat',    'medecin', 'Infectiologie',            'NDJ-NDJ', 'provisoire', true,   20),
      ('Dr Allarangar Nodjitoloum',   'medecin', 'Médecine générale',        'LOC-MDU', 'verifie',    true,  310),
      ('Dr Koumtog Ngaryo',           'medecin', 'Pédiatrie',                'LOC-MDU', 'verifie',    false, 150),
      ('Dr Néloumta Madjitoloum',     'medecin', 'Chirurgie',                'MOC-SAR', 'verifie',    true,  270),
      ('Dr Abdelkerim Adoum Hissein', 'medecin', 'Médecine générale',        'OUA-ABE', 'verifie',    true,  330),
      ('Dr Zara Mahamat Nour',        'medecin', 'Gynécologie-obstétrique',  'OUA-ABE', 'verifie',    true,  120),
      ('Dr Béassoum Daniel',          'medecin', 'Médecine générale',        'LOR-DOB', 'verifie',    false, 210),
      ('Dr Djasrabé Clarisse',        'medecin', 'Pédiatrie',                'MKE-BON', 'verifie',    true,  180),
      ('Dr Ahmat Oumar Tidjani',      'medecin', 'Médecine générale',        'GUE-MON', 'verifie',    true,  160),
      ('Dr Khadidja Ali Souleymane',  'medecin', 'Médecine générale',        'SAL-AMT', 'provisoire', true,   12),
      ('Dr Moussa Kodi Barkaï',       'medecin', 'Médecine générale',        'BOR-FAY', 'verifie',    false, 400),
      ('Dr Nadjiadoum Ronel',         'medecin', 'Médecine générale',        'TAN-KEL', 'verifie',    true,   95),
      ('Dr Hawa Brahim Gamar',        'medecin', 'Médecine générale',        'BAT-ATI', 'suspendu',   false, 230),
      ('Inf. Ndoubadoum Ngarta',      'infirmier', 'Soins généraux',         'NDJ-NDJ', 'verifie',    true,  340),
      ('Inf. Mariam Adam Saleh',      'infirmier', 'Soins généraux',         'NDJ-NDJ', 'verifie',    true,  280),
      ('Inf. Djékoundadé Serge',      'infirmier', 'Urgences',               'NDJ-NDJ', 'verifie',    false, 190),
      ('Inf. Aché Mahamat Idriss',    'infirmier', 'Soins généraux',         'NDJ-NDJ', 'provisoire', true,   30),
      ('Inf. Reoular Jonas',          'infirmier', 'Soins généraux',         'LOC-MDU', 'verifie',    true,  220),
      ('Inf. Mbaïrémadji Nadège',     'infirmier', 'Pédiatrie',              'LOC-MDU', 'verifie',    true,  140),
      ('Inf. Haoua Oumar Ali',        'infirmier', 'Soins généraux',         'OUA-ABE', 'verifie',    true,  250),
      ('Inf. Tog-Yeum Célestin',      'infirmier', 'Soins généraux',         'MOC-SAR', 'verifie',    false, 170),
      ('Inf. Nguéadoum Edwige',       'infirmier', 'Soins généraux',         'LOR-DOB', 'verifie',    true,  130),
      ('Inf. Ousmane Abakar Hissein', 'infirmier', 'Soins généraux',         'KAN-MAO', 'verifie',    true,  200),
      ('Inf. Djénabou Mahamat',       'infirmier', 'Soins généraux',         'WAF-BIL', 'verifie',    false, 110),
      ('Inf. Madjimbaye Prosper',     'infirmier', 'Soins généraux',         'MAN-KOU', 'verifie',    true,  160),
      ('Inf. Amné Brahim Abdoulaye',  'infirmier', 'Soins généraux',         'SIL-GOZ', 'provisoire', true,   25),
      ('Inf. Kaltouma Issa',          'infirmier', 'Soins généraux',         'LAC-BOL', 'verifie',    true,   90),
      ('Inf. Wang-Yang Désiré',       'infirmier', 'Soins généraux',         'MKO-PAL', 'verifie',    false, 140),
      ('SF Hadjé Fatimé Oumar',       'sage_femme', 'Maternité',             'NDJ-NDJ', 'verifie',    true,  320),
      ('SF Néloumngar Mireille',      'sage_femme', 'Maternité',             'NDJ-NDJ', 'verifie',    true,  210),
      ('SF Amina Youssouf Abakar',    'sage_femme', 'Maternité',             'NDJ-NDJ', 'provisoire', true,   40),
      ('SF Djimrangar Lydie',         'sage_femme', 'Maternité',             'LOC-MDU', 'verifie',    true,  260),
      ('SF Mariam Hassan Djibrine',   'sage_femme', 'Maternité',             'OUA-ABE', 'verifie',    false, 180),
      ('SF Ndilbé Pauline',           'sage_femme', 'Maternité',             'MOC-SAR', 'verifie',    true,  150),
      ('SF Zénaba Adoum',             'sage_femme', 'Maternité',             'GUE-MON', 'verifie',    true,  120),
      ('SF Achta Oumar Kodi',         'sage_femme', 'Maternité',             'CHB-MAS', 'expire',     false, 400),
      ('AS Mbaïnaïssem Félix',        'aide_soignant', 'Soins à domicile',   'NDJ-NDJ', 'verifie',    true,  100),
      ('AS Khadidja Mahamat Abdallah','aide_soignant', 'Soins à domicile',   'NDJ-NDJ', 'provisoire', true,   15),
      ('AS Ngarndoh Rodrigue',        'aide_soignant', 'Soins à domicile',   'LOC-MDU', 'verifie',    false, 80),
      ('AS Haroun Abdelkerim',        'aide_soignant', 'Soins à domicile',   'OUA-ABE', 'provisoire', true,   35),
      ('Pharmacie de la Paix',        'pharmacie', null,                     'NDJ-NDJ', 'verifie',    true,  390),
      ('Pharmacie Chagoua',           'pharmacie', null,                     'NDJ-NDJ', 'verifie',    true,  360),
      ('Pharmacie du Marché Central', 'pharmacie', null,                     'NDJ-NDJ', 'verifie',    true,  330),
      ('Pharmacie Moursal',           'pharmacie', null,                     'NDJ-NDJ', 'verifie',    false, 300),
      ('Pharmacie Dembé',             'pharmacie', null,                     'NDJ-NDJ', 'provisoire', true,   22),
      ('Pharmacie Espoir',            'pharmacie', null,                     'LOC-MDU', 'verifie',    true,  280),
      ('Pharmacie du Logone',         'pharmacie', null,                     'LOC-MDU', 'verifie',    true,  200),
      ('Pharmacie du Chari',          'pharmacie', null,                     'MOC-SAR', 'verifie',    true,  240),
      ('Pharmacie Ouaddaï',           'pharmacie', null,                     'OUA-ABE', 'verifie',    true,  260),
      ('Pharmacie Mayo-Kebbi',        'pharmacie', null,                     'MKE-BON', 'verifie',    false, 150),
      ('Ph. Abakar Mahamat Zene',     'pharmacien', 'Pharmacien d''officine','NDJ-NDJ', 'verifie',    true,  120),
      ('Ph. Ndoumbé Larissa',         'pharmacien', 'Pharmacien d''officine','NDJ-NDJ', 'provisoire', true,   18),
      ('Ph. Souleymane Adoum Hassan', 'pharmacien', 'Pharmacien d''officine','OUA-ABE', 'verifie',    true,   90),
      ('Ph. Béchir Ahmat Oumar',      'pharmacien', 'Pharmacien d''officine','LOC-MDU', 'verifie',    false, 60)
    ) as t(nom, type, specialite, ville, statut, en_ligne, anciennete)
  loop
    i := i + 1;
    select * into v from villes where code = r.ville;
    if v.id is null then raise exception 'ville inconnue %', r.ville; end if;
    tel := '6000' || lpad(i::text, 4, '0');
    cree := now() - make_interval(days => r.anciennete, mins => floor(random() * 1440)::int);
    st := r.statut::statut_pro;
    insert into professionnels (type, nom, specialite, province_id, ville_id, quartier_id, adresse_texte, telephone, whatsapp, horaires,
                                lat, lng, statut, probation_fin, verifie_le, en_ligne, derniere_activite, service_officiel, numero_confirme, demo, created_at)
    values (r.type::type_pro, r.nom, r.specialite, v.province_id, v.id,
            case when r.ville = 'NDJ-NDJ' then (select q.id from quartiers q where q.ville_id = v.id and q.approuve order by random() limit 1) end,
            case when r.type in ('pharmacie') then (array['Avenue Charles de Gaulle', 'Rue du Marché', 'Face à la grande mosquée', 'Carrefour de la gare routière', 'Avenue Mobutu'])[1 + floor(random() * 5)::int] end,
            tel, case when random() < 0.85 then tel end,
            case when r.type = 'pharmacie' then 'Lun–Sam 7h30–21h, garde selon rotation' when random() < 0.5 then 'Tous les jours 8h–20h' else 'Lun–Ven 8h–17h, urgences 24h/24' end,
            case when v.lat is not null then v.lat + (random() - 0.5) * 0.06 end,
            case when v.lng is not null then v.lng + (random() - 0.5) * 0.06 end,
            st,
            case when st = 'provisoire' then cree + interval '45 days' when st = 'expire' then cree + interval '45 days' end,
            case when st in ('verifie','suspendu') then cree + make_interval(days => 3 + floor(random() * 10)::int) end,
            r.en_ligne and st in ('verifie','provisoire'),
            case when st in ('verifie','provisoire') then now() - make_interval(mins => floor(random() * 4320)::int) end,
            false, st = 'verifie', true, cree);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  2. Demandes d'aide (320) et reponses des soignants (~550)
-- ---------------------------------------------------------------------
do $$
declare
  villes_pool text[] := array_fill('NDJ-NDJ'::text, array[53]) || array_fill('LOC-MDU'::text, array[9]) || array_fill('MOC-SAR'::text, array[7])
    || array_fill('OUA-ABE'::text, array[7]) || array_fill('LOR-DOB'::text, array[4]) || array_fill('MKE-BON'::text, array[3]) || array_fill('TAN-KEL'::text, array[3])
    || array_fill('GUE-MON'::text, array[3]) || array_fill('SAL-AMT'::text, array[2]) || array_fill('BAT-ATI'::text, array[2]) || array_fill('KAN-MAO'::text, array[2])
    || array['BOR-FAY','WAF-BIL','MAN-KOU','LAC-BOL','MKO-PAL'];
  cats_pool text[] := array_fill('fievre'::text, array[22]) || array_fill('enfant,fievre'::text, array[10]) || array_fill('accident_route'::text, array[10])
    || array_fill('douleur'::text, array[10]) || array_fill('malaise'::text, array[9]) || array_fill('grossesse'::text, array[8]) || array_fill('accident_domestique'::text, array[5])
    || array_fill('morsure'::text, array[4]) || array_fill('brulure'::text, array[3]) || array_fill('intoxication'::text, array[3]) || array_fill('enfant'::text, array[4])
    || array_fill('autre'::text, array[4]) || array_fill(''::text, array[8]);
  textes jsonb := $j${
    "fievre": ["Fièvre forte depuis deux jours avec frissons et maux de tête.", "Fièvre et vomissements depuis hier soir, très fatigué.", "Fièvre qui ne baisse pas malgré le paracétamol, courbatures partout."],
    "enfant,fievre": ["Mon enfant de 3 ans a une forte fièvre et ne veut plus manger.", "Bébé fiévreux depuis ce matin, pleure beaucoup et respire vite.", "Fièvre chez l'enfant avec une convulsion ce matin, très inquiet."],
    "accident_route": ["Accident de moto, jambe très douloureuse, il ne peut pas se lever.", "Collision entre deux voitures, un blessé saigne à la tête.", "Piéton renversé, conscient mais ne bouge plus le bras."],
    "douleur": ["Douleur violente au ventre depuis ce matin, côté droit.", "Mal de dents insupportable, joue gonflée.", "Douleur dans la poitrine qui irradie vers le bras gauche."],
    "malaise": ["Mon père est tombé, il parle difficilement et sa bouche est déviée.", "Malaise avec sueurs et vertiges, diabétique connu.", "Perte de connaissance quelques secondes, revenu à lui, très faible."],
    "grossesse": ["Enceinte de 8 mois, contractions rapprochées depuis une heure.", "Grossesse de 6 mois, saignements depuis ce matin.", "Le travail a commencé, pas de moyen de transport vers la maternité."],
    "accident_domestique": ["Chute d'un enfant de la terrasse, il saigne du nez.", "Coupure profonde à la main en préparant le repas, saigne beaucoup.", "Choc électrique en branchant un appareil, main engourdie."],
    "morsure": ["Morsure de serpent au pied il y a trente minutes, le pied gonfle.", "Mordu par un chien errant au mollet.", "Piqûre de scorpion cette nuit, douleur très forte."],
    "brulure": ["Brûlure par eau bouillante sur le bras d'un enfant.", "Brûlure au visage avec du charbon, des cloques apparaissent.", "Brûlure à l'huile chaude sur la jambe."],
    "intoxication": ["Plusieurs personnes malades après un repas, vomissements et diarrhée.", "Un enfant a avalé des comprimés trouvés dans la maison.", "Intoxication au charbon dans la chambre, maux de tête et nausées."],
    "enfant": ["Diarrhée depuis trois jours chez un enfant de 2 ans, yeux creux.", "Bébé qui tousse beaucoup et respire vite.", "Enfant qui refuse de boire, très mou."],
    "autre": ["Besoin d'un conseil pour un traitement interrompu.", "Tension très élevée mesurée à la pharmacie.", "Plaie qui ne guérit pas depuis deux semaines."],
    "": ["Besoin d'aide urgente.", "Venez vite s'il vous plaît.", "Quelqu'un est malade à la maison."]
  }$j$;
  transcriptions text[] := array[
    'Allô, s''il vous plaît, c''est pour mon fils, il a la fièvre depuis hier, il tremble beaucoup et il a vomi deux fois ce matin, on est à Walia près de l''école.',
    'Bonjour, il y a eu un accident de moto devant la station, le monsieur saigne à la jambe, il est conscient mais il ne peut pas se lever, venez vite.',
    'Ma femme est enceinte de huit mois, elle a des douleurs très fortes depuis une heure, les contractions reviennent souvent, on n''a pas de voiture.',
    'Mon père a fait un malaise, il est tombé, il parle mal et sa bouche est tordue d''un côté, qu''est-ce qu''on doit faire ?',
    'Un serpent a mordu ma fille au pied il y a quelques minutes, le pied commence à gonfler, on est au village, qu''est-ce qu''on fait en attendant ?',
    'Bonsoir docteur, j''ai une douleur dans la poitrine qui descend dans le bras gauche, je transpire beaucoup, je suis seul à la maison.',
    'الحمى عالية عند البنت من أمس، ما تاكل شي وتتقيأ، نحن في حي ديمبي قريب من السوق.',
    'في حادث موتور قدام المحطة، الراجل ينزف من رجلو، عايزين إسعاف بسرعة.',
    'Le bébé respire très vite, il tire sur les côtes, il a de la fièvre, il a six mois.',
    'Plusieurs personnes sont malades à la maison après le repas de midi, tout le monde vomit, les enfants ont la diarrhée.'];
  descs jsonb; cat text; cats text[]; niv int; vc text; v villes%rowtype; d_id uuid; cree timestamptz;
  age int; sx text; pq text; q_id int; i int; j int; n_ndj int; k int;
  pros uuid[]; p1 uuid; p2 uuid; t1 timestamptz; t2 timestamptz; rc int; handled boolean; dur_min numeric; msg text;
  demandes_ids uuid[];
begin
  -- 2a. 305 demandes reparties, puis 15 du foyer d'Abeche (cette semaine).
  for i in 1..320 loop
    if i <= 305 then
      vc := villes_pool[1 + floor(random() * array_length(villes_pool, 1))::int];
      cat := cats_pool[1 + floor(random() * array_length(cats_pool, 1))::int];
      cree := now() - make_interval(mins => floor(random() * 90 * 1440)::int);
      -- Saison des pluies finissante : davantage de fievres il y a 60 a 90 jours.
      if cree < now() - interval '60 days' and random() < 0.25 then cat := 'fievre'; end if;
    else
      vc := 'OUA-ABE'; cat := 'fievre';
      cree := now() - make_interval(mins => floor(random() * 6 * 1440)::int);
    end if;
    select * into v from villes where code = vc;
    cats := case when cat = '' then '{}'::text[] else string_to_array(cat, ',') end;
    niv := case cat
      when 'accident_route' then case when random() < 0.4 then 1 else 2 end
      when 'morsure' then case when random() < 0.35 then 1 else 2 end
      when 'intoxication' then case when random() < 0.35 then 1 else 2 end
      when 'grossesse' then case when random() < 0.2 then 1 else 2 end
      when 'malaise' then case when random() < 0.3 then 1 when random() < 0.7 then 2 else 3 end
      when 'enfant,fievre' then case when random() < 0.5 then 2 else 3 end
      when 'enfant' then case when random() < 0.5 then 2 else 3 end
      when 'fievre' then case when random() < 0.25 then 2 when random() < 0.8 then 3 else 4 end
      when 'douleur' then case when random() < 0.3 then 2 when random() < 0.8 then 3 else 4 end
      when 'brulure' then case when random() < 0.5 then 2 else 3 end
      when 'accident_domestique' then case when random() < 0.5 then 2 else 3 end
      when 'autre' then case when random() < 0.5 then 3 else 4 end
      else case when random() < 0.5 then 2 else 3 end end;
    if i > 305 then niv := case when random() < 0.3 then 2 else 3 end; end if;
    age := case when cat in ('enfant,fievre','enfant') then floor(random() * 14)::int
                when cat = 'grossesse' then 16 + floor(random() * 25)::int
                when cat = 'malaise' then 30 + floor(random() * 50)::int
                else 15 + floor(random() * 65)::int end;
    sx := case when cat = 'grossesse' then 'F' when random() < 0.52 then 'H' else 'F' end;
    pq := case when cat in ('enfant,fievre','enfant') then 'proche' when random() < 0.55 then 'moi' when random() < 0.85 then 'proche' else 'assiste' end;
    q_id := case when vc = 'NDJ-NDJ' and random() < 0.7 then (select q.id from quartiers q where q.ville_id = v.id and q.approuve order by random() limit 1) end;
    descs := textes -> cat;
    insert into demandes (pour_qui, niveau, categories, description, age_approx, sexe, province_id, ville_id, quartier_id,
                          lieu_texte, lat, lng, contact_tel, contact_whatsapp, contact_visible, consentement, demo, created_at)
    values (pq, niv, cats,
            case when i > 305 then (array['Fièvre élevée avec douleurs articulaires et maux de tête derrière les yeux.', 'Fièvre depuis trois jours, éruption sur la peau, très fatigué.', 'Toute la famille a de la fièvre et des douleurs dans le corps.'])[1 + floor(random() * 3)::int]
                 else descs ->> floor(random() * jsonb_array_length(descs))::int end,
            case when random() < 0.9 then age::text end, case when random() < 0.93 then sx end,
            v.province_id, v.id, q_id,
            case when random() < 0.4 then (array['Près du marché', 'Derrière l''école', 'Face à la mosquée', 'Au bord du goudron', 'Concession à côté du forage'])[1 + floor(random() * 5)::int] end,
            case when v.lat is not null and random() < 0.6 then v.lat + (random() - 0.5) * 0.05 end,
            case when v.lng is not null and random() < 0.6 then v.lng + (random() - 0.5) * 0.05 end,
            case when random() < 0.82 then '6001' || lpad(i::text, 4, '0') end,
            case when random() < 0.4 then '6001' || lpad(i::text, 4, '0') end,
            true, true, true, cree)
    returning id into d_id;
    demandes_ids := demandes_ids || d_id;

    -- 2b. Reponses : prise en charge dans 88 % des cas a N'Djamena, 80 % ailleurs,
    --     jamais si la demande date de moins de 20 minutes.
    handled := random() < case when vc = 'NDJ-NDJ' then 0.88 else 0.80 end and cree < now() - interval '20 minutes';
    if handled then
      select array_agg(p.id order by random()) into pros from professionnels p
       where p.demo and p.ville_id = v.id and p.statut in ('verifie','provisoire')
         and p.type::text in ('medecin','infirmier','sage_femme','aide_soignant')
         and (cat <> 'grossesse' or p.type::text in ('sage_femme','medecin') or random() < 0.3);
      if pros is null then
        select array_agg(p.id order by random()) into pros from professionnels p
         where p.demo and p.ville_id = v.id and p.statut in ('verifie','provisoire') and p.type::text in ('medecin','infirmier','sage_femme','aide_soignant');
      end if;
      if pros is not null then
        p1 := pros[1];
        dur_min := (case when vc = 'NDJ-NDJ' then 4 + random() * 31 else 8 + random() * 62 end) * (case when niv = 1 then 0.6 else 1 end);
        t1 := cree + make_interval(secs => dur_min * 60);
        if t1 > now() then t1 := now() - interval '1 minute'; end if;
        if random() < 0.65 then
          insert into reponses (demande_id, pro_id, action, created_at) values (d_id, p1, 'vu', least(cree + make_interval(mins => 1 + floor(random() * 7)::int), t1 - interval '30 seconds'));
        end if;
        if array_length(pros, 1) >= 2 and random() < 0.35 then
          p2 := pros[2];
          insert into reponses (demande_id, pro_id, action, created_at)
          values (d_id, p2, (case when random() < 0.2 then 'indisponible' else 'vu' end)::action_reponse, least(cree + make_interval(mins => 3 + floor(random() * 17)::int), now() - interval '30 seconds'));
        end if;
        insert into reponses (demande_id, pro_id, action, message, created_at)
        values (d_id, p1, (array['appelle','appelle','appelle','appelle','appelle','en_route','en_route','en_route','whatsapp','whatsapp'])[1 + floor(random() * 10)::int]::action_reponse,
                case when random() < 0.3 then (array['J''arrive, restez en ligne.', 'Je vous appelle tout de suite.', 'Gardez le patient allongé, j''arrive.', 'Je suis à dix minutes.'])[1 + floor(random() * 4)::int] end, t1);
        -- L'escalade ne joue que pour les niveaux vital et urgent, apres 15 minutes sans prise en charge.
        if niv <= 2 and dur_min > 15 and random() < 0.55 then update demandes set escalade_le = cree + interval '15 minutes' where id = d_id; end if;
        if random() < 0.72 and t1 < now() - interval '30 minutes' then
          t2 := t1 + make_interval(mins => 20 + floor(random() * 130)::int);
          if t2 > now() then t2 := now() - interval '1 minute'; end if;
          msg := case when random() < 0.6 then (array['Patient transporté à l''hôpital de district.', 'Conseils donnés par téléphone, orientation vers le centre de santé demain matin.', 'Pris en charge sur place, état stable.', 'Référé à la maternité, accouchement en cours.', 'Pansement fait, retour à domicile avec traitement.', 'Sérum antivenimeux administré au centre de santé.'])[1 + floor(random() * 6)::int] end;
          insert into reponses (demande_id, pro_id, action, message, created_at) values (d_id, p1, 'resolu', msg, t2);
          update demandes set resolu_le = t2 where id = d_id;
        end if;
      end if;
    else
      if niv <= 2 and cree < now() - interval '15 minutes' then
        update demandes set escalade_le = cree + interval '15 minutes' where id = d_id;
      end if;
      if cree < now() - interval '36 hours' then
        update demandes set statut = (case when random() < 0.75 then 'non_pris_en_charge' else 'annule' end)::statut_demande where id = d_id;
      end if;
    end if;
  end loop;

  -- 2c. Transcriptions vocales (25) : la fonction « voix » remplit ces colonnes.
  k := 0;
  for d_id in select id from demandes where demo and niveau <= 2 order by random() limit 25 loop
    k := k + 1;
    j := 1 + ((k - 1) % array_length(transcriptions, 1));
    update demandes
       set transcription = transcriptions[j],
           analyse_vocale = jsonb_build_object(
             'langue', case when j in (7, 8) then 'ar' else 'fr' end,
             'resume', (array['Enfant fébrile avec vomissements', 'Accident de moto, blessé conscient', 'Travail obstétrical, pas de transport', 'Suspicion d''AVC', 'Morsure de serpent au pied', 'Douleur thoracique évocatrice', 'Enfant fébrile, refus alimentaire', 'Accident de moto, hémorragie', 'Détresse respiratoire du nourrisson', 'Toxi-infection alimentaire familiale'])[j],
             'niveau_suggere', (array[2, 1, 1, 1, 1, 1, 2, 1, 1, 2])[j],
             'categories', (array['{fievre,enfant}', '{accident_route}', '{grossesse}', '{malaise}', '{morsure}', '{douleur,malaise}', '{fievre,enfant}', '{accident_route}', '{enfant}', '{intoxication}'])[j]::text[],
             'mots_cles', (array['{fièvre,vomissements,tremblements}', '{moto,saignement,jambe}', '{contractions,huit mois,transport}', '{chute,parole,asymétrie}', '{serpent,gonflement,village}', '{poitrine,bras gauche,sueurs}', '{حمى,تقيؤ}', '{موتور,نزيف}', '{respiration rapide,tirage,fièvre}', '{repas,vomissements,diarrhée}'])[j]::text[],
             'modele', 'claude-haiku', 'duree_s', 8 + floor(random() * 30)::int),
           transcrit_le = created_at + interval '40 seconds'
     where id = d_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  3. Ordonnances (70), reponses de pharmacies (~90), releves de prix
-- ---------------------------------------------------------------------
do $$
declare
  villes_pool text[] := array['NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','LOC-MDU','OUA-ABE','MOC-SAR'];
  medocs text[] := array['Amoxicilline 500 mg, 3 par jour pendant 7 jours', 'Artéméther-luméfantrine adulte, cure complète', 'Paracétamol 1 g et ibuprofène 400 mg', 'Fer + acide folique, 3 mois',
    'Insuline rapide, 2 flacons', 'SRO + zinc pour enfant', 'Métronidazole 500 mg et oméprazole 20 mg', 'Amlodipine 10 mg, 1 mois', 'Ceftriaxone 1 g injectable x 5', 'Salbutamol inhalateur'];
  medoc_cle text[] := array['Amoxicilline 500 mg', 'Artéméther-luméfantrine adulte', 'Paracétamol 1 g', 'Fer acide folique', 'Insuline rapide', 'SRO zinc', 'Métronidazole 500 mg', 'Amlodipine 10 mg', 'Ceftriaxone 1 g injectable', 'Salbutamol inhalateur'];
  prix_base int[] := array[2000, 3500, 1200, 1500, 7000, 600, 1800, 3000, 1800, 4500];
  v villes%rowtype; vc text; o_id uuid; cree timestamptz; diff boolean; ph uuid; phs uuid[]; i int; m int; k int; dispo text; prix int; n_rep int; a_complete boolean;
begin
  for i in 1..70 loop
    vc := villes_pool[1 + floor(random() * 10)::int];
    select * into v from villes where code = vc;
    cree := now() - make_interval(mins => floor(random() * 60 * 1440)::int);
    diff := random() < 0.7;
    m := 1 + floor(random() * 10)::int;
    select array_agg(p.id order by random()) into phs from professionnels p
     where p.demo and p.ville_id = v.id and p.type::text in ('pharmacie','pharmacien') and p.statut in ('verifie','provisoire');
    ph := case when diff then null else phs[1] end;
    insert into ordonnances (note, province_id, ville_id, quartier_id, pharmacie_id, diffusion, contact_tel, livraison_souhaitee, consentement, demo, created_at, expire_le)
    values (medocs[m], v.province_id, v.id,
            case when vc = 'NDJ-NDJ' and random() < 0.6 then (select q.id from quartiers q where q.ville_id = v.id and q.approuve order by random() limit 1) end,
            ph, diff, case when random() < 0.85 then '6002' || lpad(i::text, 4, '0') end, random() < 0.3, true, true, cree, cree + interval '30 days')
    returning id into o_id;
    -- Reponses : 0 a 3 pharmacies en diffusion, la pharmacie choisie dans 80 % des cas sinon.
    n_rep := case when diff then floor(random() * 4)::int else case when random() < 0.8 then 1 else 0 end end;
    n_rep := least(n_rep, coalesce(array_length(phs, 1), 0));
    a_complete := false;
    for k in 1..n_rep loop
      dispo := (array['complete','complete','complete','complete','complete','complete','partielle','partielle','partielle','indisponible','indisponible'])[1 + floor(random() * 11)::int];
      prix := case when dispo <> 'indisponible' then round(prix_base[m] * (0.85 + random() * 0.3) / 50) * 50 end;
      insert into reponses_ordonnance (ordonnance_id, pharmacie_id, disponibilite, prix_indicatif, livraison, message, created_at)
      values (o_id, phs[k], dispo::dispo_ordonnance,
              case when prix is not null then to_char(prix, 'FM999 999') || ' FCFA' end,
              dispo <> 'indisponible' and random() < 0.3,
              case when dispo = 'partielle' then 'Un des produits manque, générique disponible.' when dispo = 'indisponible' then 'Rupture, réapprovisionnement sous trois jours.' when random() < 0.3 then 'Disponible, nous vous attendons.' end,
              least(cree + make_interval(mins => 5 + floor(random() * 115)::int), now()));
      if dispo = 'complete' then a_complete := true; end if;
      if prix is not null then
        insert into releves_prix (pharmacie_id, ordonnance_id, ville_id, medicament, prix_fcfa, conditionnement, created_at)
        values (phs[k], o_id, v.id, medoc_cle[m], prix, 'ordonnance', least(cree + make_interval(mins => 6 + floor(random() * 115)::int), now()));
      end if;
    end loop;
    update ordonnances set statut = case
        when a_complete and random() < 0.8 then 'servie'
        when cree > now() - interval '7 days' then 'ouverte'
        else 'close' end
     where id = o_id;
  end loop;

  -- Panel de prix : 12 medicaments courants releves par les pharmacies de demonstration
  -- de N'Djamena et de Moundou (l'indice median exige au moins trois releves).
  for ph in select p.id from professionnels p where p.demo and p.type::text = 'pharmacie' and p.ville_id in (select id from villes where code in ('NDJ-NDJ','LOC-MDU')) loop
    select ville_id into v.id from professionnels where id = ph;
    for k in 1..12 loop
      insert into releves_prix (pharmacie_id, ville_id, medicament, prix_fcfa, conditionnement, created_at)
      values (ph, v.id,
              (array['Paracétamol 500 mg', 'Amoxicilline 500 mg', 'Artéméther-luméfantrine adulte', 'SRO sachet', 'Zinc 20 mg', 'Métronidazole 500 mg', 'Ibuprofène 400 mg', 'Oméprazole 20 mg', 'Fer acide folique', 'Amlodipine 10 mg', 'Insuline rapide', 'Ceftriaxone 1 g injectable'])[k],
              round((array[325, 2000, 3500, 225, 700, 800, 700, 2200, 1500, 3000, 7000, 1800])[k] * (0.85 + random() * 0.3) / 25) * 25,
              (array['plaquette de 10', 'boîte de 12', 'cure adulte', 'sachet', 'plaquette de 10', 'plaquette de 10', 'plaquette de 10', 'boîte de 14', 'boîte de 30', 'boîte de 30', 'flacon', 'flacon'])[k],
              now() - make_interval(mins => floor(random() * 45 * 1440)::int));
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  4. Entraide entre soignants : 40 cas, ~70 reponses
-- ---------------------------------------------------------------------
do $$
declare r record; auteur uuid; c_id uuid; cree timestamptz; medecins uuid[]; k int; n int;
  reponses text[] := array[
    'Commencez par l''ABC : voies aériennes, respiration, circulation. Allongez, surveillez la conscience et évacuez sans attendre si l''état se dégrade.',
    'Fièvre chez un nourrisson de moins de trois mois : c''est une urgence, référez au centre de santé le plus proche pour bilan et antibiothérapie.',
    'Devant une morsure de serpent : immobiliser le membre, pas de garrot, pas d''incision, évacuer vers le centre qui dispose du sérum. Surveiller saignements et respiration.',
    'Paracétamol à dose adaptée au poids, réhydratation orale par petites gorgées, et test de diagnostic rapide du paludisme avant tout traitement.',
    'Pour la diarrhée avec déshydratation modérée : plan B du protocole, SRO sur quatre heures puis réévaluation ; zinc pendant dix jours.',
    'Hémorragie du post-partum : massage utérin, vérifier la vessie, ocytocine si disponible, voie veineuse et transfert immédiat.',
    'Il faut suspecter une appendicite : à jeun, pas d''antalgique masquant, référer en chirurgie dans la journée.',
    'Les signes que vous décrivez évoquent un AVC : position latérale de sécurité, rien par la bouche, transfert immédiat avec l''heure de début des symptômes.',
    'Brûlure : refroidir à l''eau propre tempérée pendant quinze minutes, couvrir d''un linge propre, pas de dentifrice ni de beurre, évaluer la surface pour décider du transfert.',
    'Chez l''asthmatique en crise : salbutamol en inhalation répétée, position assise, oxygène si possible ; si pas d''amélioration en vingt minutes, évacuer.',
    'Pensez à la pré-éclampsie si la tension est élevée avec céphalées et œdèmes : repos, sulfate de magnésium si disponible, transfert vers une maternité équipée.',
    'La convulsion fébrile simple s''arrête seule en moins de cinq minutes ; sécuriser, position latérale, faire baisser la fièvre, puis chercher la cause.',
    'Devant une plaie souillée : lavage abondant à l''eau propre et au savon, vaccination antitétanique à vérifier, antibiotique si signes d''infection.',
    'Je suis d''accord avec la conduite proposée. Ajoutez une surveillance de la diurèse et réévaluez dans deux heures.',
    'Vous pouvez m''écrire sur WhatsApp par le bouton du cas, je vous envoie le protocole en image.'];
begin
  select array_agg(p.id) into medecins from professionnels p where p.demo and p.type::text = 'medecin' and p.statut = 'verifie';
  for r in
    select * from (values
      -- auteur (type, ville), specialite, urgence, titre, description, jours
      ('infirmier',  'KAN-MAO', 'pediatrie',   1, 'Nourrisson de deux mois, fièvre et refus de téter', 'Nourrisson de deux mois, fièvre à trente-neuf, refuse de téter depuis ce matin, pas de convulsion. Pas de médecin au poste ce soir. Quel traitement en attendant l''évacuation demain matin ?', 2),
      ('infirmier',  'WAF-BIL', 'infectieux',  2, 'Fièvre persistante malgré un traitement antipaludique complet', 'Homme de trente ans, fièvre depuis huit jours malgré une cure complète d''artéméther-luméfantrine, test rapide négatif aujourd''hui. Pas de toux. Que rechercher et que proposer ?', 5),
      ('sage_femme', 'GUE-MON', 'obstetrique', 1, 'Saignement abondant après accouchement à domicile', 'Femme de vingt-cinq ans, accouchement à domicile il y a une heure, placenta sorti, saignement qui continue, pâle. Massage utérin fait. Pas d''ocytocine disponible. Conduite à tenir avant le transfert ?', 9),
      ('infirmier',  'LAC-BOL', 'urgences',    1, 'Morsure de serpent, pied très gonflé, pas de sérum au poste', 'Garçon de douze ans mordu au pied il y a deux heures, gonflement jusqu''au genou, douleur forte, pas de saignement des gencives. Le sérum est à quatre heures de route. Que faire en attendant ?', 12),
      ('aide_soignant','LOC-MDU','pediatrie',  2, 'Enfant de trois ans avec diarrhée et yeux creux', 'Enfant de trois ans, diarrhée liquide depuis deux jours, boit avidement, yeux creux, pli cutané lent. Quelle quantité de SRO et quand référer ?', 14),
      ('infirmier',  'MOC-SAR', 'medecine_interne', 2, 'Tension très élevée chez un homme de soixante ans', 'Homme de soixante ans, tension à vingt et un sur douze, maux de tête, pas de trouble de la parole. Il a arrêté son traitement il y a un mois. Faut-il faire baisser vite ?', 16),
      ('infirmier',  'LOR-DOB', 'infectieux',  2, 'Plusieurs cas de diarrhée aqueuse dans le même quartier', 'Six patients du même quartier en deux jours avec diarrhée aqueuse abondante et vomissements, deux déshydratés sévères. Dois-je déclarer et comment organiser la réhydratation ?', 18),
      ('sage_femme', 'OUA-ABE', 'obstetrique', 2, 'Grossesse de sept mois, tension élevée et œdèmes', 'Femme enceinte de sept mois, tension à quinze sur dix, œdèmes des jambes, céphalées. Pas de protéinurie faite. Conduite à tenir au poste ?', 20),
      ('infirmier',  'NDJ-NDJ', 'urgences',    2, 'Brûlure par eau bouillante chez un enfant, quelle surface ?', 'Enfant de quatre ans, brûlure du bras et d''une partie du thorax par eau bouillante, cloques. Comment évaluer la surface et décider du transfert ?', 22),
      ('infirmier',  'TAN-KEL', 'pediatrie',   2, 'Toux avec respiration rapide chez un nourrisson', 'Nourrisson de huit mois, toux depuis trois jours, respiration à cinquante-cinq par minute, tirage léger, boit encore. Antibiotique oral ou transfert ?', 24),
      ('infirmier',  'SAL-AMT', 'medecine_interne', 3, 'Diabétique connu, glycémie très haute, pas d''insuline', 'Femme de quarante-cinq ans, diabétique, glycémie très élevée au lecteur, soif intense, pas de trouble de conscience. Rupture d''insuline au poste. Que faire ?', 26),
      ('aide_soignant','OUA-ABE','autre',      3, 'Plaie chronique du pied qui ne cicatrise pas', 'Homme de cinquante ans, plaie du pied depuis trois semaines, bords sales, pas de fièvre. Comment nettoyer et quand suspecter le diabète ?', 28),
      ('infirmier',  'MKO-PAL', 'infectieux',  2, 'Éruption et fièvre chez plusieurs enfants d''une même école', 'Quatre enfants de la même classe avec fièvre, éruption qui commence au visage, toux et yeux rouges. Rougeole possible ? Que faire pour l''école ?', 30),
      ('infirmier',  'MAN-KOU', 'urgences',    1, 'Accident de moto, fracture ouverte de la jambe', 'Homme de vingt-deux ans, fracture ouverte de la jambe après chute de moto, saignement contrôlé par compression. Transport vers l''hôpital dans trois heures. Comment immobiliser et quoi donner ?', 32),
      ('sage_femme', 'LOC-MDU', 'obstetrique', 2, 'Travail qui n''avance pas depuis douze heures', 'Première grossesse, travail depuis douze heures, col à six centimètres sans changement depuis quatre heures, bébé bouge bien. Référer maintenant ou attendre ?', 34),
      ('infirmier',  'BAT-ATI', 'sante_mentale', 3, 'Jeune homme très agité qui ne dort plus depuis trois jours', 'Jeune homme de vingt ans, agité, parle sans arrêt, ne dort plus depuis trois jours, pas de fièvre, pas de drogue connue. La famille demande de l''aide. Que faire au poste ?', 36),
      ('infirmier',  'NDJ-NDJ', 'pediatrie',   2, 'Convulsion fébrile chez un enfant de deux ans', 'Enfant de deux ans, convulsion de trois minutes ce matin avec fièvre à quarante, maintenant somnolent mais réveillable. Test paludisme positif. Conduite à tenir ?', 38),
      ('infirmier',  'SIL-GOZ', 'infectieux',  3, 'Toux depuis un mois avec amaigrissement', 'Homme de trente-cinq ans, toux depuis plus d''un mois, sueurs la nuit, amaigrissement. Pas de crachat prélevé encore. Que faire et où l''orienter ?', 40),
      ('infirmier',  'LOR-DOB', 'urgences',    2, 'Intoxication après ingestion de pesticide', 'Femme de trente ans a bu un pesticide il y a une heure, vomit, salive beaucoup, pupilles petites. Pas d''atropine au poste. Que faire ?', 42),
      ('sage_femme', 'MOC-SAR', 'obstetrique', 3, 'Vaccination d''une femme enceinte qui n''a jamais été vaccinée', 'Femme enceinte de cinq mois, jamais vaccinée contre le tétanos. Combien de doses et quand pendant la grossesse ?', 44),
      ('aide_soignant','NDJ-NDJ','autre',      3, 'Personne âgée alitée, début d''escarre', 'Femme de soixante-dix ans alitée depuis un mois, rougeur qui ne disparaît pas au sacrum. Comment soigner et prévenir ?', 46),
      ('infirmier',  'KAN-MAO', 'infectieux',  2, 'Enfant avec gonflement douloureux du cou et fièvre', 'Enfant de sept ans, gonflement des deux côtés du cou devant les oreilles, fièvre modérée, douleur en mâchant. Oreillons ? Isolement et traitement ?', 48),
      ('infirmier',  'OUA-ABE', 'infectieux',  2, 'Fièvre avec douleurs articulaires et éruption, plusieurs cas', 'Depuis une semaine, plusieurs patients avec fièvre élevée, douleurs articulaires, maux de tête derrière les yeux, éruption. Tests paludisme négatifs. Dengue possible ? Que surveiller ?', 3),
      ('infirmier',  'GUE-MON', 'urgences',    1, 'Homme inconscient après une piqûre d''insecte', 'Homme de quarante ans, piqué par une guêpe il y a vingt minutes, lèvres gonflées, respiration sifflante, somnolent. Adrénaline disponible. Dose et voie ?', 50),
      ('infirmier',  'LAC-BOL', 'pediatrie',   2, 'Malnutrition sévère avec œdèmes chez un enfant', 'Enfant de deux ans avec œdèmes des deux pieds, cheveux décolorés, apathique, ne mange pas. Pas d''unité nutritionnelle à moins de deux heures. Que faire avant le transfert ?', 52),
      ('infirmier',  'NDJ-NDJ', 'medecine_interne', 3, 'Douleur thoracique chez un homme de cinquante ans, que faire au poste ?', 'Homme de cinquante ans, douleur dans la poitrine depuis une heure, irradiant au bras gauche, sueurs, tension correcte. Aspirine disponible. Conduite à tenir en attendant l''ambulance ?', 54),
      ('sage_femme', 'NDJ-NDJ', 'obstetrique', 3, 'Nouveau-né avec jaunisse à trois jours de vie', 'Nouveau-né de trois jours, jaunisse jusqu''au ventre, tète bien, selles normales. Quand faut-il s''inquiéter et référer ?', 56),
      ('infirmier',  'MKE-BON', 'infectieux',  2, 'Morsure de chien errant, pas de vaccin antirabique au poste', 'Enfant de neuf ans mordu au mollet par un chien errant ce matin, plaie lavée au savon. Vaccin antirabique disponible seulement en ville. Délai acceptable ?', 58),
      ('infirmier',  'LOC-MDU', 'urgences',    2, 'Électrisation domestique, brûlure de la main', 'Homme de trente ans électrisé en branchant un appareil, brûlure de la paume, pas de perte de connaissance, pouls régulier. Faut-il référer pour surveillance cardiaque ?', 60),
      ('aide_soignant','LOC-MDU','autre',      3, 'Comment organiser une séance d''éducation sur le lavage des mains ?', 'Je dois animer une séance au marché sur le lavage des mains et la prévention du choléra. Avez-vous un déroulé simple et des messages clés ?', 61),
      ('infirmier',  'BOR-FAY', 'medecine_interne', 3, 'Coup de chaleur chez un travailleur, température très élevée', 'Homme de vingt-huit ans, travail au soleil, confus, peau chaude et sèche, température très élevée. Comment refroidir vite au poste ?', 7),
      ('infirmier',  'MOC-SAR', 'pediatrie',   2, 'Enfant qui a avalé des comprimés de fer', 'Enfant de trois ans a avalé une dizaine de comprimés de fer il y a une heure, vomissements. Centre antipoison injoignable. Que faire ?', 11),
      ('infirmier',  'NDJ-NDJ', 'infectieux',  3, 'Patient sous traitement antituberculeux qui a arrêté deux semaines', 'Homme de quarante ans sous traitement antituberculeux depuis trois mois, arrêt de deux semaines faute de moyens pour venir. Reprendre ou recommencer ?', 13),
      ('sage_femme', 'OUA-ABE', 'obstetrique', 2, 'Siège à terme découvert au début du travail', 'Femme à terme, deuxième grossesse, présentation du siège découverte au début du travail, col à quatre centimètres. Maternité chirurgicale à deux heures. Transférer maintenant ?', 15),
      ('infirmier',  'TAN-KEL', 'urgences',    2, 'Noyade d''un enfant, réanimé, respire mais tousse', 'Enfant de six ans sorti de la rivière, réanimé par les villageois, respire, tousse beaucoup, somnolent. Faut-il le surveiller au poste ou référer ?', 17),
      ('infirmier',  'SAL-AMT', 'infectieux',  3, 'Suspicion de méningite, quel traitement avant le transfert ?', 'Adolescent de quinze ans, fièvre, raideur de la nuque, vomissements, pas de purpura. Ceftriaxone disponible. Dose et conduite avant transfert ?', 19),
      ('infirmier',  'WAF-BIL', 'autre',       3, 'Comment stocker les vaccins en cas de coupure de courant prolongée ?', 'Coupure de courant depuis vingt heures, le réfrigérateur des vaccins ne marche plus, pas de groupe électrogène. Jusqu''à quand les vaccins restent-ils utilisables ?', 21),
      ('infirmier',  'LOR-DOB', 'pediatrie',   2, 'Nourrisson qui vomit tout depuis deux jours', 'Nourrisson de cinq semaines, vomissements en jet après chaque tétée depuis deux jours, a faim, perd du poids. Pas de fièvre. Que suspecter ?', 23),
      ('aide_soignant','NDJ-NDJ','sante_mentale',3,'Femme qui pleure sans arrêt deux semaines après l''accouchement', 'Femme de vingt-huit ans, accouchement il y a deux semaines, pleure sans arrêt, ne dort pas, dit qu''elle n''y arrivera pas. Comment l''aider et vers qui l''orienter ?', 25),
      ('infirmier',  'MAN-KOU', 'infectieux',  3, 'Ulcère génital indolore chez un homme jeune', 'Homme de vingt-cinq ans, ulcère génital indolore depuis une semaine, ganglion à l''aine. Quel traitement syndromique et faut-il traiter la partenaire ?', 27)
    ) as t(type_auteur, ville, specialite, urgence, titre, description, jours)
  loop
    select p.id into auteur from professionnels p join villes v on v.id = p.ville_id
     where p.demo and v.code = r.ville and p.type::text = r.type_auteur and p.statut in ('verifie','provisoire') order by random() limit 1;
    if auteur is null then
      select p.id into auteur from professionnels p join villes v on v.id = p.ville_id
       where p.demo and v.code = r.ville and p.type::text in ('infirmier','sage_femme','aide_soignant','medecin') order by random() limit 1;
    end if;
    cree := now() - make_interval(days => r.jours, mins => floor(random() * 900)::int);
    insert into entraide_cas (auteur_pro, specialite, urgence, titre, description, whatsapp_ok, demo, created_at, updated_at)
    values (auteur, r.specialite, r.urgence, r.titre, r.description, random() < 0.8, true, cree, cree) returning id into c_id;
    -- 75 % des cas recoivent une a trois reponses de medecins.
    if random() < 0.75 then
      n := 1 + floor(random() * 3)::int;
      for k in 1..n loop
        insert into entraide_reponses (cas_id, auteur_pro, texte, created_at)
        values (c_id, medecins[1 + floor(random() * array_length(medecins, 1))::int],
                reponses[1 + floor(random() * array_length(reponses, 1))::int],
                least(cree + make_interval(mins => 10 + floor(random() * 600)::int * k), now()));
      end loop;
      if random() < 0.4 then
        update entraide_cas set statut = 'clos', clos_le = least(cree + interval '2 days', now()) where id = c_id;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  5. Evenements communautaires (35)
-- ---------------------------------------------------------------------
do $$
declare
  villes_pool text[] := array['NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','NDJ-NDJ','LOC-MDU','LOC-MDU','MOC-SAR','OUA-ABE','OUA-ABE','LOR-DOB','MKE-BON','GUE-MON','SAL-AMT','KAN-MAO','LAC-BOL','BAT-ATI','WAF-BIL','TAN-KEL','MAN-KOU','SIL-GOZ'];
  types text[] := array_fill('malades_groupes'::text, array[15]) || array_fill('eau_suspecte'::text, array[8]) || array_fill('deces_inhabituels'::text, array[4]) || array_fill('animaux_morts'::text, array[5]) || array_fill('autre'::text, array[3]);
  statuts text[] := array_fill('nouveau'::text, array[8]) || array_fill('en_verification'::text, array[7]) || array_fill('confirme'::text, array[9]) || array_fill('transmis'::text, array[6]) || array_fill('ecarte'::text, array[5]);
  descs jsonb := $j${
    "malades_groupes": ["Plusieurs enfants du quartier ont de la fièvre et des vomissements depuis deux jours.", "Une dizaine de personnes malades après la cérémonie de samedi, diarrhée et vomissements.", "Des élèves de l'école ont une éruption et de la fièvre, la classe est à moitié vide."],
    "eau_suspecte": ["L'eau du forage a changé de couleur et sent mauvais, plusieurs cas de diarrhée depuis.", "Le puits du quartier est trouble depuis les pluies, les enfants sont malades.", "Un animal mort a été trouvé dans la mare où les gens puisent l'eau."],
    "deces_inhabituels": ["Trois décès en une semaine dans le même village après une forte fièvre.", "Deux enfants décédés en trois jours dans la même concession, fièvre et convulsions."],
    "animaux_morts": ["Une dizaine de bovins morts près du marigot en trois jours.", "Des volailles meurent en grand nombre dans plusieurs concessions.", "Plusieurs chèvres mortes brutalement, sans blessure visible."],
    "autre": ["Fumées d'une décharge brûlée, toux et yeux qui piquent dans tout le quartier.", "Beaucoup de moustiques depuis les inondations, cas de fièvre en hausse.", "Odeur chimique forte près de l'usine, maux de tête des riverains."]
  }$j$;
  v villes%rowtype; vc text; ty text; st text; cree timestamptz; i int; d jsonb;
begin
  for i in 1..35 loop
    vc := villes_pool[1 + floor(random() * array_length(villes_pool, 1))::int];
    select * into v from villes where code = vc;
    ty := types[i]; st := statuts[1 + floor(random() * array_length(statuts, 1))::int];
    cree := now() - make_interval(mins => floor(random() * 75 * 1440)::int);
    if st = 'nouveau' then cree := now() - make_interval(mins => floor(random() * 5 * 1440)::int); end if;
    d := descs -> ty;
    insert into evenements_communautaires (code, type, nb_personnes, ville_id, province_id, quartier_id, lieu_texte, description, contact_tel, debut_estime, statut, note_autorite, traite_le, demo, created_at)
    values ('A-' || upper(substr(translate(replace(gen_random_uuid()::text, '-', ''), '0o1il', 'XYZWV'), 1, 4)), ty,
            case ty when 'malades_groupes' then 4 + floor(random() * 36)::int when 'eau_suspecte' then floor(random() * 20)::int when 'deces_inhabituels' then 2 + floor(random() * 4)::int when 'autre' then floor(random() * 15)::int else 0 end,
            v.id, v.province_id,
            case when vc = 'NDJ-NDJ' then (select q.id from quartiers q where q.ville_id = v.id and q.approuve order by random() limit 1) end,
            (array['Quartier près du marché', 'Village à la sortie de la ville', 'Concession derrière l''école', 'Autour du forage principal', 'Camp des déplacés'])[1 + floor(random() * 5)::int],
            d ->> floor(random() * jsonb_array_length(d))::int,
            case when random() < 0.8 then '6003' || lpad(i::text, 4, '0') end,
            (cree - make_interval(days => 1 + floor(random() * 6)::int))::date,
            st,
            case st when 'confirme' then 'Équipe du district sur place, prélèvements envoyés.' when 'transmis' then 'Transmis à la direction provinciale et au programme concerné.' when 'ecarte' then 'Vérification faite : cas isolés sans lien, pas de foyer.' when 'en_verification' then 'Appel au responsable du centre de santé, visite prévue.' end,
            case when st <> 'nouveau' then least(cree + make_interval(mins => 60 + floor(random() * 2880)::int), now()) end,
            true, cree);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  6. Declarations de vaccination (250)
-- ---------------------------------------------------------------------
do $$
declare
  villes_pool text[] := array_fill('NDJ-NDJ'::text, array[44]) || array_fill('LOC-MDU'::text, array[14]) || array_fill('OUA-ABE'::text, array[12]) || array_fill('MOC-SAR'::text, array[10])
    || array_fill('LOR-DOB'::text, array[6]) || array_fill('MKE-BON'::text, array[5]) || array_fill('GUE-MON'::text, array[4]) || array_fill('SAL-AMT'::text, array[3]) || array_fill('KAN-MAO'::text, array[2]);
  vacc_pool text[] := array_fill('PENTA'::text, array[22]) || array_fill('VPO'::text, array[18]) || array_fill('PCV'::text, array[15]) || array_fill('ROTA'::text, array[10]) || array_fill('RR'::text, array[12])
    || array_fill('BCG'::text, array[8]) || array_fill('VAA'::text, array[6]) || array_fill('MENA'::text, array[3]) || array_fill('R21'::text, array[4]) || array_fill('VPI'::text, array[2]);
  v villes%rowtype; vc text; vacc text; dose int; age int; i int; retard boolean;
begin
  for i in 1..250 loop
    vc := villes_pool[1 + floor(random() * array_length(villes_pool, 1))::int];
    select * into v from villes where code = vc;
    vacc := vacc_pool[1 + floor(random() * array_length(vacc_pool, 1))::int];
    dose := case vacc when 'BCG' then 1 when 'VAA' then 1 when 'MENA' then 1 when 'VPO' then 1 + floor(random() * 4)::int when 'RR' then 1 + floor(random() * 2)::int
                      when 'VPI' then 1 + floor(random() * 2)::int when 'R21' then 1 + floor(random() * 4)::int else 1 + floor(random() * 3)::int end;
    retard := random() > 0.72;
    age := case vacc
      when 'BCG' then case when retard then 1 + floor(random() * 3)::int else 0 end
      when 'VPO' then case dose when 1 then 0 when 2 then 1 when 3 then 2 else 3 end + case when retard then 1 + floor(random() * 4)::int else 0 end
      when 'RR' then case dose when 1 then 9 else 15 end + case when retard then 1 + floor(random() * 6)::int else 0 end
      when 'VAA' then 9 + case when retard then 1 + floor(random() * 6)::int else 0 end
      when 'MENA' then 9 + case when retard then 1 + floor(random() * 6)::int else 0 end
      when 'R21' then case dose when 1 then 6 when 2 then 7 when 3 then 9 else 15 end + case when retard then 1 + floor(random() * 3)::int else 0 end
      when 'VPI' then case dose when 1 then 3 else 9 end + case when retard then 1 + floor(random() * 4)::int else 0 end
      else case dose when 1 then 1 when 2 then 2 else 3 end + case when retard then 1 + floor(random() * 4)::int else 0 end end;
    insert into declarations_vaccin (ville_id, province_id, district_id, vaccin, dose, age_mois, a_l_heure, demo, created_at)
    values (v.id, v.province_id, v.district_id, vacc, dose, age, not retard, true, now() - make_interval(mins => floor(random() * 90 * 1440)::int));
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  7. Publications (6), campagnes (3), signalements (3)
-- ---------------------------------------------------------------------
insert into publications (type, audience, titre, corps, province_id, auteur_role, publie, publie_le, expire_le, demo, created_at) values
 ('alerte', 'public', 'Choléra : les gestes qui protègent',
  'Des cas de choléra sont signalés dans plusieurs provinces. Buvez de l''eau traitée ou bouillie, lavez-vous les mains au savon avant de manger et après les toilettes, et consultez immédiatement en cas de diarrhée aqueuse abondante. Les sels de réhydratation orale sont gratuits dans les centres de santé.',
  null, 'centre_numerique', true, now() - interval '4 days', now() + interval '26 days', true, now() - interval '4 days'),
 ('actualite', 'public', 'Journées nationales de vaccination : du lundi au vendredi prochains',
  'Les équipes passeront dans les quartiers et les villages pour vacciner gratuitement tous les enfants de moins de cinq ans contre la poliomyélite. Préparez le carnet de vaccination de votre enfant.',
  null, 'centre_numerique', true, now() - interval '2 days', now() + interval '12 days', true, now() - interval '2 days'),
 ('directive', 'soignants', 'Conduite à tenir devant une fièvre chez l''enfant de moins de cinq ans',
  'Test de diagnostic rapide du paludisme systématique. Signes de danger à rechercher : convulsions, incapacité de boire, vomissements de tout, léthargie. En leur présence : référence immédiate avec première dose d''artésunate si disponible. Rappel : pas d''aspirine chez l''enfant.',
  null, 'autorite_nationale', true, now() - interval '9 days', null, true, now() - interval '9 days'),
 ('vaccination', 'public', 'Rattrapage rougeole-rubéole à N''Djamena',
  'Tous les enfants de neuf mois à cinq ans peuvent recevoir gratuitement la dose de rattrapage dans les centres de santé de N''Djamena jusqu''à la fin du mois. Apportez le carnet.',
  (select id from provinces where code = 'NDJ'), 'centre_numerique', true, now() - interval '6 days', now() + interval '20 days', true, now() - interval '6 days'),
 ('directive', 'medecins', 'Rappel déontologique : réponse aux demandes de nuit et orientation',
  'L''Ordre rappelle que toute demande vitale vue par un médecin inscrit doit recevoir une réponse (prise en charge ou indisponibilité déclarée) afin que l''escalade puisse jouer. Le conseil téléphonique ne remplace pas l''examen : orientez vers la structure la plus proche.',
  null, 'ordre_medecins', true, now() - interval '12 days', null, true, now() - interval '12 days'),
 ('actualite', 'pharmaciens', 'Pharmacies de garde : nouvelle rotation et déclaration des prix',
  'La rotation des gardes de N''Djamena change le premier du mois. L''Ordre invite les officines à déclarer dans l''application les prix des dix médicaments essentiels afin d''alimenter l''indice public.',
  null, 'ordre_pharmaciens', true, now() - interval '15 days', null, true, now() - interval '15 days');

insert into campagnes_vaccination (nom, vaccins, age_min_mois, age_max_mois, province_id, debut, fin, lieux, message, statut, demo) values
 ('Rattrapage rougeole-rubéole – N''Djamena', '{RR}', 9, 59, (select id from provinces where code = 'NDJ'), current_date - 6, current_date + 20,
  'Tous les centres de santé de N''Djamena, 8h–16h', 'Une dose de rattrapage gratuite pour les enfants de neuf mois à cinq ans. Apportez le carnet.', 'publiee', true),
 ('Journées nationales de vaccination polio', '{VPO}', 0, 59, null, current_date + 3, current_date + 7,
  'Porte à porte dans tous les quartiers et villages', 'Les équipes passent chez vous : deux gouttes pour protéger votre enfant de la poliomyélite.', 'publiee', true),
 ('Fièvre jaune – campagne préventive Ouaddaï', '{VAA}', 9, 240, (select id from provinces where code = 'OUA'), current_date - 45, current_date - 30,
  'Centres de santé des districts d''Abéché et d''Adré', 'Campagne terminée : merci aux familles qui se sont présentées.', 'terminee', true);

insert into signalements (cible_type, cible_id, motif, detail, statut, created_at)
select 'professionnel', p.id, m.motif, m.detail, m.statut, now() - make_interval(days => m.jours)
  from (values
    ('Dr Hawa Brahim Gamar', 'tarif', 'A demandé un paiement avant de se déplacer pour une urgence.', 'ouvert', 6),
    ('Inf. Djékoundadé Serge', 'indisponible', 'Marqué en ligne mais ne répond jamais au téléphone.', 'ouvert', 2),
    ('Pharmacie Dembé', 'autre', 'A vendu un médicament périmé selon le patient.', 'traite', 20)
  ) as m(nom, motif, detail, statut, jours)
  join professionnels p on p.nom = m.nom and p.demo;

-- ---------------------------------------------------------------------
--  Bilan
-- ---------------------------------------------------------------------
select
  (select count(*) from professionnels where demo) as soignants,
  (select count(*) from demandes where demo) as demandes,
  (select count(*) from reponses r join demandes d on d.id = r.demande_id where d.demo) as reponses,
  (select count(*) from demandes where demo and transcription is not null) as transcriptions,
  (select count(*) from ordonnances where demo) as ordonnances,
  (select count(*) from reponses_ordonnance ro join ordonnances o on o.id = ro.ordonnance_id where o.demo) as reponses_pharmacies,
  (select count(*) from releves_prix r join professionnels p on p.id = r.pharmacie_id where p.demo) as releves_prix,
  (select count(*) from entraide_cas where demo) as cas_entraide,
  (select count(*) from entraide_reponses r join entraide_cas c on c.id = r.cas_id where c.demo) as reponses_entraide,
  (select count(*) from evenements_communautaires where demo) as evenements,
  (select count(*) from declarations_vaccin where demo) as vaccins,
  (select count(*) from publications where demo) + (select count(*) from campagnes_vaccination where demo) as publications_campagnes,
  (select count(*) from signalements s join professionnels p on p.id = s.cible_id where p.demo) as signalements;
