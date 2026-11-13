/**
 * AI calls resolve to null on failure. This tiny event bus lets the app shell
 * explain why (daily limit, service down) without importing the AI service.
 */

export type AiFunctionName = 'parse-transaction' | 'scan-receipt' | 'generate-insights';

export type AiErrorKind = 'quota' | 'unavailable' | 'rejected' | 'network' | 'unknown';

export interface AiErrorInfo {
  fn: AiFunctionName;
  kind: AiErrorKind;
  status?: number;
  message?: string;
}

type AiErrorListener = (info: AiErrorInfo) => void;

const aiErrorListeners = new Set<AiErrorListener>();

/** AI calls still resolve to null on failure; subscribe here to tell the user why. */
export const subscribeAiErrors = (listener: AiErrorListener): (() => void) => {
  aiErrorListeners.add(listener);
  return () => {
    aiErrorListeners.delete(listener);
  };
};

export const emitAiError = (info: AiErrorInfo): void => {
  aiErrorListeners.forEach(listener => {
    try {
      listener(info);
    } catch {
      // A broken listener must not break the caller
    }
  });
};

export const classifyAiStatus = (status: number | undefined): AiErrorKind => {
  if (status === undefined) return 'network';
  if (status === 429) return 'quota';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  if (status >= 400 && status < 500) return 'rejected';
  return 'unknown';
};
