import { registerSW } from 'virtual:pwa-register'

// Vérifie s'il existe une nouvelle version du SW toutes les 60s pendant que
// l'app est ouverte, et à chaque retour au premier plan (l'app installée sur
// mobile est presque toujours mise en arrière-plan plutôt que fermée, donc un
// simple check au chargement ne suffit pas).
const CHECK_INTERVAL = 60 * 1000

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return

    setInterval(() => {
      registration.update().catch(() => {})
    }, CHECK_INTERVAL)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {})
      }
    })
  },
  onNeedRefresh() {
    // registerType: 'autoUpdate' applique déjà le nouveau SW sans prompt ;
    // on force un reload pour que l'onglet ouvert charge le nouveau JS/CSS.
    updateSW(true)
  },
})
