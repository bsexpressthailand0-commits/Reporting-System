import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'firebase/firestore': path.resolve(__dirname, 'src/lib/sqlite/firestoreCompat.ts'),
        'firebase/app': path.resolve(__dirname, 'src/lib/sqlite/firebaseAppCompat.ts'),
        'firebase/auth': path.resolve(__dirname, 'src/lib/sqlite/firebaseAuthCompat.ts'),
        'firebase/storage': path.resolve(__dirname, 'src/lib/sqlite/firebaseStorageCompat.ts'),
        'firebase/functions': path.resolve(__dirname, 'src/lib/sqlite/firebaseFunctionsCompat.ts'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            exportTools: ['jspdf', 'jspdf-autotable', 'xlsx', 'html-to-image']
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
