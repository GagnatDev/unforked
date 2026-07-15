var _a;
/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
var apiProxyTarget = (_a = process.env.VITE_E2E_API_PROXY) !== null && _a !== void 0 ? _a : 'http://localhost:8080';
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'prompt',
            injectRegister: 'auto',
            // All PWA discovery assets live under /static/, which the auth-proxy
            // sidecar serves without a session cookie — the OS fetches the manifest
            // and icons anonymously when installing to the Home Screen.
            includeAssets: [
                'static/favicon.ico',
                'static/pwa-icon.svg',
                'static/apple-touch-icon-180x180.png',
            ],
            manifestFilename: 'static/manifest.webmanifest',
            manifest: {
                name: 'Meal Planning',
                short_name: 'Meals',
                description: 'Plan your weekly meals, manage recipes and shopping lists',
                theme_color: '#18181b',
                background_color: '#ffffff',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                orientation: 'portrait-primary',
                lang: 'en',
                icons: [
                    {
                        src: '/static/pwa-64x64.png',
                        sizes: '64x64',
                        type: 'image/png',
                    },
                    {
                        src: '/static/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/static/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: '/static/maskable-icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
                runtimeCaching: [
                    // Recipe-tag autocomplete is not backed by the local store, so a
                    // stale-while-revalidate cache is a safe, useful offline nicety. This
                    // must be registered before the /api/recipes rule below, whose pattern
                    // also matches /api/recipes/tags (first matching route wins).
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/recipes\/tags/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'api-recipe-tags',
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Domain data (recipes, meal plans, shopping lists) is read from the
                    // IndexedDB local store — the offline-first source of truth — and the
                    // network is only ever pulled in the background to refresh that store
                    // (see src/local/sync.ts). A stale-while-revalidate SW cache in front
                    // of these GETs served a one-generation-stale response that the pull
                    // then persisted as truth: after saving a meal-plan change, the first
                    // revisit re-rendered the *previous* recipe (the pull got the cached
                    // pre-save body while revalidation refreshed the cache in the
                    // background), and only the next revisit showed the change. Go straight
                    // to the network so the local store is never fed a stale body; genuine
                    // offline reads are already served from IndexedDB.
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/recipes(\/[^/]+)?(\?.*)?$/,
                        handler: 'NetworkOnly',
                    },
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/meal-plans/,
                        handler: 'NetworkOnly',
                    },
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/shopping-lists/,
                        handler: 'NetworkOnly',
                    },
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/(auth|users|family)/,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-auth-sensitive',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 5,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
                navigateFallback: 'index.html',
                // /auth/* belongs to the auth-proxy sidecar (OAuth callback, logout).
                // If the SW answers those navigations with the cached index.html, the
                // authorization code never reaches the sidecar and login breaks with
                // OAuth state errors.
                navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
            },
        }),
    ],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
    },
});
