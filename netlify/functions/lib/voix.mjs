/* Transcription et lecture structuree d'un message vocal de demande
   d'aide. Deux etapes, deux services payes a l'usage :
     1. parole -> texte : OpenAI Whisper (francais, arabe, detection
        automatique de la langue) — Claude ne prend pas d'audio ;
     2. texte -> structure : Claude (langue, resume, motifs, niveau
        suggere, mots-cles), pour le soignant et pour les statistiques.
   Sans OPENAI_API_KEY, rien n'est transcrit ; sans ANTHROPIC_API_KEY,
   la transcription est enregistree telle quelle. */
import { claude, jsonDans, rest } from './commun.mjs'

const BUCKET = 'medias'
const CATEGORIES = ['accident_route', 'accident_domestique', 'malaise', 'douleur', 'fievre', 'grossesse', 'enfant', 'morsure', 'brulure', 'intoxication', 'autre']

async function telecharger(cfg, chemin) {
  const r = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${chemin}`, { headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}` } })
  if (!r.ok) throw new Error(`stockage ${r.status}`)
  return { blob: await r.blob(), type: r.headers.get('content-type') || 'audio/webm' }
}

async function whisper(cfg, blob, type, nom) {
  const fd = new FormData()
  fd.append('file', new Blob([await blob.arrayBuffer()], { type }), nom)
  fd.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1')
  fd.append('response_format', 'verbose_json')
  fd.append('prompt', 'Message vocal d\'un habitant du Tchad demandant une aide médicale, en français ou en arabe tchadien.')
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${cfg.openai}` }, body: fd })
  if (!r.ok) throw new Error(`whisper ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const d = await r.json()
  return { texte: String(d.text || '').trim(), langue: d.language || null, duree: d.duration ? Math.round(d.duration) : null }
}

async function structurer(cfg, texte, langueDetectee) {
  const systeme = `Tu lis la transcription d'un message vocal envoyé par un habitant du Tchad à une plateforme d'aide médicale d'urgence. Réponds UNIQUEMENT par un objet JSON : {"langue": code ISO ("fr", "ar", "en" ou autre), "resume": résumé clinique en français en une phrase (sans nom de personne, sans numéro de téléphone), "categories": liste parmi ${JSON.stringify(CATEGORIES)}, "niveau_suggere": 1 (danger vital immédiat), 2 (urgent, sous 12 h), 3 (dans la journée) ou 4 (rendez-vous), "mots_cles": 3 à 6 mots-clés en français, "lieu": indication de lieu si elle est dite, sinon null}. N'invente rien : si le message est inaudible ou vide, mets "resume": "Message inaudible" et "categories": [].`
  const rep = await claude(cfg, { systeme, message: `Langue détectée : ${langueDetectee || 'inconnue'}\nTranscription :\n${texte.slice(0, 4000)}`, maxTokens: 500 })
  const j = jsonDans(rep)
  if (!j) return null
  return {
    langue: typeof j.langue === 'string' ? j.langue.slice(0, 5) : langueDetectee,
    resume: String(j.resume || '').slice(0, 300),
    categories: [].concat(j.categories || []).filter((c) => CATEGORIES.includes(c)).slice(0, 4),
    niveau_suggere: [1, 2, 3, 4].includes(Number(j.niveau_suggere)) ? Number(j.niveau_suggere) : null,
    mots_cles: [].concat(j.mots_cles || []).map((m) => String(m).slice(0, 40)).slice(0, 6),
    lieu: j.lieu ? String(j.lieu).slice(0, 120) : null,
  }
}

/* Traite une demande : telecharge, transcrit, structure, enregistre.
   Renvoie l'analyse, ou { ignore: raison }. */
export async function traiterDemande(cfg, demande) {
  if (!cfg.openai) return { ignore: 'OPENAI_API_KEY absente' }
  if (!demande?.vocal_url) return { ignore: 'pas de vocal' }
  if (demande.transcription) return { ignore: 'deja transcrite' }
  const { blob, type } = await telecharger(cfg, demande.vocal_url)
  if (blob.size < 800) return { ignore: 'fichier vide' }
  if (blob.size > 24 * 1024 * 1024) return { ignore: 'fichier trop lourd' }
  const w = await whisper(cfg, blob, type, demande.vocal_url.split('/').pop())
  let analyse = { langue: w.langue, modele: cfg.openai ? (process.env.OPENAI_STT_MODEL || 'whisper-1') : null, duree_s: w.duree }
  if (w.texte && cfg.anthropic) {
    try { const s = await structurer(cfg, w.texte, w.langue); if (s) analyse = { ...analyse, ...s, modele_analyse: 'claude' } }
    catch (e) { analyse.erreur_analyse = String(e.message || e).slice(0, 120) }
  }
  await rest(cfg, `/demandes?id=eq.${encodeURIComponent(demande.id)}`, {
    methode: 'PATCH', entetes: { Prefer: 'return=minimal' },
    corps: { transcription: w.texte || '(inaudible)', analyse_vocale: analyse, transcrit_le: new Date().toISOString() },
  })
  return { transcription: w.texte, analyse }
}
