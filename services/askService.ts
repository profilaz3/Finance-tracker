import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import { classifyAiStatus, type AiErrorKind } from './aiErrors';
import {
  validateAnswerReply,
  validatePlanReply,
  type AnswerRequestBody,
  type AskAnswer,
  type PlanReply,
  type PlanRequestBody,
} from '../domain/financeQuery';

/**
 * Client for the ask-finances edge function. Unlike services/aiService.ts it returns typed
 * failures, because the Ask sheet explains them inline instead of through the global AI toast.
 */

export type AskFailure = AiErrorKind | 'offline' | 'expired';

export type AskOutcome<T> = { ok: true; value: T } | { ok: false; error: AskFailure };

export type PlanOutcome = (Extract<PlanReply, { kind: 'plan' }> & { token: string }) | Extract<PlanReply, { kind: 'clarify' }>;

const describe = async (error: unknown): Promise<number | undefined> => {
  const context = (error as { context?: unknown } | null)?.context;
  return context instanceof Response ? context.status : undefined;
};

async function invoke<T>(body: PlanRequestBody | AnswerRequestBody | { mode: string }, validate: (value: unknown) => T | null): Promise<AskOutcome<T>> {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return { ok: false, error: 'unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'offline' };
  try {
    const service = await getSupabaseService();
    const { data, error } = await service.client.functions.invoke('ask-finances', { body });
    if (error) {
      const status = await describe(error);
      if (status === 403) return { ok: false, error: 'expired' };
      return { ok: false, error: classifyAiStatus(status) };
    }
    const payload = data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data;
    const value = validate(payload);
    return value === null ? { ok: false, error: 'unknown' } : { ok: true, value };
  } catch {
    return { ok: false, error: 'network' };
  }
}

const validatePlanOutcome = (value: unknown): PlanOutcome | null => {
  const reply = validatePlanReply(value);
  if (!reply.ok) return null;
  if (reply.value.kind === 'clarify') return reply.value;
  const token = (value as { token?: unknown }).token;
  return typeof token === 'string' && token.length <= 200 ? { ...reply.value, token } : null;
};

/** Step 1: question + names-only schema to a query plan. Costs one AI quota unit. */
export const requestPlan = (body: PlanRequestBody): Promise<AskOutcome<PlanOutcome>> => invoke(body, validatePlanOutcome);

/** Step 2: question + aggregate table to a short answer and chart hint. Free, needs the plan token. */
export const requestAnswer = (body: AnswerRequestBody): Promise<AskOutcome<AskAnswer>> => invoke(body, validateAnswerReply);

/** Voice question: transcript only (`parse: false`). Costs one AI quota unit, like voice entry. */
export const transcribeQuestion = async (
  audioBase64: string,
  mimeType: string,
  language: 'en' | 'sr',
): Promise<AskOutcome<string>> => {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return { ok: false, error: 'unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'offline' };
  try {
    const service = await getSupabaseService();
    const { data, error } = await service.client.functions.invoke('transcribe', {
      body: { audio: audioBase64, mimeType, language, parse: false },
    });
    if (error) return { ok: false, error: classifyAiStatus(await describe(error)) };
    const payload = data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data;
    const transcript = (payload as { transcript?: unknown } | null)?.transcript;
    return typeof transcript === 'string' && transcript.trim()
      ? { ok: true, value: transcript.trim().slice(0, 300) }
      : { ok: false, error: 'rejected' };
  } catch {
    return { ok: false, error: 'network' };
  }
};
