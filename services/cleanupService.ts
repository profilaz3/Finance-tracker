import type { AppState, Category, Transaction } from '../types';
import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import { classifyAiStatus, type AiErrorKind } from './aiErrors';
import {
  MERCHANT_BATCH_SIZE,
  validateCleanupResult,
  validateMerchantMeta,
  type CleanupItemInput,
  type CleanupItemResult,
  type MerchantMeta,
} from '../utils/aiCleanup';
import { readMerchantMeta, writeMerchantMeta, type StoredMerchantMeta } from './subscriptionStore';

type Language = AppState['language'];

/**
 * Client side of the `ai-cleanup` edge function. Everything here degrades to "no AI".
 */

export type AiResult<T> = { ok: true; value: T } | { ok: false; reason: AiErrorKind | 'offline' };

const META_TTL_MS = 90 * 86_400_000;
const MAX_META_ENTRIES = 300;

const invoke = async (body: Record<string, unknown>): Promise<AiResult<unknown>> => {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return { ok: false, reason: 'unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const supabaseService = await getSupabaseService();
    const { data, error } = await supabaseService.client.functions.invoke('ai-cleanup', { body });
    if (error) {
      const context = (error as { context?: unknown }).context;
      return { ok: false, reason: classifyAiStatus(context instanceof Response ? context.status : undefined) };
    }
    const payload = data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data;
    return { ok: true, value: payload };
  } catch {
    return { ok: false, reason: 'network' };
  }
};

// ---- Subscription merchant names -------------------------------------------------------------

/**
 * Display names and service types for merchant keys not cached yet (one call, at most
 * MERCHANT_BATCH_SIZE keys). Returns the full cache afterwards.
 */
export const fetchMerchantMeta = async (
  merchants: readonly { key: string; label: string }[],
): Promise<Record<string, StoredMerchantMeta>> => {
  const cache = readMerchantMeta();
  const now = Date.now();
  const missing = merchants.filter(m => !cache[m.key] || now - cache[m.key].at > META_TTL_MS).slice(0, MERCHANT_BATCH_SIZE);
  if (missing.length === 0) return cache;
  const result = await invoke({ mode: 'merchants', merchants: missing.map(m => ({ key: m.key, label: m.label.slice(0, 80) })) });
  if (!result.ok) return cache;
  const items: MerchantMeta[] = validateMerchantMeta(result.value, missing.map(m => m.key));
  for (const item of items) cache[item.key] = { name: item.name, service: item.service, at: now };
  const trimmed = Object.fromEntries(
    Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_META_ENTRIES),
  );
  writeMerchantMeta(trimmed);
  return trimmed;
};

// ---- Clean-up ---------------------------------------------------------------------------------

/** Runs the batches one after another, reporting progress; stops at the first failure. */
export const runCleanupBatches = async (
  batches: readonly CleanupItemInput[][],
  categories: readonly Category[],
  language: Language,
  onProgress: (done: number, total: number) => void,
  signal?: { cancelled: boolean },
): Promise<AiResult<CleanupItemResult[]>> => {
  const pickable = categories
    .filter(c => c.type === 'income' || c.type === 'expense')
    .filter(c => !['internal-transfer', 'debt-repayment', 'loan-repayment'].includes(c.id))
    .map(c => ({ name: c.name.slice(0, 60), type: c.type }));
  const results: CleanupItemResult[] = [];
  onProgress(0, batches.length);
  for (let i = 0; i < batches.length; i += 1) {
    if (signal?.cancelled) break;
    const result = await invoke({ mode: 'cleanup', items: batches[i], categories: pickable, language });
    if (!result.ok) {
      // Keep what earlier batches found; report the failure only when nothing came back.
      if (results.length > 0) break;
      return result;
    }
    results.push(...validateCleanupResult(result.value, batches[i], pickable));
    onProgress(i + 1, batches.length);
  }
  return { ok: true, value: results };
};

// Moved to transactionCommit so Activity can use it without the clean-up code.
export { commitTransactionChanges } from './transactionCommit';
