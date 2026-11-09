/* =====================================================================
 *  Tache planifiee — toutes les 10 minutes (voir netlify.toml)
 *  Transcrit les messages vocaux des demandes recentes qui ne le sont
 *  pas encore (dix au plus par passage), pour que le soignant lise le
 *  message et que les motifs alimentent les statistiques.
 *  Sans OPENAI_API_KEY, la tache ne fait rien et le dit.
 * ===================================================================== */
import { config as configuration, rest } from './lib/commun.mjs'
import { traiterDemande } from './lib/voix.mjs'

export default async () => {
  const cfg = configuration()
  if (!cfg.url || !cfg.service) return Response.json({ ok: false, raison: 'variables Supabase absentes' })
  if (!cfg.openai) return Response.json({ ok: false, raison: 'OPENAI_API_KEY absente' })
  const depuis = new Date(Date.now() - 2 * 864e5).toISOString()
  let demandes = []
  try {
    demandes = await rest(cfg, `/demandes?select=id,vocal_url,transcription&vocal_url=not.is.null&transcription=is.null&created_at=gt.${depuis}&order=created_at.desc&limit=10`) || []
  } catch (e) { return Response.json({ ok: false, erreur: e.message }) }
  const resultats = []
  for (const d of demandes) {
    try { const r = await traiterDemande(cfg, d); resultats.push({ id: d.id, ok: !r.ignore, raison: r.ignore, langue: r.analyse?.langue }) }
    catch (e) { resultats.push({ id: d.id, ok: false, erreur: String(e.message || e).slice(0, 120) }) }
  }
  return Response.json({ ok: true, traitees: resultats.filter((r) => r.ok).length, detail: resultats, le: new Date().toISOString() })
}
