/* =====================================================================
 *  POST /api/voix — transcrit a la demande le message vocal d'une
 *  demande d'aide : { demande_id }. Le compte connecte doit avoir le
 *  droit de voir cette demande (soignant de la zone, administration) :
 *  la lecture se fait avec SON jeton, donc sous les regles RLS ; seule
 *  l'ecriture du resultat utilise la cle service.
 *  Variables : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *  OPENAI_API_KEY (parole -> texte), ANTHROPIC_API_KEY (structure).
 * ===================================================================== */
import { config as configuration, reponseJson, rest } from './lib/commun.mjs'
import { traiterDemande } from './lib/voix.mjs'

export default async (req) => {
  if (req.method !== 'POST') return reponseJson({ erreur: 'POST attendu' }, 405)
  const cfg = configuration()
  if (!cfg.url || !cfg.anon || !cfg.service) return reponseJson({ erreur: 'configuration Supabase absente' }, 503)
  if (!cfg.openai) return reponseJson({ erreur: 'VOIX_NON_CONFIGUREE' }, 503)
  const jeton = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || jeton === cfg.anon) return reponseJson({ erreur: 'SESSION_REQUISE' }, 401)
  let id
  try { id = String((await req.json()).demande_id || '') } catch { return reponseJson({ erreur: 'corps invalide' }, 400) }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reponseJson({ erreur: 'identifiant invalide' }, 400)
  let visibles
  try { visibles = await rest(cfg, `/demandes?id=eq.${id}&select=id,vocal_url,transcription,analyse_vocale`, { jeton }) }
  catch { return reponseJson({ erreur: 'SESSION_REQUISE' }, 401) }
  const d = visibles?.[0]
  if (!d) return reponseJson({ erreur: 'HORS_PERIMETRE' }, 403)
  if (d.transcription) return reponseJson({ ok: true, transcription: d.transcription, analyse: d.analyse_vocale, deja: true })
  try {
    const r = await traiterDemande(cfg, d)
    if (r.ignore) return reponseJson({ ok: false, raison: r.ignore }, 422)
    return reponseJson({ ok: true, ...r })
  } catch (e) {
    return reponseJson({ erreur: String(e.message || e).slice(0, 200) }, 502)
  }
}

export const config = { path: '/api/voix', method: 'POST' }
