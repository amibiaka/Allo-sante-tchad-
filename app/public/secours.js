/* =====================================================================
 * Allo Sante Tchad - filet de secours
 * Si l'application ne demarre pas, cette page se repare toute seule :
 * elle vide les caches, retire le service worker et recharge une fois.
 * Cas vise : un ancien index.html dort dans le cache et reclame des
 * fichiers /assets/ qui n'existent plus depuis la derniere mise en
 * ligne. Sans ce filet, l'ecran reste sur "Chargement..." pour
 * toujours, et l'utilisateur n'a aucun moyen de s'en sortir.
 * Ce fichier ne depend de rien et ne sort jamais du domaine.
 * ===================================================================== */
(function () {
  'use strict'
  var CLE = 'ast-secours'
  var VEILLE = 25000
  var enCours = false
  var minuteur = null

  function demarree() {
    return !document.getElementById('demarrage')
  }

  function deja() {
    try { return sessionStorage.getItem(CLE) === '1' } catch (e) { return false }
  }

  function marquer(v) {
    try { v ? sessionStorage.setItem(CLE, '1') : sessionStorage.removeItem(CLE) } catch (e) {}
  }

  function message() {
    var socle = document.getElementById('demarrage')
    if (!socle) return
    socle.innerHTML =
      '<div class="logo">+</div>' +
      '<p>Allo Santé Tchad</p>' +
      '<small>L’application n’a pas pu s’ouvrir. Vérifiez votre connexion, ' +
      'puis appuyez sur Réessayer.<br><span dir="rtl">تعذّر فتح التطبيق. تحقّق من اتّصالك ثمّ أعد المحاولة.</span></small>' +
      '<button id="ast-reessayer" style="margin-top:.5rem;padding:.7rem 1.4rem;border:0;border-radius:12px;' +
      'background:#0B4C8C;color:#fff;font-size:15px;font-weight:600;cursor:pointer">Réessayer</button>'
    var b = document.getElementById('ast-reessayer')
    if (b) b.addEventListener('click', function () { marquer(false); nettoyer(true) })
  }

  function nettoyer(force) {
    if (enCours) return
    enCours = true
    if (!force && deja()) { message(); return }
    marquer(true)
    var taches = []
    try {
      if (window.caches && caches.keys) {
        taches.push(caches.keys().then(function (noms) {
          return Promise.all(noms.map(function (n) { return caches.delete(n) }))
        }))
      }
    } catch (e) {}
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        taches.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister() }))
        }))
      }
    } catch (e) {}
    var fin = function () {
      /* Le parametre casse le cache HTTP du navigateur, pas seulement
         celui du service worker. */
      location.replace(location.pathname + '?r=' + Date.now() + location.hash)
    }
    if (!taches.length) return fin()
    Promise.all(taches).then(fin, fin)
  }

  /* Un fichier <script> ou <link> qui n'arrive pas : signe le plus sur
     d'un index.html perime. On repare tout de suite. */
  window.addEventListener('error', function (e) {
    var c = e && e.target && e.target.tagName
    if (c === 'SCRIPT' || c === 'LINK') nettoyer(false)
  }, true)

  /* Un morceau de l'application charge a la demande qui n'arrive pas. */
  window.addEventListener('unhandledrejection', function (e) {
    var m = e && e.reason && (e.reason.message || String(e.reason))
    if (m && /dynamically imported module|module script failed|Failed to fetch/i.test(m)) nettoyer(false)
  })

  /* Filet de derniere ligne : rien ne s'est affiche au bout de 25 s.
     Assez long pour ne pas couper une connexion 2G qui avance. */
  minuteur = setInterval(function () {
    if (demarree()) { clearInterval(minuteur); marquer(false); return }
    if (document.readyState === 'complete' && performance.now() > VEILLE) {
      clearInterval(minuteur)
      nettoyer(false)
    }
  }, 1000)
})()
