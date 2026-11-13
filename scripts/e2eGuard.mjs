import process from 'node:process';

/**
 * Regression scripts create and delete real data. Unless E2E_ALLOW_REMOTE=1,
 * abort every request to a hosted Supabase project so a dev server built
 * against production cannot be written to. Point the app at the local stack
 * (`supabase start`, VITE_SUPABASE_URL=http://127.0.0.1:54321) instead.
 */
export async function guardBackend(context) {
  if (process.env.E2E_ALLOW_REMOTE === '1') return;
  let warned = false;
  await context.route(/^https:\/\/[^/]+\.supabase\.(co|in)\//, (route) => {
    if (!warned) {
      warned = true;
      process.exitCode = 1;
      console.error(
        'Blocked a request to a hosted Supabase project. Run the app against the local stack, ' +
          'or set E2E_ALLOW_REMOTE=1 if you really mean to write to that project.',
      );
    }
    return route.abort('blockedbyclient');
  });
}
