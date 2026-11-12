import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      visualizer({
        open: mode === 'analyze',
        gzipSize: true,
        brotliSize: true,
        filename: 'dist/stats.html',
        template: 'treemap',
        projectRoot: path.resolve(__dirname)
      }),
    ],
    build: {
      minify: 'terser',
      sourcemap: mode === 'development',
      modulePreload: {
        resolveDependencies: (_filename, deps, context) => {
          if (context.hostType !== 'html') {
            return deps;
          }

          return deps.filter(dep =>
            !dep.includes('markdown-') &&
            !dep.includes('pdf-tools-') &&
            !dep.includes('motion-') &&
            !dep.includes('icons-')
          );
        },
      },
      rollupOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');
            const isPackagePath = (packageName: string) =>
              normalizedId.includes(`/node_modules/${packageName}/`);

            if (
              normalizedId.includes('commonjsHelpers') ||
              normalizedId.includes('vite/preload-helper')
            ) {
              return 'vendor-helpers';
            }

            if (!normalizedId.includes('/node_modules/')) {
              return undefined;
            }

            if (isPackagePath('jspdf') || isPackagePath('jspdf-autotable')) {
              return 'pdf-tools';
            }

            if (isPackagePath('react-markdown')) {
              return 'markdown';
            }

            if (isPackagePath('framer-motion')) {
              return 'motion';
            }

            if (isPackagePath('lucide-react')) {
              return 'icons';
            }

            if (isPackagePath('@supabase/supabase-js')) {
              return 'supabase';
            }

            return undefined;
          }
        },
        treeshake: true
      },
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 500,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
  }
});
