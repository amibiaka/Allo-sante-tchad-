/* =====================================================================
 * GRAPHIQUES — SVG en ligne, sans bibliotheque.
 * Quatre formes, choisies par le travail que le lecteur doit faire :
 *   - BarresH   : comparer des grandeurs (barres horizontales classees)
 *   - Courbe    : suivre une evolution dans le temps
 *   - Empilees  : comparer des parts au sein de plusieurs groupes
 *   - Camembert : une seule repartition, six parts au plus (le reste
 *                 tombe dans « Autres »)
 * Regles fixes : marques fines, une seule couleur quand une seule serie,
 * couleurs attribuees dans un ordre fixe quand il y en a plusieurs,
 * legende des qu'il y a deux series, le texte ne porte jamais la couleur
 * de la serie, et un tableau accompagne toujours le dessin.
 * Palette categorielle validee (daltonisme, contraste) ; palette
 * sequentielle : un seul bleu, du clair au fonce.
 * ===================================================================== */
import { useState } from 'react'

export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const SEQUENTIEL = ['#EAF1F9', '#CFE0F2', '#9DC0E4', '#2E6FB7', '#0B4C8C']
const UNE_SERIE = '#0B4C8C'
const ENCRE = '#04223F'
const ENCRE_DOUCE = 'rgba(4,34,63,.6)'
const GRILLE = '#E7E2D6'
const MAX_SERIES = 7

export const formatNombre = (n, langue = 'fr') => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat(langue === 'ar' ? 'ar-TD-u-nu-latn' : langue === 'en' ? 'en' : 'fr').format(Number(n))
}

/* Couleur sequentielle pour une valeur entre 0 et max. */
export const teinte = (v, max) => {
  if (!max || !v) return SEQUENTIEL[0]
  const i = Math.min(SEQUENTIEL.length - 1, Math.ceil((v / max) * (SEQUENTIEL.length - 1)))
  return SEQUENTIEL[i]
}

