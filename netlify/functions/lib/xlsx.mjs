/* Classeur Excel (.xlsx) ecrit a la main : SpreadsheetML minimal, chaines
   en ligne, un style gras pour les en-tetes, largeurs de colonnes, et la
   feuille de droite a gauche pour l'arabe. */
import { creerZip, xml } from './zip.mjs'

const col = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
const nomFeuille = (s, i) => (String(s || 'Feuille ' + (i + 1)).replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Feuille ' + (i + 1))

function cellule(ref, v, style) {
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${style ? ` s="${style}"` : ''}/>`
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"${style ? ` s="${style}"` : ''}><v>${v ? 1 : 0}</v></c>`
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(String(v).slice(0, 32000))}</t></is></c>`
}

/* lignes : tableau de tableaux ; la premiere peut etre un titre (fusion
   visuelle non necessaire). styles : 1 = gras, 2 = titre, 3 = en-tete. */
function feuilleXml({ titre, colonnes, lignes, rtl }) {
  const rangs = []
  let r = 1
  if (titre) { rangs.push(`<row r="${r}">${cellule(`A${r}`, titre, 2)}</row>`); r += 2 }
  rangs.push(`<row r="${r}">${colonnes.map((c, i) => cellule(`${col(i)}${r}`, c, 3)).join('')}</row>`); r += 1
  for (const l of lignes) {
    rangs.push(`<row r="${r}">${l.map((v, i) => cellule(`${col(i)}${r}`, v)).join('')}</row>`); r += 1
  }
  const largeurs = colonnes.map((c, i) => {
    const max = Math.max(String(c).length, ...lignes.slice(0, 200).map((l) => String(l[i] ?? '').length))
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(10, max + 2))}" customWidth="1"/>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${largeurs}</cols><sheetData>${rangs.join('')}</sheetData></worksheet>`
}

export function creerXlsx({ feuilles, langue = 'fr', auteur = 'Afiya' }) {
  const rtl = langue === 'ar'
  const fichiers = []
  const noms = feuilles.map((f, i) => nomFeuille(f.nom, i))
  // noms uniques
  noms.forEach((n, i) => { let k = 1; while (noms.slice(0, i).includes(noms[i])) noms[i] = (n.slice(0, 28) + ' ' + ++k) })
  fichiers.push({ nom: '[Content_Types].xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` })
  fichiers.push({ nom: '_rels/.rels', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` })
  fichiers.push({ nom: 'docProps/core.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>${xml(auteur)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` })
  fichiers.push({ nom: 'docProps/app.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Afiya</Application></Properties>` })
  fichiers.push({ nom: 'xl/workbook.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` })
  fichiers.push({ nom: 'xl/_rels/workbook.xml.rels', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` })
  fichiers.push({ nom: 'xl/styles.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF0B4C8C"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` })
  feuilles.forEach((f, i) => fichiers.push({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: feuilleXml({ ...f, rtl }) }))
  return creerZip(fichiers)
}
