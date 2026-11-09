/* Historique local : le telephone se souvient des codes, sans compte
   ni serveur. C'est volontairement le seul "compte patient" de la v1. */
import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { historique } from '../lib/store'
import { ilYA } from '../lib/format'
import { NIVEAUX } from '../lib/config'
import { Lien } from '../lib/router'
import { Bouton, Entete, Vide } from '../components/base'

export default function MesDemandes() {
  const { t, langue } = useLangue()
  const [liste, setListe] = useState([])
  useEffect(() => { setListe(historique.tout()) }, [])

  const retirer = (code) => { historique.retirer(code); setListe(historique.tout()) }

  return (
    <div>
      <Entete titre={t('suivi.mesDemandes')} />
      {liste.length === 0 ? (
        <Vide emoji="📋" titre={t('suivi.mesDemandesVide')}
              action={<Lien vers="/aide"><Bouton>{t('accueil.aide')}</Bouton></Lien>} />
      ) : (
        <ul className="space-y-2">
          {liste.map((e) => {
            const niveau = NIVEAUX.find((n) => n.n === e.niveau)
            const cible = e.type === 'ordonnance' ? `/ordonnance/${e.code}` : `/suivi/${e.code}`
            return (
              <li key={e.code} className="carte flex items-center gap-3 p-3">
                <span className="text-2xl" aria-hidden="true">
                  {e.type === 'ordonnance' ? '💊' : (niveau?.emoji || '🆘')}
                </span>
                <Lien vers={cible} className="min-w-0 flex-1">
                  <span className="block font-black tracking-widest nombres-latins" dir="ltr">{e.code}</span>
                  <span className="aide block">
                    {e.type === 'ordonnance' ? t('ordo.titre') : t(`niveau.${e.niveau}.titre`)} · {ilYA(e.le, langue)}
                  </span>
                </Lien>
                <button onClick={() => retirer(e.code)} className="text-[12px] text-nil-900/40 underline">
                  {t('suivi.oublier')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
