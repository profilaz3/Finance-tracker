import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// Match a module id against a package directory, normalising Windows separators.
// Package-path matching (instead of a bare substring like 'react') keeps unrelated
// packages out of the vendor chunks.
const isPackagePath = (id: string, packageName: string) => {
  const normalizedId = id.replace(/\\/g, '/');
  const prefix = packageName.endsWith('/') ? packageName : `${packageName}/`;
  return normalizedId.includes(`/node_modules/${prefix}`);
};

export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      // Only run the bundle visualizer for `npm run analyze`; it roughly doubles build time.
      mode === 'analyze' &&
        visualizer({
          open: true,
          gzipSize: true,
          brotliSize: true,
          filename: 'dist/stats.html',
          template: 'treemap',
          projectRoot: import.meta.dirname,
        }),
    ],
    build: {
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
      rolldownOptions: {
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          codeSplitting: {
            groups: [
              { name: 'markdown', test: (id) => isPackagePath(id, 'react-markdown') },
              {
                name: 'motion',
                test: (id) =>
                  isPackagePath(id, 'motion') ||
                  isPackagePath(id, 'framer-motion') ||
                  isPackagePath(id, 'motion-dom') ||
                  isPackagePath(id, 'motion-utils'),
              },
              { name: 'icons', test: (id) => isPackagePath(id, 'lucide-react') },
              { name: 'supabase', test: (id) => isPackagePath(id, '@supabase/') },
            ],
          },
        },
      },
      target: 'es2020',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 500,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      }
    },
  }
});
