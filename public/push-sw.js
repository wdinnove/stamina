/**
 * Gestion des notifications Web Push — chargé via `importScripts` dans le service worker généré
 * par Workbox (voir vite.config.ts), pour ne pas toucher à la stratégie de cache/précache existante.
 * Tourne dans le même contexte global (`self`) que le SW principal.
 */

self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Stamina', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Stamina'
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    image: data.image || undefined,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of allClients) {
      if (client.url.includes(targetUrl) && 'focus' in client) {
        return client.focus()
      }
    }
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) return client.navigate(targetUrl)
        return
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
  })())
})
