import { useEffect, useState } from 'react'
import { useLangue } from '../lib/i18n'
import { db, MODE_DEMO } from '../lib/db'
import { CONFIG } from '../lib/config'
import { definirModeLeger, modeLeger } from '../lib/net'
import { lienWhatsApp } from '../lib/links'
import { Entete, Alerte, Bascule } from '../components/base'
import { SelecteurLangue } from '../components/chrome'

export default function APropos() {
  const { t } = useLangue()
  const [reglages, setReglages] = useState({ retention: 30, probation: 45 })
  const [leger, setLeger] = useState(modeLeger())

  useEffect(() => {
    db.adminReglages?.().then((r) => {
      if (!r) return
      setReglages({
        retention: r.retention_medias?.jours ?? 30,
        probation: r.probation_jours?.jours ?? 45,
      })
    }).catch(() => {})
  }, [])

  const Section = ({ titre, children }) => (
    <section className="carte mb-3 p-4">
      <h2 className="mb-1.5 font-bold">{titre}</h2>
      <div className="text-[14px] leading-relaxed text-nil-900/80">{children}</div>
    </section>
  )

  return (
    <div>
      <Entete titre={t('legal.titre')} action={<SelecteurLangue compact />} />

      <div className="mb-3">
        <Alerte ton="danger">{t('legal.avertissement')}</Alerte>
      </div>

      <Section titre={t('legal.quoi')}>{t('legal.quoiTexte')}</Section>
      <Section titre={t('legal.donnees')}>{t('legal.donneesTexte', { jours: reglages.retention })}</Section>
      <Section titre={t('legal.verification')}>{t('legal.verificationTexte', { probation: reglages.probation })}</Section>
      <Section titre={t('legal.numeros')}>{t('legal.numerosTexte')}</Section>

      <div className="mb-3">
        <Bascule actif={leger} onChange={(v) => { definirModeLeger(v); setLeger(v) }}
                 etiquette={t('commun.modeLeger')} aide={t('commun.modeLegerActif')} couleur="bg-nil-600" />
      </div>

      {CONFIG.whatsappPlateforme && (
        <Section titre={t('legal.contact')}>
          <a className="lien" href={lienWhatsApp(CONFIG.whatsappPlateforme, 'AIDE')} target="_blank" rel="noopener noreferrer">
            💬 {t('lien.aideWhatsapp')}
          </a>
        </Section>
      )}

      {MODE_DEMO && (
        <Alerte ton="attention" titre={t('demo.banniere')}>{t('demo.detail')}</Alerte>
      )}

      <p className="mt-6 text-center text-[12px] text-nil-900/40">
        {CONFIG.nomApp} · {t('app.gratuit')}
      </p>
    </div>
  )
}
