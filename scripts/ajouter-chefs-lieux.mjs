/* =====================================================================
 * Aligne src/data/geo.json sur la base : y ajoute les 39 chefs-lieux de
 * departement deja inseres en production le 5 septembre 2026 par
 * supabase/08_villes_departements.sql.
 *   node scripts/ajouter-chefs-lieux.mjs
 * Le fichier geo.json etant trop gros pour l'editeur GitHub en ligne,
 * cette mise a jour se fait depuis un poste avec git. Le script est
 * idempotent : le relancer ne double rien.
 * Sans coordonnees : on ne devine pas une position dans une application
 * d'urgence. Les graphies arabes sont des translitterations, a relire.
 * ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const fichier = join(dirname(fileURLToPath(import.meta.url)), '../src/data/geo.json')

const AJOUTS = {
  BAT: [['OUM', 'Oum Hadjer', 'أم حجر'], ['YAO', 'Yao', 'ياو']],
  BEG: [['SAL', 'Salal', 'صلال']],
  BOR: [['KIR', 'Kirdimi', 'كرديمي']],
  CHB: [['MDL', 'Mandélia', 'مانداليا'], ['BOU', 'Bousso', 'بوسو']],
  GUE: [['BIT', 'Bitkine', 'بتكين'], ['MEL', 'Melfi', 'ملفي'], ['MGL', 'Mangalmé', 'منقلمي']],
  HAL: [['BOK', 'Bokoro', 'بوكورو'], ['MSK', 'Massakory', 'ماساكوري']],
  KAN: [['NOK', 'Nokou', 'نوكو'], ['MDO', 'Mondo', 'موندو']],
  LAC: [['NGO', 'Ngouri', 'نقوري']],
  LOC: [['BEI', 'Beinamar', 'بيناما'], ['KRI', 'Krim Krim', 'كريم كريم'], ['BEN', 'Benoye', 'بنوي']],
  LOR: [['BOD', 'Bodo', 'بودو'], ['BEB', 'Béboto', 'بيبوتو'], ['BBD', 'Bébédjia', 'بيبيجيا'],
        ['GOR', 'Goré', 'قوري'], ['BAI', 'Baïbokoum', 'بايبوكوم']],
  MAN: [['MOI', 'Moïssala', 'مويسالا'], ['BED', 'Bédjondo', 'بيجوندو']],
  MKE: [['GNG', 'Gounou Gaya', 'قونو قايا'], ['GUL', 'Guélengdeng', 'قيلنغدنغ'], ['FIA', 'Fianga', 'فيانغا']],
  MKO: [['LER', 'Léré', 'ليري']],
  MOC: [['MAR', 'Maro', 'مارو'], ['KYA', 'Kyabé', 'كيابي']],
  OUA: [['ABD', 'Abdi', 'عبدي'], ['ADR', 'Adré', 'أدري']],
  SAL: [['ABO', 'Aboudeïa', 'أبو دية'], ['HAR', 'Haraze', 'هراز']],
  SIL: [['AMD', 'Am Dam', 'أم دم']],
  TAN: [['KEL', 'Kélo', 'كيلو']],
  TIB: [['ZOU', 'Zouar', 'زوار']],
  WAF: [['GUE', 'Guéréda', 'قيريدا'], ['IRI', 'Iriba', 'إريبا']],
}

const geo = JSON.parse(readFileSync(fichier, 'utf8'))
let ajoutees = 0

for (const prov of geo.provinces) {
  for (const [suffixe, fr, ar] of AJOUTS[prov.code] || []) {
    const code = `${prov.code}-${suffixe}`
    if (prov.cities.some((c) => c.code === code)) continue
    prov.cities.push({ code, fr, ar, cl: false, lat: null, lng: null, districts: [] })
    ajoutees++
  }
}

geo.version = '2026-09-05'
writeFileSync(fichier, JSON.stringify(geo, null, 1) + '\n')
console.log(`${ajoutees} chefs-lieux ajoutes — ${geo.provinces.reduce((n, p) => n + p.cities.length, 0)} villes au total`)
