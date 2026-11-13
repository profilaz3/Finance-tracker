/**
 * "Ask your finances" query DSL: plan types, strict validators and the bounded result table.
 *
 * Pure and import-free so the edge function (Deno) and the client (Vitest, Vite) share it.
 * The model only ever produces a plan; the client executes it locally (domain/financeQuery.ts),
 * and only the aggregate table defined here goes back to the model for wording.
 */

export const QUERY_DATASETS = ['transactions', 'eventExpenses', 'balances'] as const;
export const QUERY_METRICS = ['sum', 'count', 'avg'] as const;
export const QUERY_TYPES = ['expense', 'income', 'net'] as const;
export const QUERY_GROUPS = ['none', 'category', 'month', 'week', 'merchant', 'person', 'event', 'account'] as const;
export const QUERY_SORTS = ['desc', 'asc', 'chrono'] as const;
export const QUERY_SHARES = ['mine', 'total'] as const;
export const CHART_HINTS = ['bar', 'line', 'none'] as const;

export type QueryDataset = (typeof QUERY_DATASETS)[number];
export type QueryMetric = (typeof QUERY_METRICS)[number];
export type QueryType = (typeof QUERY_TYPES)[number];
export type QueryGroup = (typeof QUERY_GROUPS)[number];
export type QuerySort = (typeof QUERY_SORTS)[number];
export type QueryShare = (typeof QUERY_SHARES)[number];
export type ChartHint = (typeof CHART_HINTS)[number];

/** Inclusive calendar range, YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to: string;
}

export interface QueryPlan {
  dataset: QueryDataset;
  type: QueryType;
  metric: QueryMetric;
  groupBy: QueryGroup;
  /** Missing means all time. */
  range?: DateRange;
  /** Second period to compare against `range`. */
  compare?: DateRange;
  categories: string[];
  accounts: string[];
  people: string[];
  events: string[];
  /** Shop or payee text, matched word by word. */
  merchant?: string;
  /** Team name, or "personal" for items outside any team. */
  team?: string;
  /** Only charges that repeat (subscriptions): see domain/financeQuery.ts. */
  recurring: boolean;
  /** Event spending: my share or the whole group's. */
  share: QueryShare;
  sort: QuerySort;
  limit: number;
}

export type PlanReply =
  | { kind: 'plan'; title: string; plan: QueryPlan }
  | { kind: 'clarify'; question: string };

export interface HistoryTurn {
  question: string;
  plan: QueryPlan;
}

export const LIMITS = {
  question: 300,
  title: 80,
  clarify: 240,
  name: 60,
  names: 10,
  maxLimit: 20,
  defaultLimit: 10,
  history: 3,
  rows: 30,
  label: 60,
  answer: 1200,
  minYear: 2000,
  maxYear: 2100,
} as const;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string): T => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`invalid ${field}`);
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD that is a real calendar day within the supported years. */
export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < LIMITS.minYear || year > LIMITS.maxYear) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const range = (from: unknown, to: unknown, field: string): DateRange | undefined => {
  if ((from === undefined || from === null) && (to === undefined || to === null)) return undefined;
  const start = from === undefined || from === null ? `${LIMITS.minYear}-01-01` : from;
  const end = to === undefined || to === null ? `${LIMITS.maxYear}-12-31` : to;
  if (!isIsoDate(start) || !isIsoDate(end)) throw new Error(`invalid ${field} date`);
  if (start > end) throw new Error(`${field} starts after it ends`);
  return { from: start, to: end };
};

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

const names = (value: unknown, field: string): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`invalid ${field}`);
  if (value.length > LIMITS.names) throw new Error(`too many ${field}`);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`invalid ${field}`);
    const name = cleanText(item, LIMITS.name);
    if (name && !out.some((existing) => existing.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
};

const optionalText = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`invalid ${field}`);
  return cleanText(value, LIMITS.name) || undefined;
};

const ALLOWED_PLAN_KEYS = new Set([
  'dataset', 'type', 'metric', 'groupBy', 'from', 'to', 'range', 'compare', 'categories', 'accounts', 'people',
  'events', 'merchant', 'team', 'recurring', 'share', 'sort', 'limit',
]);

