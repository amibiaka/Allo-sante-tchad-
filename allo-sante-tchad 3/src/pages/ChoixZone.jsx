import { useState } from 'react'
import { useLangue } from '../lib/i18n'
import { prefs } from '../lib/store'
import { naviguer } from '../lib/router'
import { Bouton, Entete } from '../components/base'
import { SelecteurZone } from '../components/zone'

export default function ChoixZone({ requete }) {
  const { t } = useLangue()
  const [zone, setZone] = useState(prefs.zone() || { provinceCode: '', villeCode: '' })
  const retour = requete?.get('retour') || '/'

  return (
    <div>
      <Entete titre={t('zone.titre')} />
      <SelecteurZone valeur={zone} onChange={setZone} />
      <div className="barre-bas">
        <Bouton taille="grand" className="w-full" disabled={!zone.villeCode}
                onClick={() => { prefs.definirZone(zone); naviguer(retour) }}>
          {t('zone.confirmer')}
        </Bouton>
      </div>
    </div>
  )
}
