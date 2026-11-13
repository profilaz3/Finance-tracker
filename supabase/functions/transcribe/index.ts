import { cyrillicToLatin } from '../../../utils/aiShared.ts';
import { consumeQuota, requireUser } from '../_shared/auth.ts';
import { oneOf, requireRecord } from '../_shared/input.ts';
import { HttpError, jsonResponse, readJsonBody, serveJson } from '../_shared/http.ts';
import { parseTransactionText, readParseContext } from '../_shared/parseTransaction.ts';

// ~2.2 MB of audio once base64-encoded (30 s of AAC at 128 kbps is ~0.5 MB), plus the parse lists.
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_AUDIO_BASE64_CHARS = 2_900_000;
const MIN_AUDIO_BYTES = 512;
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-transcribe';
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'] as const;
const EXTENSIONS: Record<(typeof AUDIO_TYPES)[number], string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
};
const BASE64 = /^[A-Za-z0-9+/]+=*$/;

const decodeAudio = (value: unknown): Uint8Array<ArrayBuffer> => {
  let base64 = typeof value === 'string' ? value.trim() : '';
  if (!base64) throw new HttpError(400, 'Missing audio');
  if (base64.startsWith('data:')) base64 = base64.slice(base64.indexOf(',') + 1);
  if (base64.length > MAX_AUDIO_BASE64_CHARS) throw new HttpError(413, 'Recording too long');
  if (!BASE64.test(base64)) throw new HttpError(400, 'Invalid audio data');
  const binary = atob(base64);
  if (binary.length < MIN_AUDIO_BYTES) throw new HttpError(400, 'Recording too short');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const transcribe = async (audio: Uint8Array<ArrayBuffer>, mimeType: (typeof AUDIO_TYPES)[number], language: 'en' | 'sr'): Promise<string> => {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const form = new FormData();
  form.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? DEFAULT_TRANSCRIBE_MODEL);
  // Serbian is pinned; with an English interface the speaker may still use Serbian, so the model detects it.
  if (language === 'sr') form.append('language', 'sr');
  form.append(
    'prompt',
    language === 'sr'
      ? 'Srpski, latinica. Kratak opis troška ili prihoda: iznos u dinarima ili evrima, prodavnica, kategorija, datum.'
      : 'A short spoken note about an expense or income (English or Serbian latinica): amount, currency, shop, category, date.',
  );
  form.append('file', new Blob([audio], { type: mimeType }), `voice.${EXTENSIONS[mimeType]}`);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new HttpError(504, 'AI request timed out');
    }
    throw error;
  }
  if (!response.ok) {
    console.error('[transcribe]', response.status, (await response.text()).slice(0, 500));
    if (response.status === 429) throw new HttpError(503, 'AI service is busy. Try again shortly.');
    throw new HttpError(502, 'AI service error');
  }
  const payload = await response.json();
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  // The models often answer Serbian in Cyrillic whatever the prompt says; the app works in latinica.
  return cyrillicToLatin(text).slice(0, 500);
};

/**
 * Voice entry: audio in, transcript plus a parsed transaction out, in one round trip.
 * Counts once against the parse-transaction quota (the quota table only knows the three AI kinds).
 */
serveJson('transcribe', async (req) => {
  const ctx = await requireUser(req);
  const body = requireRecord(await readJsonBody(req, MAX_BODY_BYTES));

  const mimeType = oneOf(String(body.mimeType ?? '').split(';')[0].trim(), AUDIO_TYPES, 'audio/webm');
  const language = oneOf(body.language, ['en', 'sr'] as const, 'en');
  const audio = decodeAudio(body.audio);
  const shouldParse = body.parse !== false;
  const context = shouldParse ? readParseContext(body) : null;

  await consumeQuota(ctx, 'parse-transaction');

  const transcript = await transcribe(audio, mimeType, language);
  if (!transcript) throw new HttpError(422, 'Could not hear anything');

  const parsed = context ? await parseTransactionText(transcript, context).catch((error) => {
    // A transcript without a parse is still useful: the user can edit it and try again.
    console.error('[transcribe] parse failed', error instanceof Error ? error.message : error);
    return null;
  }) : null;

  return jsonResponse(req, { data: { transcript, parsed } });
});
