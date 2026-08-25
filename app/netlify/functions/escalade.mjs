/* =====================================================================
 *  Tache planifiee — toutes les 5 minutes (voir netlify.toml)
 *  1. Escalade les urgences vitales restees sans reponse.
 *  2. Fait expirer les periodes de verification de 45 jours echues.
 *
 *  Aucune dependance : Node 20 fournit fetch nativement.
 *
 *  Variables d'environnement Netlify necessaires :
 *    SUPABASE_URL               (meme valeur que VITE_SUPABASE_URL)
 *    SUPABASE_SERVICE_ROLE_KEY  (Supabase > Settings > API > service_role)
 *  Sans elles, la fonction ne fait rien et le dit : le site continue de
 *  fonctionner normalement.
 * ===================================================================== */

async function appelRpc(url, cle, fonction, args) {
  const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  })
  const texte = await r.text()
  if (!r.ok) throw new Error(`${fonction}: ${texte || r.status}`)
  return texte ? JSON.parse(texte) : null
}

export default async () => {
  const url = process.env.SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) {
    return Response.json({ ok: false, raison: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absente' })
  }

  const delai = Number(process.env.ESCALATION_DELAY_MINUTES) || null
  const erreurs = []
  let escalades = 0
  let expirees = 0

  try { escalades = await appelRpc(url, cle, 'escalader_urgences', delai ? { p_delai_minutes: delai } : {}) }
  catch (e) { erreurs.push(e.message) }

  try { expirees = await appelRpc(url, cle, 'expirer_probations', {}) }
  catch (e) { erreurs.push(e.message) }

  return Response.json({
    ok: erreurs.length === 0,
    urgences_escaladees: escalades ?? 0,
    verifications_expirees: expirees ?? 0,
    erreurs,
    le: new Date().toISOString(),
  })
}
