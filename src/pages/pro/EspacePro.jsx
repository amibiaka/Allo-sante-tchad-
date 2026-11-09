/* Espace soignant. Inscription volontairement minimale : numero de
   telephone + mot de passe. Le profil est ACTIF immediatement et
   dispose de 45 jours pour etre verifie par l'administration — un
   medecin ne doit pas attendre une validation pour porter secours. */
import { useCallback, useEffect, useState } from 'react'
import { useLangue } from '../../lib/i18n'
import { db, surSession } from '../../lib/db'
import { Chargement } from '../../components/base'
import Connexion from './Connexion'
import TableauPro from './TableauPro'

export default function EspacePro() {
  const { t } = useLangue()
  const [session, setSession] = useState(undefined)

  const charger = useCallback(() => {
    db.sessionCourante().then(setSession).catch(() => setSession(null))
  }, [])

  useEffect(() => {
    charger()
    return surSession(charger)
  }, [charger])

  if (session === undefined) return <Chargement />
  if (!session) return <Connexion surConnexion={charger} />
  return <TableauPro session={session} surChangement={charger} />
}
