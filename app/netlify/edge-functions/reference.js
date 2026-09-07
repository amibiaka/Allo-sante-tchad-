/* Donnees de reference servies par Netlify, plus par Supabase.

   Provinces, villes et quartiers ne changent presque jamais, mais
   l application les demandait a Supabase a chaque ouverture : 51 Ko de
   quartiers par visite, et surtout une adresse publique qu un robot peut
   marteler pour faire monter la facture. Ici la reponse est fabriquee une
   fois puis servie depuis le cache du CDN, qui absorbe les pics et ne
   coute rien. Si la fonction tombe, le client repart sur Supabase : voir
   refEdge() dans src/lib/backendSupabase.js. */

const lireEnv = (n) => { try { return Deno.env.get(n) } catch { return undefined } }
const BASE = lireEnv('SUPABASE_URL') || lireEnv('VITE_SUPABASE_URL')
const CLE = lireEnv('SUPABASE_ANON_KEY') || lireEnv('VITE_SUPABASE_ANON_KEY')

const CHEMINS = {
  provinces: '/provinces?select=id,code,nom_fr,nom_ar&order=ordre',
  villes: '/villes?select=id,province_id,code,nom_fr,nom_ar,lat,lng,chef_lieu&order=nom_fr',
  quartiers: '/quartiers?select=id,ville_id,nom_fr,nom_ar,groupe,qualite&approuve=eq.true&order=nom_fr',
}

export default async function reference() {
  if (!BASE || !CLE) {
    return new Response(JSON.stringify({ erreur: 'configuration absente' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const entetes = { apikey: CLE, Authorization: 'Bearer ' + CLE }
  const lire = async (chemin) => {
    const r = await fetch(BASE + '/rest/v1' + chemin, { headers: entetes })
    if (!r.ok) throw new Error(chemin.split('?')[0] + ' ' + r.status)
    return r.json()
  }

  try {
    const [provinces, villes, quartiers] = await Promise.all([
      lire(CHEMINS.provinces),
      lire(CHEMINS.villes),
      lire(CHEMINS.quartiers),
    ])
    return new Response(JSON.stringify({ provinces, villes, quartiers }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=600',
        'netlify-cdn-cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (e) {
    /* On ne cache jamais une erreur : le client retombe sur Supabase. */
    return new Response(JSON.stringify({ erreur: String(e && e.message ? e.message : e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}

export const config = { path: '/api/reference', cache: 'manual' }
