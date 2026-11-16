import type { AskTurn } from './useAskConversation';

/**
 * The last answered question of this session, so the Insights page can show it under the Ask
 * field. Kept in memory only: it holds aggregates worked out on this device and is gone on reload.
 */
let last: AskTurn | null = null;
const listeners = new Set<() => void>();

export const setLastAnswer = (turn: AskTurn | null): void => {
  last = turn;
  listeners.forEach(listener => listener());
};

export const getLastAnswer = (): AskTurn | null => last;

export const subscribeLastAnswer = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