/* Garde les N premieres series, regroupe le reste sous « Autres ». */
export function plierSeries(lignes, cleSerie, max = MAX_SERIES, libelleAutres = 'Autres') {
  const totaux = new Map()
  for (const l of lignes) totaux.set(l[cleSerie], (totaux.get(l[cleSerie]) || 0) + Number(l.valeur || 0))
  const ordre = [...totaux.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  if (ordre.length <= max) return { series: ordre, lignes }
  const gardees = new Set(ordre.slice(0, max - 1))
  const pliees = new Map()
  for (const l of lignes) {
    const s = gardees.has(l[cleSerie]) ? l[cleSerie] : libelleAutres
    const autre = cleSerie === 'cle2' ? l.cle1 : l.cle2
    const k = autre + '\u0000' + s
    const e = pliees.get(k) || { ...l, [cleSerie]: s, valeur: 0 }
    e.valeur = Number(e.valeur) + Number(l.valeur || 0)
    pliees.set(k, e)
  }
  return { series: [...ordre.slice(0, max - 1), libelleAutres], lignes: [...pliees.values()] }
}

/* Barre a bout arrondi (4 px) cote donnee, droite cote axe. */
function barre(x, y, w, h, r = 4) {
  if (w <= 0) return ''
  const rr = Math.min(r, w, h / 2)
  return `M${x} ${y} H${x + w - rr} Q${x + w} ${y} ${x + w} ${y + rr} V${y + h - rr} Q${x + w} ${y + h} ${x + w - rr} ${y + h} H${x} Z`
}

/* Classe des elements selon un ordre impose (liste de cles) ; ce qui
   n'y figure pas vient apres, par valeur decroissante. */
export function trierSelon(items, cle, ordre, valeur = (x) => Number(x.valeur) || 0) {
  if (!ordre || !ordre.length) return [...items].sort((a, b) => valeur(b) - valeur(a))
  const rang = new Map(ordre.map((k, i) => [k, i]))
  return [...items].sort((a, b) => {
    const ra = rang.has(cle(a)) ? rang.get(cle(a)) : 1e9, rb = rang.has(cle(b)) ? rang.get(cle(b)) : 1e9
    return ra !== rb ? ra - rb : valeur(b) - valeur(a)
  })
}

const tronquer = (s, n = 22) => (String(s ?? '').length > n ? String(s).slice(0, n - 1) + '…' : String(s ?? ''))

function InfoBulle({ bulle }) {
  if (!bulle) return null
  return (
    <div className="pointer-events-none absolute z-10 rounded-lg border border-sable-300 bg-white px-2 py-1 text-[12px] shadow-carte"
         style={{ left: bulle.x, top: bulle.y, transform: 'translate(-50%, -110%)' }} dir="auto">
      <span className="font-bold">{bulle.titre}</span>{bulle.titre ? ' · ' : ''}<span className="nombres-latins">{bulle.valeur}</span>
    </div>
  )
}

function useBulle() {
  const [bulle, setBulle] = useState(null)
  const montrer = (e, titre, valeur) => {
    const boite = e.currentTarget.closest('[data-graphique]').getBoundingClientRect()
    setBulle({ x: e.clientX - boite.left, y: e.clientY - boite.top, titre, valeur })
  }
  return { bulle, montrer, cacher: () => setBulle(null) }
}

/* ---------------------------------------------------------------------
 * Barres horizontales classees : une serie, une couleur.
 * lignes : [{ cle, valeur }], deja classees ou non (classees ici).
 * ------------------------------------------------------------------- */
export function BarresH({ lignes, langue = 'fr', max = 20, format = (v) => formatNombre(v, langue), hauteurLigne = 26, ordre }) {
  const { bulle, montrer, cacher } = useBulle()
  const rangs = trierSelon(lignes, (l) => l.cle, ordre).slice(0, max)
  const maxi = Math.max(1, ...rangs.map((r) => Number(r.valeur) || 0))
  const L = 320, gauche = 110, droite = 44, H = rangs.length * hauteurLigne + 8
  const largeur = L - gauche - droite
  return (
    <div className="relative" data-graphique dir="ltr">
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" style={{ maxHeight: H * 1.6 }}>
        {rangs.map((r, i) => {
          const v = Number(r.valeur) || 0
          const w = Math.max(v > 0 ? 3 : 0, (v / maxi) * largeur)
          const y = 4 + i * hauteurLigne
          return (
            <g key={r.cle + i} onMouseMove={(e) => montrer(e, r.cle, format(v))} onMouseLeave={cacher}>
              <rect x={gauche} y={y} width={largeur} height={hauteurLigne - 8} fill="transparent" />
              <text x={gauche - 6} y={y + (hauteurLigne - 8) / 2 + 4} textAnchor="end" fontSize="10.5" fill={ENCRE} fontWeight="600">
                <title>{r.cle}</title>{tronquer(r.cle, 18)}
              </text>
              <path d={barre(gauche, y + 1, w, hauteurLigne - 10)} fill={UNE_SERIE} />
              <text x={gauche + w + 5} y={y + (hauteurLigne - 8) / 2 + 4} fontSize="10.5" fill={ENCRE} className="nombres-latins">{format(v)}</text>
            </g>
          )
        })}
      </svg>
      <InfoBulle bulle={bulle} />
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Courbe temporelle : une ou plusieurs series.
 * points : [{ x: 'YYYY-MM-DD', serie?, valeur }] ; les abscisses sont
 * triees et completees (les jours sans donnee valent 0).
 * ------------------------------------------------------------------- */
export function Courbe({ points, langue = 'fr', libelleSerie = (s) => s, ordreSeries }) {
  const { bulle, montrer, cacher } = useBulle()
  const xs = [...new Set(points.map((p) => p.x))].sort()
  const totaux = new Map()
  for (const p of points) totaux.set(p.serie ?? '', (totaux.get(p.serie ?? '') || 0) + (Number(p.valeur) || 0))
  const series = trierSelon([...totaux.keys()].map((k) => ({ cle: k, valeur: totaux.get(k) })), (x) => x.cle, ordreSeries).map((x) => x.cle)
  const multi = series.length > 1
  const valeurs = new Map(points.map((p) => [(p.serie ?? '') + '\u0000' + p.x, Number(p.valeur) || 0]))
  const maxi = Math.max(1, ...points.map((p) => Number(p.valeur) || 0))
  const L = 320, H = 156, g = 34, d = 12, h = 14, b = 18
  const px = (i) => g + (xs.length > 1 ? (i / (xs.length - 1)) * (L - g - d) : (L - g - d) / 2)
  const py = (v) => h + (1 - v / maxi) * (H - h - b)
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxi * f))
  return (
    <div className="relative" data-graphique dir="ltr">
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img">
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={g} x2={L - d} y1={py(tv)} y2={py(tv)} stroke={GRILLE} strokeWidth="1" />
            <text x={g - 4} y={py(tv) + 3.5} textAnchor="end" fontSize="9.5" fill={ENCRE_DOUCE} className="nombres-latins">{formatNombre(tv, langue)}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const couleur = multi ? PALETTE[si % PALETTE.length] : UNE_SERIE
          const pts = xs.map((x, i) => [px(i), py(valeurs.get(s + '\u0000' + x) || 0)])
          const trace = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')
          const aire = trace + ` L${pts[pts.length - 1][0].toFixed(1)} ${py(0)} L${pts[0][0].toFixed(1)} ${py(0)} Z`
          return (
            <g key={s}>
              {!multi && <path d={aire} fill={couleur} opacity="0.1" />}
              <path d={trace} fill="none" stroke={couleur} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => (
                <g key={i} onMouseMove={(e) => montrer(e, (multi ? libelleSerie(s) + ' · ' : '') + xs[i], formatNombre(valeurs.get(s + '\u0000' + xs[i]) || 0, langue))} onMouseLeave={cacher}>
                  <circle cx={x} cy={y} r="7" fill="transparent" />
                  {(i === pts.length - 1 || xs.length <= 14) && <circle cx={x} cy={y} r="4" fill={couleur} stroke="#fff" strokeWidth="2" />}
                </g>
              ))}
            </g>
          )
        })}
        <text x={g} y={H - 2} fontSize="9.5" fill={ENCRE_DOUCE} className="nombres-latins">{xs[0]}</text>
        {xs.length > 2 && <text x={(g + L - d) / 2} y={H - 2} textAnchor="middle" fontSize="9.5" fill={ENCRE_DOUCE} className="nombres-latins">{xs[Math.floor((xs.length - 1) / 2)]}</text>}
        <text x={L - d} y={H - 2} textAnchor="end" fontSize="9.5" fill={ENCRE_DOUCE} className="nombres-latins">{xs[xs.length - 1]}</text>
      </svg>
      {multi && <Legende series={series.map((s, i) => ({ cle: libelleSerie(s), couleur: PALETTE[i % PALETTE.length] }))} />}
      <InfoBulle bulle={bulle} />
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Barres empilees horizontales : groupes (cle1) x series (cle2).
 * lignes : [{ cle1, cle2, valeur }]
 * ------------------------------------------------------------------- */
