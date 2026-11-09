/* Enregistrement vocal et photo d'ordonnance.
   Le vocal est le mode de saisie principal pour les personnes qui ne
   lisent pas : il doit etre aussi visible que le champ texte. */
import { useEffect, useRef, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { EnregistreurVocal, DUREE_MAX, vocalDisponible, compresserImage, poidsLisible } from '../lib/media'
import { Bouton, Alerte } from './base'
import { Icone } from './pro'

export function SaisieVocale({ valeur, onChange }) {
  const { t } = useLangue()
  const [etat, setEtat] = useState('repos')      // repos | enregistre | pret | erreur
  const [secondes, setSecondes] = useState(0)
  const [url, setUrl] = useState(null)
  const rec = useRef(null)

  useEffect(() => () => { rec.current?.annuler?.(); if (url) URL.revokeObjectURL(url) }, [url])

  if (!vocalDisponible()) {
    return <p className="aide">{t('vocal.indisponible')}</p>
  }

  const demarrer = async () => {
    setEtat('enregistre'); setSecondes(0)
    rec.current = new EnregistreurVocal({
      surDuree: setSecondes,
      surFin: ({ blob, duree }) => {
        const u = URL.createObjectURL(blob)
        setUrl(u); setEtat('pret'); onChange({ blob, duree })
      },
      surErreur: () => setEtat('erreur'),
    })
    try { await rec.current.demarrer() } catch { setEtat('erreur') }
  }

  const effacer = () => {
    if (url) URL.revokeObjectURL(url)
    setUrl(null); setEtat('repos'); setSecondes(0); onChange(null)
  }

  if (etat === 'erreur') {
    return (
      <Alerte ton="attention" action={<Bouton taille="petit" onClick={demarrer}>{t('commun.reessayer')}</Bouton>}>
        {t('vocal.permission')}
      </Alerte>
    )
  }

  if (etat === 'pret' && valeur) {
    return (
      <div className="rounded-xl border-2 border-nil-200 bg-nil-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-nil-700">
          🎙️ {t('vocal.duree', { s: valeur.duree })}
        </div>
        <audio controls src={url} className="w-full" preload="none" />
        <div className="mt-2 flex gap-2">
          <Bouton taille="petit" variante="secondaire" onClick={demarrer}>{t('vocal.refaire')}</Bouton>
          <Bouton taille="petit" variante="danger" onClick={effacer}>{t('vocal.supprimer')}</Bouton>
        </div>
      </div>
    )
  }

  if (etat === 'enregistre') {
    const pct = Math.min(100, (secondes / DUREE_MAX) * 100)
    return (
      <div className="rounded-xl border-2 border-urgence-100 bg-urgence-50 p-3">
        <div className="mb-2 flex items-center gap-2 font-bold text-urgence-600">
          <span className="h-3 w-3 animate-pulse rounded-full bg-urgence-500" aria-hidden="true" />
          {t('vocal.enregistrement', { s: secondes })}
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-urgence-100">
          <div className="h-full bg-urgence-500 transition-all" style={{ width: pct + '%' }} />
        </div>
        <Bouton variante="urgence" className="w-full" onClick={() => rec.current?.arreter()}>
          ⏹ {t('vocal.arreter')}
        </Bouton>
      </div>
    )
  }

  return (
    <Bouton variante="secondaire" className="w-full" onClick={demarrer} icone={<Icone nom="micro" />}>
      {t('vocal.enregistrer')} <span className="font-normal opacity-60">· {t('vocal.max')}</span>
    </Bouton>
  )
}

/* ------------------------------------------------------------------ */
export function PhotoOrdonnance({ valeur, onChange }) {
  const { t } = useLangue()
  const [etat, setEtat] = useState('repos')
  const [apercu, setApercu] = useState(null)
  const entree = useRef(null)

  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu) }, [apercu])

  const choisir = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setEtat('compression')
    try {
      const r = await compresserImage(f)
      if (apercu) URL.revokeObjectURL(apercu)
      setApercu(URL.createObjectURL(r.blob))
      onChange({ blob: r.blob, taille: r.taille })
      setEtat('pret')
    } catch {
      setEtat('erreur')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div>
      <input ref={entree} type="file" accept="image/*" capture="environment"
             onChange={choisir} className="hidden" />
      {valeur && apercu ? (
        <div className="rounded-xl border-2 border-nil-200 bg-white p-2">
          <img src={apercu} alt="" className="mx-auto max-h-56 rounded-lg object-contain" />
          <p className="aide mt-2 text-center">{t('ordo.compression', { ko: poidsLisible(valeur.taille) })}</p>
          <Bouton taille="petit" variante="secondaire" className="mt-2 w-full"
                  onClick={() => entree.current?.click()}>{t('ordo.reprendre')}</Bouton>
        </div>
      ) : (
        <Bouton variante="secondaire" className="w-full" taille="grand"
                enCours={etat === 'compression'}
                onClick={() => entree.current?.click()} icone={<Icone nom="appareil" className="h-6 w-6" />}>
          {t('ordo.photo')}
        </Bouton>
      )}
      {etat === 'erreur' && <p className="mt-2 text-[13px] text-urgence-600">{t('commun.erreur')}</p>}
    </div>
  )
}
