/* Allo Sante Tchad, invitation d installation.

   Chrome declenche beforeinstallprompt des que le manifeste et le service
   worker sont juges valides. Sur un telephone lent cela arrive parfois
   avant que l application ne soit chargee : si personne n ecoute a cet
   instant, l invitation est perdue et le bouton Installer n apparait
   jamais. On l attrape donc ici, au plus tot, puis on la rejoue pour
   l application. Fichier separe et non differe : la politique de securite
   interdit les scripts en ligne. */
(function () {
  'use strict'

  window.__astBip = null
  document.documentElement.setAttribute('data-ast-invite', 'prete')

  addEventListener('beforeinstallprompt', function (e) {
    if (e.__rejoue) return
    e.preventDefault()
    e.__rejoue = true
    window.__astBip = e
    document.documentElement.setAttribute('data-ast-invite', 'captee')
    ;[1200, 4000, 9000].forEach(function (delai) {
      setTimeout(function () {
        try { dispatchEvent(e) } catch (err) { /* deja consommee */ }
      }, delai)
    })
  })

  addEventListener('appinstalled', function () {
    window.__astBip = null
    document.documentElement.setAttribute('data-ast-invite', 'installee')
    try {
      localStorage.setItem('ast.install', JSON.stringify({ faite: true }))
    } catch (err) { /* stockage refuse */ }
  })
})()
