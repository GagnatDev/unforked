var _a;
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var apiProxyTarget = (_a = process.env.VITE_E2E_API_PROXY) !== null && _a !== void 0 ? _a : 'http://localhost:8080';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
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
