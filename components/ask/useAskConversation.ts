import { useCallback, useRef, useState } from 'react';
import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import {
  buildAnswerRequest,
  buildAskSchema,
  buildPlanRequest,
  executeQueryPlan,
  LIMITS,
  type ChartHint,
  type HistoryTurn,
  type QueryExecution,
  type QueryLabels,
  type QueryPlan,
} from '../../domain/financeQuery';
import { requestAnswer, requestPlan, type AskFailure } from '../../services/askService';

export type AskTurnStatus = 'thinking' | 'done' | 'clarify' | 'error';

export interface AskTurn {
  id: string;
  question: string;
  status: AskTurnStatus;
  title?: string;
  plan?: QueryPlan;
  execution?: QueryExecution;
  answer?: string;
  chart?: ChartHint;
  /** The AI wording failed; the answer is a local summary of the exact numbers. */
  localOnly?: boolean;
  error?: AskFailure;
}

type Strings = (typeof TRANSLATIONS)['en'];

export const queryLabels = (t: Strings): QueryLabels => ({
  uncategorized: t.askNoCategory,
  noPerson: t.askNoPerson,
  noMerchant: t.askNoShop,
  noEvent: t.askNoEvent,
  noAccount: t.askNoAccount,
  me: t.askMe,
});

let turnSeq = 0;

/**
 * The Ask conversation. Each question: plan (AI, names only) -> execute locally -> answer (AI,
 * aggregates only). Follow-ups send the last three questions with their plans, never answers.
 */
export function useAskConversation(state: AppState, formatTotal: (execution: QueryExecution) => string) {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const stateRef = useRef(state);
  stateRef.current = state;
  const generation = useRef(0);

  const update = (id: string, patch: Partial<AskTurn>) =>
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim().slice(0, LIMITS.question);
    if (!question) return;
    const current = stateRef.current;
    const t = TRANSLATIONS[current.language];
    const runGeneration = generation.current;
    const id = `ask-${(turnSeq += 1)}`;
    const history: HistoryTurn[] = turnsRef.current
      .filter((turn) => turn.plan)
      .slice(-LIMITS.history)
      .map((turn) => ({ question: turn.question, plan: turn.plan! }));
    setTurns((existing) => [...existing, { id, question, status: 'thinking' }]);

    const planned = await requestPlan(buildPlanRequest(question, buildAskSchema(current, current.language), history));
    if (generation.current !== runGeneration) return;
    if (!planned.ok) {
      update(id, { status: 'error', error: planned.error });
      return;
    }
    if (planned.value.kind === 'clarify') {
      update(id, { status: 'clarify', answer: planned.value.question });
      return;
    }

    const { plan, title, token } = planned.value;
    // Run against the freshest state: the user may have added entries while waiting.
    const latest = stateRef.current;
    const execution = executeQueryPlan(latest, plan, { labels: queryLabels(TRANSLATIONS[latest.language]) });
    update(id, { plan, title, execution });

    const answered = await requestAnswer(buildAnswerRequest(question, title, latest.language, token, execution.table));
    if (generation.current !== runGeneration) return;
    if (answered.ok) {
      update(id, { status: 'done', answer: answered.value.answer, chart: answered.value.chart });
      return;
    }
    if (answered.error === 'quota' || answered.error === 'offline') {
      update(id, { status: 'error', error: answered.error });
      return;
    }
    const nothing = execution.table.count === 0 && execution.table.rows.length === 0;
    update(id, {
      status: 'done',
      localOnly: true,
      chart: 'none',
      answer: nothing
        ? t.askNothing
        : t.askLocalAnswer.replace('{title}', title || question).replace('{total}', formatTotal(execution)),
    });
  }, [formatTotal]);

  const retry = useCallback((id: string) => {
    const turn = turnsRef.current.find((item) => item.id === id);
    if (!turn) return;
    setTurns((current) => current.filter((item) => item.id !== id));
    turnsRef.current = turnsRef.current.filter((item) => item.id !== id);
    void ask(turn.question);
  }, [ask]);

  const reset = useCallback(() => {
    generation.current += 1;
    setTurns([]);
  }, []);

  const busy = turns.some((turn) => turn.status === 'thinking');
  return { turns, ask, retry, reset, busy };
}
