const DEFAULT_ORIGINS = [
  // Web app on Cloudflare (wrangler.jsonc); the Netlify one stays until that site is switched off.
  'https://vratipare.profilaz3.workers.dev',
  'https://vratipare.netlify.app',
  'http://localhost:3000',
  'https://localhost',
  'capacitor://localhost',
];

const allowedOrigins = (): string[] => {
  const extra = Deno.env.get('ALLOWED_ORIGINS');
  return extra ? [...DEFAULT_ORIGINS, ...extra.split(',').map((o) => o.trim()).filter(Boolean)] : DEFAULT_ORIGINS;
};

export const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = allowedOrigins();
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

export const jsonResponse = (req: Request, body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

export class HttpError extends Error {
  constructor(readonly status: number, readonly publicMessage: string) {
    super(publicMessage);
  }
}

/** Reads a JSON body while enforcing a byte limit, without trusting Content-Length. */
export const readJsonBody = async (req: Request, maxBytes: number): Promise<unknown> => {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'Request too large');
  if (!req.body) throw new HttpError(400, 'Missing request body');

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Request too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
};

type Handler = (req: Request) => Promise<Response>;

/** Wraps a handler with CORS preflight, method check and generic error responses. */
export const serveJson = (name: string, handler: Handler): void => {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof HttpError) return jsonResponse(req, { error: error.publicMessage }, error.status);
      console.error(`[${name}]`, error instanceof Error ? error.message : error);
      return jsonResponse(req, { error: 'Internal error' }, 500);
    }
  });
};
