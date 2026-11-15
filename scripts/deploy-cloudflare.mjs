// Deploys dist/ to Cloudflare (wrangler.jsonc). Run after `npm run build` (npm run deploy:cloudflare
// does both). Takes CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from the environment, else from
// .env.local; only those two keys are passed on, never the file's other secrets.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const KEYS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];
const local = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
const env = { ...process.env };
for (const key of KEYS) {
  if (!env[key] && local[key]) env[key] = local[key].trim();
}
if (!env.CLOUDFLARE_API_TOKEN) {
  console.warn('No CLOUDFLARE_API_TOKEN in the environment or .env.local: wrangler will ask you to log in.');
}

const result = spawnSync('npx', ['--yes', 'wrangler@4', 'deploy', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