export function Empilees({ lignes, langue = 'fr', libelleSerie = (s) => s, maxGroupes = 14, libelleAutres = 'Autres', ordreGroupes, ordreSeries }) {
  const { bulle, montrer, cacher } = useBulle()
  const pli = plierSeries(lignes, 'cle2', MAX_SERIES, libelleAutres)
  const pliees = pli.lignes
  const series = ordreSeries ? trierSelon(pli.series.map((k) => ({ cle: k, valeur: 0 })), (x) => x.cle, ordreSeries).map((x) => x.cle) : pli.series
  const groupes = new Map()
  for (const l of pliees) {
    const g = groupes.get(l.cle1) || { cle: l.cle1, parts: new Map(), total: 0 }
    g.parts.set(l.cle2, (g.parts.get(l.cle2) || 0) + Number(l.valeur || 0))
    g.total += Number(l.valeur || 0)
    groupes.set(l.cle1, g)
  }
  const rangs = trierSelon([...groupes.values()], (r) => r.cle, ordreGroupes, (r) => r.total).slice(0, maxGroupes)
  const maxi = Math.max(1, ...rangs.map((r) => r.total))
  const L = 320, gauche = 100, droite = 40, hl = 24, H = rangs.length * hl + 6
  const largeur = L - gauche - droite
  const couleur = (s) => PALETTE[series.indexOf(s) % PALETTE.length]
  return (
    <div className="relative" data-graphique dir="ltr">
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" style={{ maxHeight: H * 1.6 }}>
        {rangs.map((r, i) => {
          const y = 3 + i * hl
          let x = gauche
          return (
            <g key={r.cle}>
              <text x={gauche - 6} y={y + 12} textAnchor="end" fontSize="10.5" fill={ENCRE} fontWeight="600"><title>{r.cle}</title>{tronquer(r.cle, 16)}</text>
              {series.map((s) => {
                const v = r.parts.get(s) || 0
                if (!v) return null
                const w = (v / maxi) * largeur
                const el = (
                  <rect key={s} x={x} y={y + 1} width={Math.max(0, w - 2)} height={hl - 10} fill={couleur(s)}
                        onMouseMove={(e) => montrer(e, r.cle + ' · ' + libelleSerie(s), formatNombre(v, langue))} onMouseLeave={cacher} />
                )
                x += w
                return el
              })}
              <text x={gauche + (r.total / maxi) * largeur + 4} y={y + 12} fontSize="10.5" fill={ENCRE} className="nombres-latins">{formatNombre(r.total, langue)}</text>
            </g>
          )
        })}
      </svg>
      <Legende series={series.map((s) => ({ cle: libelleSerie(s), couleur: couleur(s) }))} />
      <InfoBulle bulle={bulle} />
    </div>
  )
}

