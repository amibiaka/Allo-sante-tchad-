/* Suivi d'une demande par code, sans compte.
   Le rafraichissement est une interrogation legere toutes les 10 s :
   plus fiable qu'un websocket sur un reseau instable, et le patient
   anonyme n'a de toute facon pas acces au flux temps reel. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db } from '../lib/db'
import { historique } from '../lib/store'
import { naviguer, Lien } from '../lib/router'
import { ilYA, dateCourte } from '../lib/format'
import { lienSuivi, lienAppel, lienWhatsApp } from '../lib/links'
import { NIVEAUX } from '../lib/config'
import { Bouton, Entete, Champ, Alerte, Chargement, Vide, Modale } from '../components/base'
import { BandeauUrgence } from '../components/chrome'

export default function Suivi({ code }) {
  const { t } = useLangue()
  const [saisie, setSaisie] = useState('')
  if (!code) {
    return (
      <div>
        <Entete titre={t('suivi.saisirCode')} />
        <Champ etiquette={t('suivi.code')} aide={t('suivi.saisirCodeAide')}>
          <input
            className="champ text-center text-2xl font-black tracking-[.3em] uppercase nombres-latins"
            dir="ltr" maxLength={5} autoFocus inputMode="text" autoCapitalize="characters"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </Champ>
        <Bouton taille="grand" className="w-full" disabled={saisie.length < 4}
                onClick={() => naviguer('/suivi/' + saisie)}>
          {t('commun.suivant')}
        </Bouton>
        <div className="mt-4">
          <Lien vers="/mes-demandes" className="lien">{t('suivi.mesDemandes')}</Lien>
        </div>
      </div>
    )
  }
  return <DetailSuivi code={code} />
}

function DetailSuivi({ code }) {
  const { t, langue } = useLangue()
  const [d, setD] = useState(undefined)
  const [maj, setMaj] = useState(null)
  const [confirme, setConfirme] = useState(false)
  const monte = useRef(true)

  const charger = useCallback(async () => {
    try {
      const r = await db.suivreDemande(code)
      if (monte.current) { setD(r); setMaj(new Date()) }
    } catch { if (monte.current) setD(null) }
  }, [code])

  useEffect(() => {
    monte.current = true
    charger()
    const i = setInterval(charger, 10000)
    return () => { monte.current = false; clearInterval(i) }
  }, [charger])

  if (d === undefined) return <><Entete titre={t('suivi.titre')} /><Chargement /></>

  if (d === null) {
    return (
      <div>
        <Entete titre={t('suivi.titre')} />
        <Vide emoji="🔎" titre={t('suivi.introuvable')}
              action={<Lien vers="/suivi"><Bouton variante="secondaire">{t('suivi.saisirCode')}</Bouton></Lien>} />
      </div>
    )
  }

  const niveau = NIVEAUX.find((n) => n.n === d.niveau) || NIVEAUX[3]
  const engages = (d.reponses || []).filter((r) => ['en_route', 'appelle', 'whatsapp'].includes(r.action))
  const cloture = ['resolu', 'annule'].includes(d.statut)

  return (
    <div>
      <Entete
        titre={t('suivi.titre')}
        sousTitre={`${t('suivi.code')} ${d.code}`}
        action={<button onClick={charger} aria-label={t('suivi.actualiser')}
                        className="rounded-full px-3 py-2 text-sm font-bold text-nil-600 active:bg-sable-200">↻</button>}
      />

      {/* Etat principal */}
      <div className="carte overflow-hidden">
        <div className={`px-4 py-3 text-white ${niveau.couleur}`}>
          <p className="text-[13px] opacity-90">{niveau.emoji} {t(`niveau.${d.niveau}.titre`)}</p>
          <p className="text-xl font-black">{t('statut.' + d.statut)}</p>
        </div>
        <div className="p-4">
          <p className="text-[15px] font-bold">
            {d.vus ? t('suivi.vus', { n: d.vus }) : t('suivi.aucunVu')}
          </p>
          <p className="aide mt-1">
            {dateCourte(d.created_at, langue)} · {ilYA(d.created_at, langue)}
          </p>
          {(d.quartier || d.ville) && (
            <p className="mt-2 text-[14px]">📍 {[d.quartier, d.ville].filter(Boolean).join(', ')}</p>
          )}
          {d.lieu_texte && <p className="text-[14px] text-nil-900/70">{d.lieu_texte}</p>}
          {d.categories?.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {d.categories.map((c) => (
                <span key={c} className="puce bg-sable-100 text-nil-900/70">{t('cat.' + c)}</span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* Escalade */}
      {d.escalade_le && !cloture && (
        <div className="mt-3">
          <Alerte ton="danger" titre={t('suivi.escalade')}>
            <p>{t('suivi.escaladeConseil')}</p>
            <div className="mt-2"><BandeauUrgence /></div>
          </Alerte>
        </div>
      )}

      {/* Soignants engages */}
      {engages.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold text-nil-900/60">{t('pro.titre')}</h2>
          <ul className="space-y-2">
            {engages.map((r, i) => (
              <li key={i} className="carte p-3">
                <p className="font-bold">{r.pro_nom || '—'}</p>
                <p className="text-[13px] text-nil-900/60">
                  {t('action.' + r.action)} · {ilYA(r.created_at, langue)}
                </p>
                {r.message && <p className="mt-1 text-[14px]">{r.message}</p>}
                {r.pro_demo ? (
                  <p className="mt-2 text-[12px] text-soleil-700">🧪 {t('demo.contact')}</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    {r.pro_tel && (
                      <a href={lienAppel(r.pro_tel)} className="flex-1">
                        <Bouton taille="petit" className="w-full">{t('annuaire.appeler')}</Bouton>
                      </a>
                    )}
                    {r.pro_whatsapp && (
                      <a href={lienWhatsApp(r.pro_whatsapp, `[${d.code}]`)} target="_blank" rel="noopener noreferrer" className="flex-1">
                        <Bouton taille="petit" variante="succes" className="w-full">{t('annuaire.whatsapp')}</Bouton>
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Journal */}
      {d.reponses?.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold text-nil-900/60">{t('suivi.titre')}</h2>
          <ol className="space-y-1.5 border-s-2 border-sable-300 ps-3">
            {d.reponses.map((r, i) => (
              <li key={i} className="text-[13px]">
                <span className="font-semibold">{r.pro_nom || '—'}</span> {t('action.' + r.action)}
                <span className="text-nil-900/50"> · {ilYA(r.created_at, langue)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mt-6 space-y-2">
        <Bouton variante="secondaire" className="w-full"
                onClick={() => navigator.clipboard?.writeText(lienSuivi(d.code))}>
          🔗 {t('suivi.partagerLien')}
        </Bouton>
        {!cloture && (
          <Bouton variante="danger" className="w-full" onClick={() => setConfirme(true)}>
            {t('suivi.annuler')}
          </Bouton>
        )}
      </div>

      <p className="mt-4 text-center text-[12px] text-nil-900/40">
        {t('suivi.auto')} · {maj ? ilYA(maj.toISOString(), langue) : ''}
      </p>

      <Modale ouverte={confirme} onFermer={() => setConfirme(false)} titre={t('suivi.annuler')}>
        <p>{t('suivi.annulerConfirme')}</p>
        <div className="mt-4 flex gap-2">
          <Bouton variante="secondaire" className="flex-1" onClick={() => setConfirme(false)}>{t('commun.non')}</Bouton>
          <Bouton variante="danger" className="flex-1"
                  onClick={async () => { await db.annulerDemande(d.code); setConfirme(false); charger() }}>
            {t('commun.oui')}
          </Bouton>
        </div>
      </Modale>
    </div>
  )
}
