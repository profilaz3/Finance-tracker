import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import { classifyAiStatus, type AiErrorKind } from './aiErrors';
import { blobToBase64 } from '../utils/blobBase64';
import { validateAssignResult, type AssignResult, type SplitItem, type SplitPerson } from '../domain/receiptSplit';

export type SplitAiFailure = AiErrorKind | 'offline';
export type SplitAiResult<T> = { ok: true; value: T } | { ok: false; reason: SplitAiFailure };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const invoke = async (name: 'assign-split' | 'transcribe', body: Record<string, unknown>): Promise<SplitAiResult<unknown>> => {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return { ok: false, reason: 'unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const supabaseService = await getSupabaseService();
    const { data, error } = await supabaseService.client.functions.invoke(name, { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      const status = context instanceof Response ? context.status : undefined;
      return { ok: false, reason: status === undefined ? 'offline' : classifyAiStatus(status) };
    }
    return { ok: true, value: isRecord(data) && 'data' in data ? data.data : data };
  } catch {
    return { ok: false, reason: 'offline' };
  }
};

/**
 * Asks the `assign-split` function who had which receipt line. The answer is validated again here
 * (ids, every item assigned); amounts are computed locally by domain/receiptSplit.ts.
 */
export async function assignReceiptSplit(
  items: SplitItem[],
  people: SplitPerson[],
  instruction: string,
  language: 'en' | 'sr',
): Promise<SplitAiResult<AssignResult>> {
  const response = await invoke('assign-split', {
    items: items.map(({ id, name, quantity, total }) => ({ id, name, quantity, total })),
    people: people.map(({ id, name }) => ({ id, name })),
    instruction,
    language,
  });
  if (!response.ok) return response;
  const result = validateAssignResult(response.value, items, people);
  return result ? { ok: true, value: result } : { ok: false, reason: 'rejected' };
}

/** Voice instruction: transcript only (the `transcribe` function with parsing off). */
export async function transcribeInstruction(
  recording: { blob: Blob; mimeType: string },
  language: 'en' | 'sr',
): Promise<SplitAiResult<string>> {
  const audio = await blobToBase64(recording.blob);
  const response = await invoke('transcribe', { audio, mimeType: recording.mimeType, language, parse: false });
  if (!response.ok) return response;
  const transcript = isRecord(response.value) && typeof response.value.transcript === 'string' ? response.value.transcript.trim() : '';
  return transcript ? { ok: true, value: transcript } : { ok: false, reason: 'rejected' };
}
