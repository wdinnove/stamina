import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // On enregistre le SW nous-mêmes (voir src/pwa.ts) pour pouvoir vérifier
      // périodiquement les mises à jour et recharger la page automatiquement,
      // au lieu du simple register() one-shot injecté par défaut.
      injectRegister: false,
      // Par défaut, `registerSW` ne fait RIEN en dev (`npm run dev`) — le SW, et donc le cache
      // des photos de joueurs (cf. `workbox.runtimeCaching` plus bas), n'existe qu'en build. Sur
      // le serveur de dev on retombait sur le cache HTTP nu du navigateur, gouverné par l'en-tête
      // `Cache-Control` renvoyé par Supabase au moment de l'upload — 1h par défaut pour toute
      // photo uploadée avant le passage à `immutable` (cf. players.ts), donc rechargement lent
      // dès que ce délai est dépassé. `enabled: true` active le même SW en dev.
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Stamina — Management App',
        short_name: 'Stamina',
        description: "Gestion d'équipe de basketball : RPE, bien-être, médical, séances et statistiques.",
        theme_color: '#0D0F14',
        background_color: '#0D0F14',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Mise à jour silencieuse : le nouveau SW prend la main dès qu'il est prêt, sans prompt.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Ne jamais faire passer les appels API (Supabase, /api/*) par le fallback SPA —
        // seul le shell de l'app (JS/CSS/images) est précaché, les données restent toujours en direct.
        navigateFallbackDenylist: [/^\/api\//],
        // Gestion des notifications push (listeners push/notificationclick) — fichier séparé pour
        // ne pas mélanger la logique métier avec le SW généré par Workbox.
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Photos de joueurs. `CacheFirst` sans réseau : l'URL stockée en base porte déjà un
            // `?v=<timestamp>` renouvelé à chaque upload (cf. playersApi.uploadPhoto), donc une
            // photo changée est une AUTRE URL — jamais de risque de servir une version périmée,
            // et on peut se passer de toute revalidation.
            //
            // Fonction plutôt que RegExp : Workbox n'applique une RegExp à une requête d'une
            // autre origine que si elle matche l'URL depuis le premier caractère, ce qui obligerait
            // à coder en dur l'URL du projet Supabase.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/storage/v1/object/public/player-photos/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'player-photos',
              expiration: {
                // Large devant un effectif de club, versions successives d'une même photo comprises.
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 90,
                purgeOnQuotaError: true,
              },
              // Une balise <img> sans attribut `crossorigin` émet une requête `no-cors` dont la
              // réponse est opaque, avec un status 0 : sans le 0, rien ne serait jamais mis en cache.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
