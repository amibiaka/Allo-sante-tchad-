/* Partage des fonctions Netlify : configuration, verification du jeton
   de session, appels a Supabase et a Claude. Aucune dependance. */

export function config() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  return {
    url,
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    modele: process.env.ANTHROPIC_MODEL || '',
    openai: process.env.OPENAI_API_KEY || '',
  }
}

export const reponseJson = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

/* Le jeton de session arrive dans l'en-tete Authorization. On le passe
   a PostgREST tel quel : si la base le reconnait, est_lecteur() repond ;
   sinon 401. Rien n'est decode ici : la base fait foi. */
export async function lecteurDepuisRequete(req, cfg) {
  const jeton = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || jeton === cfg.anon) return null
  const r = await fetch(`${cfg.url}/rest/v1/rpc/est_lecteur`, {
    method: 'POST',
    headers: { apikey: cfg.anon, Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) return null
  const ok = await r.json().catch(() => false)
  return ok === true ? { jeton } : null
}

/* Requete PostgREST avec un jeton donne (celui de l'utilisateur ou la
   cle service). */
export async function rest(cfg, chemin, { jeton, methode = 'GET', corps, entetes = {} } = {}) {
  const cle = jeton || cfg.service
  const r = await fetch(`${cfg.url}/rest/v1${chemin}`, {
    method: methode,
    headers: { apikey: jeton ? cfg.anon : cfg.service, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', ...entetes },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const texte = await r.text()
  if (!r.ok) throw new Error(`${chemin}: ${texte || r.status}`)
  return texte ? JSON.parse(texte) : null
}

/* Un appel a Claude (API Messages). Essaie le modele demande, puis des
   modeles de repli si le premier est inconnu. Renvoie le texte ou null
   si aucune cle n'est configuree ; leve en cas d'erreur reseau. */
const MODELES = ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-3-5-haiku-latest']
export async function claude(cfg, { systeme, message, maxTokens = 1800 }) {
  if (!cfg.anthropic) return null
  const candidats = [cfg.modele, ...MODELES].filter(Boolean)
  let derniere = null
  for (const modele of candidats) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': cfg.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modele, max_tokens: maxTokens, system: systeme, messages: [{ role: 'user', content: message }] }),
    })
    if (r.ok) {
      const d = await r.json()
      return (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    }
    const texte = await r.text().catch(() => '')
    derniere = new Error(`claude ${modele}: ${r.status} ${texte.slice(0, 200)}`)
    if (r.status !== 404 && !/not_found|model/i.test(texte)) break
  }
  throw derniere || new Error('claude: aucun modele')
}

/* Extrait le premier objet JSON d'une reponse texte. */
export function jsonDans(texte) {
  if (!texte) return null
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}
