import { Category, Account, Person, Transaction, Currency } from '../types';
import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import {
  ParsedReceipt,
  ParsedTransaction,
  validateParsedReceipt,
  validateParsedTransaction,
} from '../utils/aiShared';

export type { ParsedReceipt, ParsedTransaction } from '../utils/aiShared';

type EdgeFunctionName = 'parse-transaction' | 'scan-receipt' | 'generate-insights';

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
      throw error;
    }

    return validate(unwrapFunctionData(data));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`${errorLabel}:`, error);
    }
    return null;
  }
}

export const isAIAvailable = (): boolean => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export const parseTransaction = async (
  input: string,
  categories: Category[],
  accounts: Account[],
  people: Person[],
): Promise<ParsedTransaction | null> =>
  invokeAiFunction(
    'parse-transaction',
    { input, categories, accounts, people },
    validateParsedTransaction,
    'Transaction parsing failed',
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
