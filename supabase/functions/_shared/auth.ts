import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.119.0';
import { HttpError } from './http.ts';

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

export interface AuthedContext {
  user: User;
  /** Client acting as the caller, so RLS and auth.uid() apply. */
  client: SupabaseClient;
}

export const requireUser = async (req: Request): Promise<AuthedContext> => {
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Unauthorized');

  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Unauthorized');
  return { user: data.user, client };
};

export const adminClient = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type AiFunction = 'scan-receipt' | 'parse-transaction' | 'generate-insights';

const DEFAULT_DAILY_LIMITS: Record<AiFunction, number> = {
  'scan-receipt': 30,
  'parse-transaction': 100,
  'generate-insights': 10,
};

/** Counts one AI call against the caller's daily quota; throws 429 when exhausted. */
export const consumeQuota = async (ctx: AuthedContext, fn: AiFunction): Promise<void> => {
  const envKey = `AI_DAILY_LIMIT_${fn.toUpperCase().replace(/-/g, '_')}`;
  const configured = Number(Deno.env.get(envKey));
  const limit = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DAILY_LIMITS[fn];

  const { data, error } = await adminClient().rpc('consume_ai_quota', {
    p_user_id: ctx.user.id,
    p_fn: fn,
    p_daily_limit: limit,
  });
  if (error) throw new Error(`quota check failed: ${error.message}`);
  if (data !== true) throw new HttpError(429, 'Daily AI limit reached. Try again tomorrow.');
};
