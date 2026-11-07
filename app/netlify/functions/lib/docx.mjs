/* Document Word (.docx) ecrit a la main : titres, paragraphes, listes,
   tableaux ; sens de lecture de droite a gauche pour l'arabe. */
import { creerZip, xml } from './zip.mjs'

const POLICE = { fr: 'Calibri', en: 'Calibri', ar: 'Arial' }

function rpr(langue, { gras, taille, couleur } = {}) {
  const police = POLICE[langue] || 'Calibri'
  return `<w:rPr><w:rFonts w:ascii="${police}" w:hAnsi="${police}" w:cs="${police}"/>${gras ? '<w:b/><w:bCs/>' : ''}${langue === 'ar' ? '<w:rtl/>' : ''}${taille ? `<w:sz w:val="${taille}"/><w:szCs w:val="${taille}"/>` : ''}${couleur ? `<w:color w:val="${couleur}"/>` : ''}<w:lang w:val="${langue === 'ar' ? 'ar-TD' : langue === 'en' ? 'en-GB' : 'fr-FR'}" w:bidi="ar-TD"/></w:rPr>`
}
function ppr(langue, { style, centre, espaceApres = 120 } = {}) {
  return `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${langue === 'ar' ? '<w:bidi/>' : ''}<w:spacing w:after="${espaceApres}"/>${centre ? '<w:jc w:val="center"/>' : langue === 'ar' ? '<w:jc w:val="right"/>' : ''}</w:pPr>`
}
const texte = (s) => `<w:t xml:space="preserve">${xml(s)}</w:t>`

export function paragraphe(langue, s, opts = {}) {
  return `<w:p>${ppr(langue, opts)}<w:r>${rpr(langue, opts)}${texte(s)}</w:r></w:p>`
}
export function titre(langue, s, niveau = 1) {
  return paragraphe(langue, s, { style: 'Heading' + niveau, gras: true, taille: niveau === 1 ? 32 : niveau === 2 ? 26 : 22, couleur: '0B4C8C', espaceApres: 160 })
}
export function puce(langue, s) {
  return `<w:p>${ppr(langue, { espaceApres: 60 }).replace('<w:pPr>', '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')}<w:r>${rpr(langue)}${texte(s)}</w:r></w:p>`
}
export function tableau(langue, colonnes, lignes) {
  const cellule = (v, entete) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${entete ? '<w:shd w:val="clear" w:color="auto" w:fill="EAF1F9"/>' : ''}</w:tcPr><w:p>${ppr(langue, { espaceApres: 0 })}<w:r>${rpr(langue, { gras: entete, taille: 18 })}${texte(v === null || v === undefined ? '' : String(v))}</w:r></w:p></w:tc>`
  const rang = (vals, entete) => `<w:tr>${entete ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${vals.map((v) => cellule(v, entete)).join('')}</w:tr>`
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>${langue === 'ar' ? '<w:bidiVisual/>' : ''}<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D3CCBB"/><w:left w:val="single" w:sz="4" w:color="D3CCBB"/><w:bottom w:val="single" w:sz="4" w:color="D3CCBB"/><w:right w:val="single" w:sz="4" w:color="D3CCBB"/><w:insideH w:val="single" w:sz="4" w:color="D3CCBB"/><w:insideV w:val="single" w:sz="4" w:color="D3CCBB"/></w:tblBorders><w:tblLook w:val="04A0"/></w:tblPr>${rang(colonnes, true)}${lignes.map((l) => rang(l, false)).join('')}</w:tbl><w:p/>`
}

/* corps : chaine XML deja assemblee avec les fonctions ci-dessus. */
export function creerDocx({ langue = 'fr', titreDoc = 'Afiya', corps, auteur = 'Afiya' }) {
  const police = POLICE[langue] || 'Calibri'
  const fichiers = [
    { nom: '[Content_Types].xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { nom: '_rels/.rels', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { nom: 'word/_rels/document.xml.rels', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>` },
    { nom: 'docProps/core.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(titreDoc)}</dc:title><dc:creator>${xml(auteur)}</dc:creator><dc:language>${langue}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { nom: 'docProps/app.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Afiya</Application></Properties>` },
    { nom: 'word/settings.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${langue === 'ar' ? '<w:rtlGutter/>' : ''}<w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { nom: 'word/numbering.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>` },
    { nom: 'word/styles.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${police}" w:hAnsi="${police}" w:cs="${police}"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="0B4C8C"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="0B4C8C"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>` },
    { nom: 'word/document.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corps}<w:sectPr>${langue === 'ar' ? '<w:bidi/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1134" w:bottom="1300" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` },
  ]
  return creerZip(fichiers)
}