/* ---------------------------------------------------------------------
 * Camembert (anneau) : une repartition, six parts au plus.
 * ------------------------------------------------------------------- */
export function Camembert({ lignes, langue = 'fr', libelleAutres = 'Autres' }) {
  const { bulle, montrer, cacher } = useBulle()
  const tri = [...lignes].map((l) => ({ cle: l.cle, valeur: Number(l.valeur) || 0 })).filter((l) => l.valeur > 0).sort((a, b) => b.valeur - a.valeur)
  const parts = tri.length > 6 ? [...tri.slice(0, 5), { cle: libelleAutres, valeur: tri.slice(5).reduce((a, b) => a + b.valeur, 0) }] : tri
  const total = parts.reduce((a, b) => a + b.valeur, 0) || 1
  const R = 60, r = 36, cx = 70, cy = 70
  let angle = -Math.PI / 2
  const arc = (a0, a1) => {
    const g = 0.03 // ecart entre les parts
    const s = a0 + g / 2, e = a1 - g / 2
    if (e <= s) return ''
    const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
    const [x0, y0] = p(s, R), [x1, y1] = p(e, R), [x2, y2] = p(e, r), [x3, y3] = p(s, r)
    const grand = e - s > Math.PI ? 1 : 0
    return `M${x0} ${y0} A${R} ${R} 0 ${grand} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${grand} 0 ${x3} ${y3} Z`
  }
  return (
    <div className="relative flex flex-wrap items-center gap-3" data-graphique>
      <svg viewBox="0 0 140 140" className="w-36 shrink-0" role="img" dir="ltr">
        {parts.map((p, i) => {
          const a0 = angle, a1 = angle + (p.valeur / total) * 2 * Math.PI
          angle = a1
          return <path key={p.cle} d={arc(a0, a1)} fill={PALETTE[i % PALETTE.length]}
                       onMouseMove={(e) => montrer(e, p.cle, `${formatNombre(p.valeur, langue)} (${Math.round((100 * p.valeur) / total)} %)`)} onMouseLeave={cacher} />
        })}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="15" fontWeight="800" fill={ENCRE} className="nombres-latins">{formatNombre(total, langue)}</text>
      </svg>
      <ul className="min-w-[8rem] grow space-y-1 text-[12.5px]">
        {parts.map((p, i) => (
          <li key={p.cle} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
            <span className="grow truncate" title={p.cle}>{p.cle}</span>
            <span className="shrink-0 nombres-latins">{formatNombre(p.valeur, langue)} · {Math.round((100 * p.valeur) / total)} %</span>
          </li>
        ))}
      </ul>
      <InfoBulle bulle={bulle} />
    </div>
  )
}