/**
 * Validates a plan as the model writes it (`from`/`to` or `range`, `compare: {from, to}`).
 * Unknown keys, unknown enum values, bad dates and oversized lists are rejected, not repaired.
 */
export const validateQueryPlan = (value: unknown): Result<QueryPlan> => {
  try {
    if (!isRecord(value)) throw new Error('plan is not an object');
    for (const key of Object.keys(value)) {
      if (!ALLOWED_PLAN_KEYS.has(key)) throw new Error(`unknown field ${key.slice(0, 20)}`);
    }
    const dataset = pick(value.dataset, QUERY_DATASETS, 'transactions', 'dataset');
    const groupBy = pick(value.groupBy, QUERY_GROUPS, 'none', 'groupBy');
    const rangeSource = isRecord(value.range) ? value.range : value;
    const planRange = range(rangeSource.from, rangeSource.to, 'range');
    let compare: DateRange | undefined;
    if (value.compare !== undefined && value.compare !== null) {
      if (!isRecord(value.compare)) throw new Error('invalid compare');
      compare = range(value.compare.from, value.compare.to, 'compare');
      if (compare && !planRange) throw new Error('compare needs a range');
    }

    let limit: number = LIMITS.defaultLimit;
    if (value.limit !== undefined && value.limit !== null) {
      if (typeof value.limit !== 'number' || !Number.isInteger(value.limit)) throw new Error('invalid limit');
      if (value.limit < 1 || value.limit > LIMITS.maxLimit) throw new Error('limit out of bounds');
      limit = value.limit;
    }
    if (value.recurring !== undefined && value.recurring !== null && typeof value.recurring !== 'boolean') {
      throw new Error('invalid recurring');
    }

    const plan: QueryPlan = {
      dataset,
      type: pick(value.type, QUERY_TYPES, 'expense', 'type'),
      metric: pick(value.metric, QUERY_METRICS, 'sum', 'metric'),
      groupBy,
      ...(planRange ? { range: planRange } : {}),
      ...(compare ? { compare } : {}),
      categories: names(value.categories, 'categories'),
      accounts: names(value.accounts, 'accounts'),
      people: names(value.people, 'people'),
      events: names(value.events, 'events'),
      ...(optionalText(value.merchant, 'merchant') ? { merchant: optionalText(value.merchant, 'merchant') } : {}),
      ...(optionalText(value.team, 'team') ? { team: optionalText(value.team, 'team') } : {}),
      recurring: value.recurring === true,
      share: pick(value.share, QUERY_SHARES, 'mine', 'share'),
      sort: pick(value.sort, QUERY_SORTS, groupBy === 'month' || groupBy === 'week' ? 'chrono' : 'desc', 'sort'),
      limit,
    };
    return { ok: true, value: plan };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid plan' };
  }
};

/** Validates the model's plan-step reply: a titled plan or a clarifying question. */
export const validatePlanReply = (value: unknown): Result<PlanReply> => {
  if (!isRecord(value)) return { ok: false, error: 'reply is not an object' };
  if (value.kind === 'clarify') {
    const question = cleanText(value.question, LIMITS.clarify);
    return question ? { ok: true, value: { kind: 'clarify', question } } : { ok: false, error: 'empty clarify' };
  }
  if (value.kind !== 'plan') return { ok: false, error: 'invalid kind' };
  const plan = validateQueryPlan(value.plan);
  if (!plan.ok) return plan;
  const title = cleanText(value.title, LIMITS.title);
  return { ok: true, value: { kind: 'plan', title, plan: plan.value } };
};

/** Previous turns sent with a follow-up: questions and plans only, never answers or numbers. */
export const validateHistory = (value: unknown): HistoryTurn[] => {
  if (!Array.isArray(value)) return [];
  const turns: HistoryTurn[] = [];
  for (const item of value.slice(-LIMITS.history)) {
    if (!isRecord(item)) continue;
    const question = cleanText(item.question, LIMITS.question);
    const plan = validateQueryPlan(item.plan);
    if (question && plan.ok) turns.push({ question, plan: plan.value });
  }
  return turns;
};

