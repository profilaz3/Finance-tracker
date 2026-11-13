import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig((env) =>
  mergeConfig(typeof viteConfig === 'function' ? viteConfig(env) : viteConfig, {
    test: {
      // Agent worktrees and build output contain copies of the test suite.
      exclude: [...configDefaults.exclude, '.claude/**', 'dist*/**'],
    },
  }),
);