export function Legende({ series }) {
  if (!series || series.length < 2) return null
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
      {series.map((s) => (
        <li key={s.cle} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.couleur }} aria-hidden="true" />{s.cle}
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------------
 * Tableau : une dimension (cle, valeur) ou deux (croise, cellules
 * teintees du clair au fonce).
 * ------------------------------------------------------------------- */
export function TableauStats({ lignes, langue = 'fr', enteteCle1, enteteCle2, enteteValeur, libelleTotal = 'Total', ordreLignes, ordreColonnes }) {
  const croise = lignes.some((l) => l.cle2)
  if (!croise) {
    const total = lignes.reduce((a, l) => a + Number(l.valeur || 0), 0)
    lignes = trierSelon(lignes, (l) => l.cle1, ordreLignes)
    return (
      <div className="overflow-x-auto rounded-xl border-2 border-sable-300 bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b-2 border-sable-300 bg-sable-100"><th className="p-2 text-start font-bold">{enteteCle1}</th><th className="p-2 text-end font-bold">{enteteValeur}</th></tr></thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.cle1 + i} className="border-b border-sable-300 last:border-0">
                <td className="p-2">{l.cle1}</td><td className="p-2 text-end nombres-latins">{formatNombre(l.valeur, langue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-sable-50 font-bold"><td className="p-2">{libelleTotal}</td><td className="p-2 text-end nombres-latins">{formatNombre(total, langue)}</td></tr></tfoot>
        </table>
      </div>
    )
  }
  const colonnes = trierSelon([...new Set(lignes.map((l) => l.cle2))].map((c) => ({ cle: c, valeur: lignes.filter((l) => l.cle2 === c).reduce((a, l) => a + Number(l.valeur || 0), 0) })), (x) => x.cle, ordreColonnes).map((x) => x.cle)
  const rangs = new Map()
  for (const l of lignes) {
    const r = rangs.get(l.cle1) || { cle: l.cle1, cellules: new Map(), total: 0 }
    r.cellules.set(l.cle2, (r.cellules.get(l.cle2) || 0) + Number(l.valeur || 0))
    r.total += Number(l.valeur || 0)
    rangs.set(l.cle1, r)
  }
  const liste = trierSelon([...rangs.values()], (r) => r.cle, ordreLignes, (r) => r.total)
  const maxi = Math.max(1, ...liste.flatMap((r) => [...r.cellules.values()]))
  const totauxCol = colonnes.map((c) => liste.reduce((a, r) => a + (r.cellules.get(c) || 0), 0))
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-sable-300 bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b-2 border-sable-300 bg-sable-100">
            <th className="p-2 text-start font-bold">{enteteCle1} \ {enteteCle2}</th>
            {colonnes.map((c) => <th key={c} className="p-2 text-end font-bold">{c}</th>)}
            <th className="p-2 text-end font-bold">{libelleTotal}</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((r) => (
            <tr key={r.cle} className="border-b border-sable-300 last:border-0">
              <td className="p-2 font-bold">{r.cle}</td>
              {colonnes.map((c) => {
                const v = r.cellules.get(c) || 0
                return <td key={c} className="p-2 text-end nombres-latins" style={{ background: v ? teinte(v, maxi) : undefined, color: v / maxi > 0.6 ? '#fff' : undefined }}>{v ? formatNombre(v, langue) : <span className="opacity-30">·</span>}</td>
              })}
              <td className="p-2 text-end font-bold nombres-latins">{formatNombre(r.total, langue)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-sable-50 font-bold">
            <td className="p-2">{libelleTotal}</td>
            {totauxCol.map((v, i) => <td key={i} className="p-2 text-end nombres-latins">{formatNombre(v, langue)}</td>)}
            <td className="p-2 text-end nombres-latins">{formatNombre(totauxCol.reduce((a, b) => a + b, 0), langue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