/** Plan back in the model's own shape (flat from/to), for history prompts. */
export const planForPrompt = (plan: QueryPlan): Record<string, unknown> => {
  const { range: planRange, ...rest } = plan;
  return { ...rest, ...(planRange ? { from: planRange.from, to: planRange.to } : {}) };
};

// ---------------------------------------------------------------------------
// Result table: the only data that goes back to the model.

export interface ResultRow {
  label: string;
  value: number;
  count: number;
  /** Same group in the comparison period. */
  compareValue?: number;
  /** Balances dataset: lent to them and repaid by them inside the range. */
  lent?: number;
  repaid?: number;
}

export interface ResultTable {
  dataset: QueryDataset;
  type: QueryType;
  metric: QueryMetric;
  groupBy: QueryGroup;
  share?: QueryShare;
  currency: string;
  range?: DateRange;
  compare?: DateRange;
  total: number;
  count: number;
  compareTotal?: number;
  compareCount?: number;
  /** Percent change from the comparison period to the range. */
  changePct?: number;
  /** Month and week groupings: mean value per period. */
  perPeriodAverage?: number;
  rows: ResultRow[];
  /** Groups cut by the limit, folded together. */
  other?: { groups: number; value: number; count: number };
  /** Filter names that matched nothing in the user's data. */
  unresolved: string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const finite = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error(`invalid ${field}`);
  return round2(value);
};

const optionalFinite = (value: unknown, field: string): number | undefined =>
  value === undefined || value === null ? undefined : finite(value, field);

const count = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000_000) {
    throw new Error(`invalid ${field}`);
  }
  return value;
};

/**
 * Rebuilds a result table from untrusted input keeping only the known aggregate fields.
 * The client runs it before sending and the edge function runs it again on receipt, so
 * nothing but labels and numbers can reach the model.
 */
export const sanitizeResultTable = (value: unknown): Result<ResultTable> => {
  try {
    if (!isRecord(value)) throw new Error('result is not an object');
    if (!Array.isArray(value.rows)) throw new Error('invalid rows');
    if (value.rows.length > LIMITS.rows) throw new Error('too many rows');
    const rows: ResultRow[] = value.rows.map((row, index) => {
      if (!isRecord(row)) throw new Error('invalid row');
      const label = cleanText(row.label, LIMITS.label);
      if (!label) throw new Error(`row ${index} has no label`);
      const compareValue = optionalFinite(row.compareValue, 'compareValue');
      const lent = optionalFinite(row.lent, 'lent');
      const repaid = optionalFinite(row.repaid, 'repaid');
      return {
        label,
        value: finite(row.value, 'value'),
        count: count(row.count, 'count'),
        ...(compareValue !== undefined ? { compareValue } : {}),
        ...(lent !== undefined ? { lent } : {}),
        ...(repaid !== undefined ? { repaid } : {}),
      };
    });
    const currency = cleanText(value.currency, 3);
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('invalid currency');
    const tableRange = isRecord(value.range) ? range(value.range.from, value.range.to, 'range') : undefined;
    const compare = isRecord(value.compare) ? range(value.compare.from, value.compare.to, 'compare') : undefined;
    let other: ResultTable['other'];
    if (isRecord(value.other)) {
      other = {
        groups: count(value.other.groups, 'other.groups'),
        value: finite(value.other.value, 'other.value'),
        count: count(value.other.count, 'other.count'),
      };
    }
    const unresolved = Array.isArray(value.unresolved)
      ? value.unresolved.slice(0, LIMITS.names * 4).map((name) => cleanText(name, LIMITS.name)).filter(Boolean)
      : [];
    const compareTotal = optionalFinite(value.compareTotal, 'compareTotal');
    const changePct = optionalFinite(value.changePct, 'changePct');
    const perPeriodAverage = optionalFinite(value.perPeriodAverage, 'perPeriodAverage');
    const table: ResultTable = {
      dataset: pick(value.dataset, QUERY_DATASETS, 'transactions', 'dataset'),
      type: pick(value.type, QUERY_TYPES, 'expense', 'type'),
      metric: pick(value.metric, QUERY_METRICS, 'sum', 'metric'),
      groupBy: pick(value.groupBy, QUERY_GROUPS, 'none', 'groupBy'),
      ...(value.share !== undefined ? { share: pick(value.share, QUERY_SHARES, 'mine', 'share') } : {}),
      currency,
      ...(tableRange ? { range: tableRange } : {}),
      ...(compare ? { compare } : {}),
      total: finite(value.total, 'total'),
      count: count(value.count, 'count'),
      ...(compareTotal !== undefined ? { compareTotal } : {}),
      ...(value.compareCount !== undefined ? { compareCount: count(value.compareCount, 'compareCount') } : {}),
      ...(changePct !== undefined ? { changePct } : {}),
      ...(perPeriodAverage !== undefined ? { perPeriodAverage } : {}),
      rows,
      ...(other ? { other } : {}),
      unresolved,
    };
    return { ok: true, value: table };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid result' };
  }
};

