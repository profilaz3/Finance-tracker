import { CONFIG } from '../config';
import type { AppLanguage } from '../utils/locale';
import { getSupabaseService } from './runtimeServices';
import { classifyAiStatus, emitAiError } from './aiErrors';
import {
  collectAllowedNumbers,
  groundLetter,
  groundSentence,
  normalizeLetterText,
} from '../domain/letterGrounding';
import {
  buildLetterAggregates,
  hasEnoughForLetter,
  letterArchiveKey,
  letterMonthFor,
  monthId,
  parseLetterArchive,
  parseMonthId,
  pickSubscriptionToCheck,
  toLetterFacts,
  withLetter,
  type LetterInputs,
  type LetterOptions,
  type StoredLetter,
} from '../domain/monthlyLetter';
import type { AnomalyContext } from '../domain/anomalyContext';
import { readDismissedSubscriptions, readMerchantMeta } from './subscriptionStore';
import { getLetterSnapshot, LETTER_PREFIX, readLetterJson, updateLetters, writeLetterJson } from './letterStore';

// Store reads stay importable from here for the lazy views.
export {
  clearOpenLetterRequest,
  getLetterSnapshot,
  requestOpenLetter,
  setLetterContext,
  subscribeLetters,
  type LetterSnapshot,
} from './letterStore';

/**
 * Monthly letters and anomaly explanations: calls to the `monthly-letter` edge function plus a
 * small per-device cache. Letters are stored per user and workspace, one per month.
 */

const FUNCTION_NAME = 'monthly-letter';
const describeError = async (error: unknown): Promise<number | undefined> => {
  const context = (error as { context?: unknown } | null)?.context;
  return context instanceof Response ? context.status : undefined;
};

/** Calls the edge function. Resolves to the unwrapped `data`, or null on any failure. */
async function invoke(body: Record<string, unknown>, quiet: boolean): Promise<Record<string, unknown> | null> {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return null;
  try {
    const service = await getSupabaseService();
    const { data, error } = await service.client.functions.invoke(FUNCTION_NAME, { body });
    if (error) {
      const status = await describeError(error);
      if (!quiet) emitAiError({ fn: 'generate-insights', kind: classifyAiStatus(status), status });
      return null;
    }
    const payload = data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data;
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    if (!quiet) emitAiError({ fn: 'generate-insights', kind: 'network' });
    return null;
  }
}

export type LetterResult =
  | { status: 'ok'; letter: StoredLetter }
  | { status: 'thin' }
  | { status: 'failed' };

const inFlight = new Map<string, Promise<LetterResult>>();

/**
 * Writes the letter for `month` (default: last month) from the given workspace state and
 * stores it. Calls for the same user, workspace and month share one request.
 */
