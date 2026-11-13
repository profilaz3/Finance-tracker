import { Category, Account, Person, Transaction, Currency } from '../types';
import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import {
  MerchantHint,
  ParsedReceipt,
  ParsedTransaction,
  validateParsedReceipt,
  validateParsedTransaction,
} from '../utils/aiShared';
import { classifyAiStatus, emitAiError } from './aiErrors';

export type { MerchantHint, ParsedReceipt, ParsedTransaction } from '../utils/aiShared';

type EdgeFunctionName = 'parse-transaction' | 'scan-receipt' | 'generate-insights' | 'transcribe';

interface EdgeFunctionEnvelope<T> {
  data?: T;
  error?: string;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const unwrapFunctionData = <T>(payload: unknown): T | null => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as EdgeFunctionEnvelope<T>).data ?? null;
  }

  return (payload as T) ?? null;
};

export { classifyAiStatus, subscribeAiErrors } from './aiErrors';
export type { AiErrorInfo, AiErrorKind } from './aiErrors';

const describeFunctionError = async (error: unknown): Promise<{ status?: number; message?: string }> => {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    let message: string | undefined;
    try {
      const body: unknown = await context.clone().json();
      if (body && typeof body === 'object' && isNonEmptyString((body as EdgeFunctionEnvelope<unknown>).error)) {
        message = (body as EdgeFunctionEnvelope<unknown>).error;
      }
    } catch {
      // Non-JSON error body
    }
    return { status: context.status, message };
  }
  return {};
};

async function invokeAiFunction<T>(
  functionName: EdgeFunctionName,
  body: Record<string, unknown>,
  validate: (value: unknown) => T | null,
  errorLabel: string,
): Promise<T | null> {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const supabaseService = await getSupabaseService();
    const { data, error } = await supabaseService.client.functions.invoke(functionName, { body });
    if (error) {
      const { status, message } = await describeFunctionError(error);
      emitAiError({ fn: functionName, kind: classifyAiStatus(status), status, message });
      if (import.meta.env.DEV) {
        console.error(`${errorLabel}:`, status, message ?? error);
      }
      return null;
    }

    const result = validate(unwrapFunctionData(data));
    if (result === null) {
      emitAiError({ fn: functionName, kind: 'rejected' });
    }
    return result;
  } catch (error) {
    emitAiError({ fn: functionName, kind: 'network' });
    if (import.meta.env.DEV) {
      console.error(`${errorLabel}:`, error);
    }
    return null;
  }
}

export const toAiPerson = ({ id, name, defaultCurrency, balances }: Person) => ({ id, name, defaultCurrency, balances });

export const isAIAvailable = (): boolean => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const parseTransaction = async (
  input: string,
  categories: Category[],
  accounts: Account[],
  people: Person[],
  hints: MerchantHint[] = [],
): Promise<ParsedTransaction | null> =>
  invokeAiFunction(
    'parse-transaction',
    // Only what the parser needs: avatars (URLs or inline images) never leave the device.
    { input, categories, accounts, people: people.map(toAiPerson), hints },
    validateParsedTransaction,
    'Transaction parsing failed',
  );

export interface VoiceEntryResult {
  transcript: string;
  parsed: ParsedTransaction | null;
}

export const validateVoiceEntry = (value: unknown): VoiceEntryResult | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.transcript)) return null;
  return {
    transcript: record.transcript.trim().slice(0, 500),
    parsed: record.parsed == null ? null : validateParsedTransaction(record.parsed),
  };
};

/** Voice entry: one round trip that transcribes the recording and parses the transcript. */
export const transcribeTransaction = async (
  audioBase64: string,
  mimeType: string,
  language: 'en' | 'sr',
  categories: Category[],
  accounts: Account[],
  people: Person[],
  hints: MerchantHint[] = [],
): Promise<VoiceEntryResult | null> =>
  invokeAiFunction(
    'transcribe',
    { audio: audioBase64, mimeType, language, categories, accounts, people: people.map(toAiPerson), hints },
    validateVoiceEntry,
    'Voice entry failed',
  );

export const scanReceipt = async (
  imageBase64: string,
  categories: Category[],
  accounts: Account[],
): Promise<ParsedReceipt | null> =>
  invokeAiFunction(
    'scan-receipt',
    { imageBase64, categories, accounts },
    validateParsedReceipt,
    'Receipt scanning failed',
  );

const validateInsightsReport = (value: unknown): string | null => (isNonEmptyString(value) ? value : null);

export const generateInsights = async (
  transactions: Transaction[],
  categories: Category[],
  period: 'weekly' | 'monthly',
  baseCurrency: Currency,
  language: 'en' | 'sr',
): Promise<string | null> =>
  invokeAiFunction(
    'generate-insights',
    { transactions, categories, period, baseCurrency, language },
    validateInsightsReport,
    'Insights generation failed',
  );