export interface AskAnswer {
  answer: string;
  chart: ChartHint;
}

/** The answer step's reply: short plain text (markdown stripped) plus a chart hint. */
export const validateAnswerReply = (value: unknown): AskAnswer | null => {
  if (!isRecord(value) || typeof value.answer !== 'string') return null;
  const answer = value.answer
    .replace(/\*\*|__|`|^#+\s*/gm, '')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, LIMITS.answer);
  if (!answer) return null;
  const chart = typeof value.chart === 'string' && (CHART_HINTS as readonly string[]).includes(value.chart)
    ? (value.chart as ChartHint)
    : 'none';
  return { answer, chart };
};

// ---------------------------------------------------------------------------
// Schema: names the planner may use. Only names and event dates, never amounts.

export interface AskSchema {
  today: string;
  language: 'en' | 'sr';
  currency: string;
  categories: Array<{ name: string; type: 'income' | 'expense'; subcategories?: string[] }>;
  accounts: string[];
  people: string[];
  events: Array<{ name: string; from?: string; to?: string }>;
  merchants: string[];
  teams: string[];
}

export const SCHEMA_LIMITS = { categories: 150, subcategories: 15, accounts: 40, people: 100, events: 60, merchants: 60, teams: 20 } as const;

const nameList = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value.slice(0, max).map((name) => cleanText(name, LIMITS.name)).filter(Boolean)
    : [];

/** Bounds and cleans a schema from untrusted input. Unknown fields are dropped. */
export const sanitizeSchema = (value: unknown): AskSchema | null => {
  if (!isRecord(value) || !isIsoDate(value.today)) return null;
  const currency = cleanText(value.currency, 3);
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const categories = Array.isArray(value.categories)
    ? value.categories.slice(0, SCHEMA_LIMITS.categories).flatMap((item) => {
      if (!isRecord(item)) return [];
      const name = cleanText(item.name, LIMITS.name);
      if (!name) return [];
      const subcategories = nameList(item.subcategories, SCHEMA_LIMITS.subcategories);
      return [{ name, type: item.type === 'income' ? 'income' as const : 'expense' as const, ...(subcategories.length ? { subcategories } : {}) }];
    })
    : [];
  const events = Array.isArray(value.events)
    ? value.events.slice(0, SCHEMA_LIMITS.events).flatMap((item) => {
      if (!isRecord(item)) return [];
      const name = cleanText(item.name, LIMITS.name);
      if (!name) return [];
      return [{ name, ...(isIsoDate(item.from) ? { from: item.from } : {}), ...(isIsoDate(item.to) ? { to: item.to } : {}) }];
    })
    : [];
  return {
    today: value.today,
    language: value.language === 'sr' ? 'sr' : 'en',
    currency,
    categories,
    accounts: nameList(value.accounts, SCHEMA_LIMITS.accounts),
    people: nameList(value.people, SCHEMA_LIMITS.people),
    events,
    merchants: nameList(value.merchants, SCHEMA_LIMITS.merchants),
    teams: nameList(value.teams, SCHEMA_LIMITS.teams),
  };
};
