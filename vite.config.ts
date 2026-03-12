import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // lucide-react is CJS-only; pre-bundling it causes duplicate module issues
    exclude: ['lucide-react'],
  },
  build: {
    // Target modern browsers — smaller output, better tree-shaking
    target: 'es2020',
    // Raise the inline-asset threshold so tiny SVGs/fonts stay inlined
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core — loaded first, cached longest
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Recharts + its heavy D3 sub-dependencies
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/d3-') ||
            id.includes('node_modules/victory-vendor')
          ) {
            return 'vendor-charts';
          }
          // Lucide icon tree — excluded from pre-bundle but still needs its own chunk
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          // Everything else in node_modules → shared vendor chunk
          if (id.includes('node_modules/')) {
            return 'vendor-misc';
          }
        },
      },
    },
  },
});
