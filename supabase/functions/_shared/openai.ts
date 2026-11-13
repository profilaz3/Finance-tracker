import { HttpError } from './http.ts';

type Content = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }>;

export interface ChatOptions {
  messages: Array<{ role: 'system' | 'user'; content: Content }>;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  /** Overrides OPENAI_MODEL for this call. */
  model?: string;
  timeoutMs?: number;
}

export const DEFAULT_MODEL = 'gpt-4o';

export const chatCompletion = async (options: ChatOptions): Promise<string> => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
      body: JSON.stringify({
        model: options.model ?? Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new HttpError(504, 'AI request timed out');
    }
    throw error;
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error('[openai]', response.status, detail);
    if (response.status === 429) throw new HttpError(503, 'AI service is busy. Try again shortly.');
    throw new HttpError(502, 'AI service error');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new HttpError(502, 'AI service returned no content');
  }
  return content;
};

/** Strips characters that could break out of a prompt list and bounds the length. */
export const promptSafe = (value: unknown, max = 60): string =>
  String(value ?? '')
    .replace(/[\r\n\t`]/g, ' ')
    .slice(0, max)
    .trim();
