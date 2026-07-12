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
            includeAssets: [
                'favicon.ico',
                'pwa-icon.svg',
                'apple-touch-icon-180x180.png',
            ],
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
                        src: 'pwa-64x64.png',
                        sizes: '64x64',
                        type: 'image/png',
                    },
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: 'maskable-icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/recipes(\/[^/]+)?(\?.*)?$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'api-recipes',
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 60 * 60 * 24 * 7,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
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
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/meal-plans/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'api-meal-plans',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 7,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        urlPattern: /^https?:\/\/[^/]+\/api\/shopping-lists/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'api-shopping-lists',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 7,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
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
