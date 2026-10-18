import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backendUrl = env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:5050';
  return {
    plugins: [react()],
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
      legalComments: 'none',
    },
  server: {
    port: 5173,
    // في التطوير: تمرير نداءات /api و /hubs إلى الخادم الخلفي لتفادي CORS
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/hubs': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/captain-login': { target: backendUrl, changeOrigin: true },
      '/driver-login': { target: backendUrl, changeOrigin: true },
      '/dashboard': { target: backendUrl, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    modulePreload: {
      resolveDependencies: (filename, deps) => {
        return deps.filter((dep) => !dep.includes('mapbox') && !dep.includes('realtime'));
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          mapbox: ['mapbox-gl', 'react-map-gl'],
          realtime: ['@microsoft/signalr', 'socket.io-client'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios'],
        },
      },
    },
  },
  };
});
