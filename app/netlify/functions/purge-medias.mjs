/* =====================================================================
 *  Tache planifiee — chaque nuit a 02h00 UTC (voir netlify.toml)
 *  Supprime les photos d'ordonnance et les messages vocaux arrives a
 *  echeance (30 jours par defaut), en base ET dans le stockage.
 *  Aucune dependance.
 * ===================================================================== */
const BUCKET = 'medias'

const entetes = (cle) => ({
  apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json',
})

export default async () => {
  const brut = process.env.SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!brut || !cle) return Response.json({ ok: false, raison: 'variables Supabase absentes' })

  const url = brut.replace(/\/+$/, '')
  const jours = Number(process.env.MEDIA_RETENTION_DAYS) || 30
  let lignes = 0
  let erreur = null

  // 1. Effacer les references en base.
  try {
    const r = await fetch(`${url}/rest/v1/rpc/purger_medias`, {
      method: 'POST', headers: entetes(cle), body: JSON.stringify({ p_jours: jours }),
    })
    const texte = await r.text()
    if (!r.ok) throw new Error(texte || r.status)
    lignes = texte ? JSON.parse(texte) : 0
  } catch (e) { erreur = e.message }

  // 2. Effacer les fichiers eux-memes.
  const limite = Date.now() - jours * 864e5
  let supprimes = 0
  for (const dossier of ['ordonnances', 'vocaux']) {
    for (let page = 0; page < 50; page++) {
      const r = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST', headers: entetes(cle),
        body: JSON.stringify({
          prefix: dossier + '/', limit: 100, offset: page * 100,
          sortBy: { column: 'created_at', order: 'asc' },
        }),
      })
      if (!r.ok) break
      const fichiers = await r.json()
      if (!fichiers?.length) break
      const vieux = fichiers
        .filter((f) => new Date(f.created_at || f.updated_at || 0).getTime() < limite)
        .map((f) => `${dossier}/${f.name}`)
      if (vieux.length) {
        const d = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
          method: 'DELETE', headers: entetes(cle), body: JSON.stringify({ prefixes: vieux }),
        })
        if (d.ok) supprimes += vieux.length
      }
      if (fichiers.length < 100) break
    }
  }

  return Response.json({
    ok: !erreur, lignes_nettoyees: lignes, fichiers_supprimes: supprimes,
    erreur, le: new Date().toISOString(),
  })
}