export function generateLetter(
  state: LetterInputs,
  language: AppLanguage,
  options: LetterOptions & { month?: string; quiet?: boolean; now?: Date } = {},
): Promise<LetterResult> {
  const { userId, scope } = getLetterSnapshot();
  if (!userId) return Promise.resolve({ status: 'failed' });
  const key = (options.month && parseMonthId(options.month)) || letterMonthFor(options.now ?? new Date());
  const month = monthId(key);
  const flightKey = `${userId}:${scope ?? ''}:${month}`;
  const running = inFlight.get(flightKey);
  if (running) return running;

  const subscription = options.subscription !== undefined ? options.subscription : pickSubscriptionToCheck(state, key, {
    dismissed: readDismissedSubscriptions(),
    names: Object.fromEntries(Object.entries(readMerchantMeta()).map(([merchant, meta]) => [merchant, meta.name])),
  });
  const aggregates = buildLetterAggregates(state, key, { ...options, subscription });
  if (!hasEnoughForLetter(aggregates)) return Promise.resolve({ status: 'thin' });
  const facts = toLetterFacts(aggregates, language);

  const task = (async (): Promise<LetterResult> => {
    updateLetters({ writing: [...getLetterSnapshot().writing, month] });
    try {
      const data = await invoke({ mode: 'letter', language, facts }, Boolean(options.quiet));
      const text = normalizeLetterText(data);
      if (!text) return { status: 'failed' };
      // The server already grounded it; check again here so nothing slips through a stale server.
      const grounded = groundLetter(text, collectAllowedNumbers(facts), String(facts.month));
      if (grounded.sections.length === 0) return { status: 'failed' };
      const letter: StoredLetter = {
        month,
        language,
        title: grounded.title,
        sections: grounded.sections,
        generatedAt: Date.now(),
        stats: {
          currency: aggregates.currency,
          spent: aggregates.spent,
          previousSpent: aggregates.previousSpent,
          spentChangePct: aggregates.spentChangePct,
          income: aggregates.income,
          budgetLimit: aggregates.budget?.limit ?? null,
        },
      };
      // The user may have switched workspace meanwhile: store under the one this was written for.
      const storageKey = letterArchiveKey(LETTER_PREFIX, userId, scope);
      const archive = withLetter(parseLetterArchive(readLetterJson(storageKey)), letter);
      writeLetterJson(storageKey, archive);
      const current = getLetterSnapshot();
      if (current.userId === userId && current.scope === scope) updateLetters({ archive });
      return { status: 'ok', letter };
    } finally {
      inFlight.delete(flightKey);
      updateLetters({ writing: getLetterSnapshot().writing.filter(item => item !== month) });
    }
  })();
  inFlight.set(flightKey, task);
  return task;
}

// ---------------------------------------------------------------------------
// Anomaly explanations

const MAX_CACHED_SIGNATURES = 20;

interface ExplanationCache {
  order: string[];
  entries: Record<string, Record<string, string>>;
}

const explanationKey = () => {
  const { userId, scope } = getLetterSnapshot();
  return `${LETTER_PREFIX}:anomaly-why:${userId ?? 'local'}:${scope ?? 'personal'}`;
};

const readExplanationCache = (): ExplanationCache => {
  const raw = readLetterJson(explanationKey()) as ExplanationCache | null;
  return raw && Array.isArray(raw.order) && raw.entries && typeof raw.entries === 'object' ? raw : { order: [], entries: {} };
};

export const canExplainAnomalies = (): boolean => Boolean(getLetterSnapshot().userId && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const getCachedExplanations = (signature: string): Record<string, string> | null =>
  readExplanationCache().entries[signature] ?? null;

const explanationFlights = new Map<string, Promise<Record<string, string> | null>>();

/**
 * One batched call for all flagged anomalies; cached by signature. Resolves to id to sentence,
 * or null when unavailable (the panel then simply shows no sentence).
 */
export function explainAnomalies(
  contexts: readonly AnomalyContext[],
  signature: string,
  language: AppLanguage,
): Promise<Record<string, string> | null> {
  const cached = getCachedExplanations(signature);
  if (cached) return Promise.resolve(cached);
  if (contexts.length === 0) return Promise.resolve({});
  const running = explanationFlights.get(signature);
  if (running) return running;

  const task = (async () => {
    try {
      const data = await invoke(
        { mode: 'explain-anomalies', language, anomalies: contexts.map(({ id, facts }) => ({ id, facts })) },
        true,
      );
      const list = Array.isArray(data?.explanations) ? data.explanations : null;
      if (!list) return null;
      const byId: Record<string, string> = {};
      for (const context of contexts) {
        const entry = list.find(item => item && typeof item === 'object' && (item as { id?: unknown }).id === context.id) as
          | { text?: unknown }
          | undefined;
        const sentence = groundSentence(entry?.text, collectAllowedNumbers(context.facts));
        if (sentence) byId[context.id] = sentence;
      }
      const cache = readExplanationCache();
      const order = [signature, ...cache.order.filter(item => item !== signature)].slice(0, MAX_CACHED_SIGNATURES);
      writeLetterJson(explanationKey(), { order, entries: Object.fromEntries(order.map(item => [item, item === signature ? byId : cache.entries[item]]).filter(([, value]) => value)) });
      return byId;
    } finally {
      explanationFlights.delete(signature);
    }
  })();
  explanationFlights.set(signature, task);
  return task;
}
