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

const isMotionPackage = (id: string) =>
  isPackagePath(id, 'motion') ||
  isPackagePath(id, 'framer-motion') ||
  isPackagePath(id, 'motion-dom') ||
  isPackagePath(id, 'motion-utils');

// Modules only the domMax feature set needs (drag, pan, layout projection nodes).
// The small projection geometry/measure helpers are shared with the core renderer.
const MOTION_MAX_ONLY_PATTERN =
  /\/(projection\/(node|animation|shared)|gestures\/drag|gestures\/pan|motion\/features\/(drag|layout)|render\/dom\/features-max|layout\/)/;
const isMotionMaxOnlyModule = (id: string) => MOTION_MAX_ONLY_PATTERN.test(id.replace(/\\/g, '/'));

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
              // React must have its own group. Without it Rolldown hoisted react into the
              // markdown group (the first group to claim it), which put the whole
              // markdown stack on the startup path.
              {
                name: 'react',
                priority: 30,
                test: (id) =>
                  isPackagePath(id, 'react') ||
                  isPackagePath(id, 'react-dom') ||
                  isPackagePath(id, 'scheduler'),
              },
              { name: 'markdown', priority: 10, test: (id) => isPackagePath(id, 'react-markdown') },
              // Views use LazyMotion + `m` with domAnimation. Drag/layout (domMax) is
              // only needed by the Settings account Reorder list, which loads
              // utils/motionMaxFeatures lazily; keep those modules out of this group
              // so they stay in that on-demand chunk.
              {
                name: 'motion',
                priority: 10,
                test: (id) => isMotionPackage(id) && !isMotionMaxOnlyModule(id),
              },
              // The virtualised list library is only used by the transactions route; a
              // separate vendor chunk keeps it cached across app deploys.
              { name: 'virtuoso', priority: 10, test: (id) => isPackagePath(id, 'react-virtuoso') },
              { name: 'icons', priority: 10, test: (id) => isPackagePath(id, 'lucide-react') },
              { name: 'supabase', priority: 10, test: (id) => isPackagePath(id, '@supabase/') },
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
