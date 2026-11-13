import type { AppState, Currency, Transaction } from '../types';
import { convertAmount } from '../services/currencyService';
import { getCountedExpenseAmount, getCountedIncomeAmount, isCountedExpense, isCountedIncome, isTransferTransaction } from './money';
import { spendingExpenses } from './settle';
import { BALANCE_CURRENCIES, getTransactionBalanceEffects } from './balances';
import { containsWords, merchantMemoryFor, merchantTokens, normalizeMerchant } from './merchantMemory';
import {
  LIMITS,
  SCHEMA_LIMITS,
  sanitizeResultTable,
  type AskSchema,
  type DateRange,
  type HistoryTurn,
  type QueryGroup,
  type QueryPlan,
  type ResultRow,
  type ResultTable,
} from '../utils/financeQueryPlan';

export * from '../utils/financeQueryPlan';

/**
 * "Ask your finances" executor. Runs a validated QueryPlan against local AppState, so every
 * number is exact, uses the same money rules as the rest of the app and works offline.
 * Its output (ResultTable) holds labels and aggregates only; raw transactions never leave.
 */

type QueryState = Pick<
  AppState,
  'transactions' | 'categories' | 'accounts' | 'people' | 'userProfile' | 'baseCurrency' | 'rates' | 'events' | 'sharedExpenses' | 'recurringTransactions' | 'teams'
>;

/** Localized labels for facts that have no group value. */
export interface QueryLabels {
  uncategorized: string;
  noPerson: string;
  noMerchant: string;
  noEvent: string;
  noAccount: string;
  me: string;
}

export const DEFAULT_QUERY_LABELS: QueryLabels = {
  uncategorized: 'Uncategorized',
  noPerson: 'No person',
  noMerchant: 'No shop',
  noEvent: 'No event',
  noAccount: 'No account',
  me: 'Me',
};

export interface QueryExplain {
  /** Facts that matched the filters in the range (and in the comparison period). */
  matched: number;
  compareMatched?: number;
  resolved: { categories: string[]; accounts: string[]; people: string[]; events: string[]; team?: string };
  currency: Currency;
  ratesDate: string;
  /** Merchants counted as repeating when `recurring` is on. */
  repeatingMerchants?: number;
}

export interface QueryExecution {
  table: ResultTable;
  explain: QueryExplain;
}

// ---------------------------------------------------------------------------
// Helpers

/** Case, accent and đ insensitive comparison key. */
export const foldName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'dj')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const pad = (value: number): string => String(value).padStart(2, '0');

/** Local calendar day of an ISO timestamp; a bare YYYY-MM-DD is kept as is. */
export const dayKey = (iso: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const todayKey = (now = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const parseDay = (day: string): Date => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
};

const formatDay = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Monday of the ISO week containing `day`. */
export const weekKey = (day: string): string => {
  const date = parseDay(day);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return formatDay(date);
};

const inRange = (day: string, range: DateRange | undefined): boolean =>
  Boolean(day) && (!range || (day >= range.from && day <= range.to));

const round2 = (value: number): number => Math.round(value * 100) / 100;

interface Candidate {
  id: string;
  name: string;
}

/** Exact folded name first, then a containment match (3+ letters) as a fallback. */
const resolveNames = (wanted: string[], candidates: Candidate[], unresolved: string[]): Candidate[] => {
  const found: Candidate[] = [];
  for (const name of wanted) {
    const key = foldName(name);
    let matches = candidates.filter((candidate) => foldName(candidate.name) === key);
    if (matches.length === 0 && key.length >= 3) {
      matches = candidates.filter((candidate) => {
        const folded = foldName(candidate.name);
        return folded.length >= 3 && (folded.includes(key) || key.includes(folded));
      });
    }
    if (matches.length === 0) unresolved.push(name);
    matches.forEach((match) => {
      if (!found.some((existing) => existing.id === match.id)) found.push(match);
    });
  }
  return found;
};

// ---------------------------------------------------------------------------
// Facts: one per counted amount, already in the base currency.

interface Fact {
  day: string;
  value: number;
  categoryKey: string;
  categoryLabel: string;
  subcategory?: string;
  accountId?: string;
  personIds: string[];
  personGroup?: { key: string; label: string };
  eventId?: string;
  merchantKey: string;
  merchantLabel: string;
  teamId: string | null;
}

const merchantSource = (transaction: Transaction): string =>
  transaction.receiptData?.merchant?.trim() || transaction.note?.trim() || '';

const AUTO_PREFIX = '[Auto] ';

/** Merchants that charge again and again: 3+ distinct months, or set up as recurring. */
const repeatingMerchantKeys = (state: QueryState): Set<string> => {
  const months = new Map<string, Set<string>>();
  for (const transaction of state.transactions) {
    if (transaction.type !== 'expense' || isTransferTransaction(transaction)) continue;
    const key = normalizeMerchant(merchantSource(transaction).replace(AUTO_PREFIX, ''));
    if (key.length < 3) continue;
    const month = dayKey(transaction.date).slice(0, 7);
    const seen = months.get(key) ?? new Set<string>();
    seen.add(month);
    months.set(key, seen);
  }
  const keys = new Set<string>();
  months.forEach((seen, key) => {
    if (seen.size >= 3) keys.add(key);
  });
  for (const recurring of state.recurringTransactions ?? []) {
    if (recurring.type !== 'expense') continue;
    [recurring.name, recurring.note].forEach((text) => {
      const key = normalizeMerchant(text);
      if (key.length >= 3) keys.add(key);
    });
  }
  return keys;
};

const shareOfExpense = (
  expense: { amount: number; sharedWith: string[]; splitType?: string; splitDetails?: Record<string, number> },
  selfIds: Set<string>,
): number => {
  const self = expense.sharedWith.find((id) => selfIds.has(id));
  if (!self) return 0;
  if (expense.splitType === 'exact' && expense.splitDetails) return expense.splitDetails[self] || 0;
  return expense.sharedWith.length > 0 ? expense.amount / expense.sharedWith.length : 0;
};

const buildFacts = (state: QueryState, plan: QueryPlan, labels: QueryLabels): Fact[] => {
  const base = state.baseCurrency;
  const rates = state.rates;
  const categories = new Map(state.categories.map((category) => [category.id, category]));
  const people = new Map(state.people.map((person) => [person.id, person.name]));
  const selfIds = new Set([state.userProfile?.id, 'self'].filter((id): id is string => Boolean(id)));
  const selfName = state.userProfile?.name?.trim() || labels.me;
  const memory = merchantMemoryFor(state.transactions);
  const personName = (id: string): string => (selfIds.has(id) ? selfName : people.get(id) ?? labels.noPerson);

  const merchantOf = (source: string): { key: string; label: string } => {
    const cleaned = source.replace(AUTO_PREFIX, '').trim();
    const key = normalizeMerchant(cleaned);
    if (key.length < 3) {
      return cleaned ? { key: `raw:${foldName(cleaned)}`, label: cleaned } : { key: '', label: labels.noMerchant };
    }
    return { key, label: memory.entries.get(key)?.label.replace(AUTO_PREFIX, '') || cleaned };
  };

  if (plan.dataset === 'eventExpenses') {
    const facts: Fact[] = [];
    const events = new Map(state.events.map((event) => [event.id, event]));
    for (const expense of spendingExpenses(state.sharedExpenses ?? [])) {
      const event = events.get(expense.eventId);
      if (!event) continue;
      const amount = plan.share === 'mine' ? shareOfExpense(expense, selfIds) : expense.amount;
      if (!amount) continue;
      const merchant = merchantOf(expense.name ?? '');
      const category = expense.category?.trim();
      facts.push({
        day: dayKey(expense.date),
        value: convertAmount(amount, expense.currency, base, rates),
        categoryKey: category ? `name:${foldName(category)}` : '',
        categoryLabel: category || labels.uncategorized,
        personIds: [expense.paidBy, ...expense.sharedWith],
        personGroup: { key: expense.paidBy, label: personName(expense.paidBy) },
        eventId: event.id,
        merchantKey: merchant.key,
        merchantLabel: merchant.label,
        teamId: event.teamId ?? null,
      });
    }
    for (const transaction of state.transactions) {
      if (!transaction.eventId || !events.has(transaction.eventId) || !isCountedExpense(transaction)) continue;
      const value = plan.share === 'mine'
        ? getCountedExpenseAmount(transaction, base, rates)
        : convertAmount(transaction.splitDetails?.totalAmount || transaction.amount, transaction.currency, base, rates);
      const category = categories.get(transaction.categoryId);
      const merchant = merchantOf(merchantSource(transaction));
      const selfId = state.userProfile?.id || 'self';
      facts.push({
        day: dayKey(transaction.date),
        value,
        categoryKey: category ? `name:${foldName(category.name)}` : '',
        categoryLabel: category?.name ?? labels.uncategorized,
        subcategory: transaction.subcategory,
        accountId: transaction.accountId,
        personIds: [selfId, ...(transaction.personId ? [transaction.personId] : []), ...(transaction.splitDetails?.shares.map((share) => share.personId) ?? [])],
        personGroup: { key: selfId, label: selfName },
        eventId: transaction.eventId,
        merchantKey: merchant.key,
        merchantLabel: merchant.label,
        teamId: events.get(transaction.eventId)?.teamId ?? null,
      });
    }
    return facts;
  }

  const facts: Fact[] = [];
  for (const transaction of state.transactions) {
    const expense = isCountedExpense(transaction);
    const income = isCountedIncome(transaction);
    let value: number;
    if (plan.type === 'expense') {
      if (!expense) continue;
      value = getCountedExpenseAmount(transaction, base, rates);
    } else if (plan.type === 'income') {
      if (!income) continue;
      value = getCountedIncomeAmount(transaction, base, rates);
    } else {
      if (!expense && !income) continue;
      value = expense ? -getCountedExpenseAmount(transaction, base, rates) : getCountedIncomeAmount(transaction, base, rates);
    }
    const category = categories.get(transaction.categoryId);
    const merchant = merchantOf(merchantSource(transaction));
    const sharePeople = transaction.splitDetails?.shares.map((share) => share.personId).filter(Boolean) ?? [];
    const personIds = [...(transaction.personId ? [transaction.personId] : []), ...sharePeople];
    const groupIds = transaction.personId ? [transaction.personId] : sharePeople;
    facts.push({
      day: dayKey(transaction.date),
      value,
      categoryKey: category ? category.id : '',
      categoryLabel: category?.name ?? labels.uncategorized,
      subcategory: transaction.subcategory,
      accountId: transaction.accountId,
      personIds,
      ...(groupIds.length > 0
        ? { personGroup: { key: groupIds.join(','), label: groupIds.map(personName).join(', ') } }
        : {}),
      eventId: transaction.eventId,
      merchantKey: merchant.key,
      merchantLabel: merchant.label,
      teamId: transaction.teamId ?? null,
    });
  }
  return facts;
};

// ---------------------------------------------------------------------------
// Filters

interface ResolvedFilters {
  categoryKeys: Set<string> | null;
  subcategories: Array<{ categoryKey: string; sub: string }>;
  accountIds: Set<string> | null;
  personIds: Set<string> | null;
  eventIds: Set<string> | null;
  teamId: string | null | undefined;
  merchantWords: string[] | null;
  merchantText: string | null;
  repeating: Set<string> | null;
  resolved: QueryExplain['resolved'];
  unresolved: string[];
}

const resolveFilters = (state: QueryState, plan: QueryPlan): ResolvedFilters => {
  const unresolved: string[] = [];
  const eventDataset = plan.dataset === 'eventExpenses';

  let categoryKeys: Set<string> | null = null;
  const subcategories: ResolvedFilters['subcategories'] = [];
  const resolvedCategories: string[] = [];
  if (plan.categories.length > 0) {
    categoryKeys = new Set();
    // Event expenses carry a free-text category; match those names too.
    const eventCategoryNames = eventDataset
      ? [...new Set((state.sharedExpenses ?? []).map((expense) => expense.category?.trim()).filter((name): name is string => Boolean(name)))]
      : [];
    const keyFor = (id: string, name: string): string => (eventDataset ? `name:${foldName(name)}` : id);
    for (const name of plan.categories) {
      const local: string[] = [];
      const matches = resolveNames([name], [
        ...state.categories.map((category) => ({ id: category.id, name: category.name })),
        ...eventCategoryNames.map((label) => ({ id: `name:${foldName(label)}`, name: label })),
      ], local);
      if (matches.length > 0) {
        matches.forEach((match) => {
          categoryKeys!.add(match.id.startsWith('name:') ? match.id : keyFor(match.id, match.name));
          resolvedCategories.push(match.name);
        });
        continue;
      }
      // A subcategory name ("Groceries") narrows to that subcategory of its parent.
      const key = foldName(name);
      const parents = state.categories.filter((category) => category.subcategories.some((sub) => foldName(sub) === key));
      if (parents.length === 0) {
        unresolved.push(name);
        continue;
      }
      parents.forEach((parent) => {
        const sub = parent.subcategories.find((item) => foldName(item) === key)!;
        subcategories.push({ categoryKey: keyFor(parent.id, parent.name), sub: foldName(sub) });
        resolvedCategories.push(`${parent.name} / ${sub}`);
      });
    }
  }

  const accounts = resolveNames(plan.accounts, state.accounts.map(({ id, name }) => ({ id, name })), unresolved);
  const selfProfile = state.userProfile ? [{ id: state.userProfile.id, name: state.userProfile.name }] : [];
  const people = resolveNames(plan.people, [...state.people.map(({ id, name }) => ({ id, name })), ...selfProfile], unresolved);
  const events = resolveNames(plan.events, state.events.map(({ id, name }) => ({ id, name })), unresolved);

  let teamId: string | null | undefined;
  let teamLabel: string | undefined;
  if (plan.team) {
    const folded = foldName(plan.team);
    if (['personal', 'licno', 'licni', 'moje', 'mine', 'private', 'privatno'].includes(folded)) {
      teamId = null;
      teamLabel = plan.team;
    } else {
      const teams = resolveNames([plan.team], (state.teams ?? []).map(({ id, name }) => ({ id, name })), unresolved);
      if (teams[0]) {
        teamId = teams[0].id;
        teamLabel = teams[0].name;
      }
    }
  }

  const merchantWords = plan.merchant ? merchantTokens(plan.merchant) : null;

  return {
    categoryKeys: plan.categories.length > 0 && categoryKeys ? categoryKeys : null,
    subcategories,
    accountIds: plan.accounts.length > 0 ? new Set(accounts.map((item) => item.id)) : null,
    personIds: plan.people.length > 0 ? new Set(people.map((item) => item.id)) : null,
    eventIds: plan.events.length > 0 ? new Set(events.map((item) => item.id)) : null,
    teamId,
    merchantWords: merchantWords && merchantWords.length > 0 ? merchantWords : null,
    merchantText: plan.merchant ? foldName(plan.merchant) : null,
    repeating: plan.recurring ? repeatingMerchantKeys(state) : null,
    resolved: {
      categories: resolvedCategories,
      accounts: accounts.map((item) => item.name),
      people: people.map((item) => item.name),
      events: events.map((item) => item.name),
      ...(teamLabel ? { team: teamLabel } : {}),
    },
    unresolved,
  };
};

const matchesFilters = (fact: Fact, filters: ResolvedFilters): boolean => {
  if (filters.categoryKeys || filters.subcategories.length > 0) {
    const byCategory = filters.categoryKeys?.has(fact.categoryKey) ?? false;
    const bySub = filters.subcategories.some(
      (item) => item.categoryKey === fact.categoryKey && fact.subcategory !== undefined && foldName(fact.subcategory) === item.sub,
    );
    if (!byCategory && !bySub) return false;
  }
  if (filters.accountIds && (!fact.accountId || !filters.accountIds.has(fact.accountId))) return false;
  if (filters.personIds && !fact.personIds.some((id) => filters.personIds!.has(id))) return false;
  if (filters.eventIds && (!fact.eventId || !filters.eventIds.has(fact.eventId))) return false;
  if (filters.teamId !== undefined && fact.teamId !== filters.teamId) return false;
  if (filters.merchantWords) {
    if (!containsWords(merchantTokens(fact.merchantLabel), filters.merchantWords)) return false;
  } else if (filters.merchantText && !foldName(fact.merchantLabel).includes(filters.merchantText)) {
    return false;
  }
  if (filters.repeating && !filters.repeating.has(fact.merchantKey)) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Aggregation

interface Group {
  key: string;
  label: string;
  sum: number;
  count: number;
}

const groupOf = (fact: Fact, groupBy: QueryGroup, state: QueryState, labels: QueryLabels): { key: string; label: string } => {
  switch (groupBy) {
    case 'category':
      return { key: fact.categoryKey || '_', label: fact.categoryLabel };
    case 'month':
      return { key: fact.day.slice(0, 7), label: fact.day.slice(0, 7) };
    case 'week': {
      const week = weekKey(fact.day);
      return { key: week, label: week };
    }
    case 'merchant':
      return { key: fact.merchantKey || '_', label: fact.merchantLabel };
    case 'person':
      return fact.personGroup ?? { key: '_', label: labels.noPerson };
    case 'event': {
      const event = fact.eventId ? state.events.find((item) => item.id === fact.eventId) : undefined;
      return event ? { key: event.id, label: event.name } : { key: '_', label: labels.noEvent };
    }
    case 'account': {
      const account = fact.accountId ? state.accounts.find((item) => item.id === fact.accountId) : undefined;
      return account ? { key: account.id, label: account.name } : { key: '_', label: labels.noAccount };
    }
    default:
      return { key: 'all', label: 'all' };
  }
};

const aggregate = (facts: Fact[], groupBy: QueryGroup, state: QueryState, labels: QueryLabels): Map<string, Group> => {
  const groups = new Map<string, Group>();
  for (const fact of facts) {
    const { key, label } = groupOf(fact, groupBy, state, labels);
    const group = groups.get(key) ?? { key, label, sum: 0, count: 0 };
    group.sum += fact.value;
    group.count += 1;
    groups.set(key, group);
  }
  return groups;
};

const metricValue = (metric: QueryPlan['metric'], sum: number, count: number): number => {
  if (metric === 'count') return count;
  if (metric === 'avg') return count > 0 ? sum / count : 0;
  return sum;
};

/** Every month or week key from `from` to `to` (capped at today), when the series is short enough. */
const periodKeys = (groupBy: 'month' | 'week', range: DateRange, today: string): string[] => {
  const end = range.to < today ? range.to : today;
  if (range.from > end) return [];
  const keys: string[] = [];
  if (groupBy === 'month') {
    let year = Number(range.from.slice(0, 4));
    let month = Number(range.from.slice(5, 7));
    const last = end.slice(0, 7);
    for (;;) {
      const key = `${year}-${pad(month)}`;
      if (key > last || keys.length > 36) break;
      keys.push(key);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return keys.length > 36 ? [] : keys;
  }
  const cursor = parseDay(weekKey(range.from));
  const last = weekKey(end);
  while (formatDay(cursor) <= last && keys.length <= 30) {
    keys.push(formatDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return keys.length > 30 ? [] : keys;
};

const executeBalances = (state: QueryState, plan: QueryPlan, filters: ResolvedFilters): { rows: ResultRow[]; matched: number } => {
  const base = state.baseCurrency;
  const selfIds = new Set([state.userProfile?.id, 'self'].filter(Boolean));
  const people = state.people.filter((person) => !selfIds.has(person.id) && (!filters.personIds || filters.personIds.has(person.id)));
  const end = plan.range?.to;
  const rows: ResultRow[] = [];
  let matched = 0;
  for (const person of people) {
    const cents: Record<Currency, number> = { EUR: 0, USD: 0, RSD: 0 };
    BALANCE_CURRENCIES.forEach((currency) => {
      cents[currency] = Math.round((person.balances?.[currency] ?? 0) * 100);
    });
    let lent = 0;
    let repaid = 0;
    let count = 0;
    for (const transaction of state.transactions) {
      const day = dayKey(transaction.date);
      for (const effect of getTransactionBalanceEffects(transaction)) {
        if (effect.personId !== person.id) continue;
        if (!end || day <= end) cents[effect.currency] += Math.round(effect.delta * 100);
        if (inRange(day, plan.range)) {
          const converted = convertAmount(Math.abs(effect.delta), effect.currency, base, state.rates);
          if (effect.delta > 0) lent += converted;
          else repaid += converted;
          count += 1;
        }
      }
    }
    const balance = BALANCE_CURRENCIES.reduce(
      (sum, currency) => sum + convertAmount(cents[currency] / 100, currency, base, state.rates),
      0,
    );
    if (filters.personIds || Math.abs(balance) >= 0.005 || count > 0) {
      matched += count;
      rows.push({ label: person.name, value: round2(balance), count, lent: round2(lent), repaid: round2(repaid) });
    }
  }
  return { rows, matched };
};

/** Runs a validated plan. `today` is injectable for tests. */
export const executeQueryPlan = (
  state: QueryState,
  plan: QueryPlan,
  options: { labels?: QueryLabels; today?: string } = {},
): QueryExecution => {
  const labels = options.labels ?? DEFAULT_QUERY_LABELS;
  const today = options.today ?? todayKey();
  const filters = resolveFilters(state, plan);
  const explainBase = {
    resolved: filters.resolved,
    currency: state.baseCurrency,
    ratesDate: state.rates.date,
    ...(filters.repeating ? { repeatingMerchants: filters.repeating.size } : {}),
  };
  const tableBase = {
    dataset: plan.dataset,
    type: plan.type,
    metric: plan.metric,
    groupBy: plan.groupBy,
    ...(plan.dataset === 'eventExpenses' ? { share: plan.share } : {}),
    currency: state.baseCurrency,
    ...(plan.range ? { range: plan.range } : {}),
    unresolved: filters.unresolved,
  };

  if (plan.dataset === 'balances') {
    const { rows, matched } = executeBalances(state, plan, filters);
    rows.sort((left, right) => (plan.sort === 'asc' ? left.value - right.value : right.value - left.value));
    const kept = rows.slice(0, plan.limit);
    const rest = rows.slice(plan.limit);
    const table: ResultTable = {
      ...tableBase,
      groupBy: 'person',
      total: round2(rows.reduce((sum, row) => sum + row.value, 0)),
      count: rows.length,
      rows: kept,
      ...(rest.length > 0
        ? { other: { groups: rest.length, value: round2(rest.reduce((sum, row) => sum + row.value, 0)), count: rest.reduce((sum, row) => sum + row.count, 0) } }
        : {}),
    };
    return { table, explain: { ...explainBase, matched } };
  }

  const all = buildFacts(state, plan, labels).filter((fact) => fact.day && matchesFilters(fact, filters));
  const current = all.filter((fact) => inRange(fact.day, plan.range));
  const previous = plan.compare ? all.filter((fact) => inRange(fact.day, plan.compare)) : [];

  const sum = current.reduce((total, fact) => total + fact.value, 0);
  const total = metricValue(plan.metric, sum, current.length);
  const compareSum = previous.reduce((acc, fact) => acc + fact.value, 0);
  const compareTotal = plan.compare ? metricValue(plan.metric, compareSum, previous.length) : undefined;

  let rows: ResultRow[] = [];
  let other: ResultTable['other'];
  let perPeriodAverage: number | undefined;
  if (plan.groupBy !== 'none') {
    const groups = aggregate(current, plan.groupBy, state, labels);
    const compareGroups = plan.compare ? aggregate(previous, plan.groupBy, state, labels) : null;
    const timeSeries = plan.groupBy === 'month' || plan.groupBy === 'week';

    if (timeSeries) {
      const first = current.reduce((min, fact) => (fact.day < min ? fact.day : min), today);
      const keys = periodKeys(plan.groupBy as 'month' | 'week', plan.range ?? { from: first, to: today }, today);
      keys.forEach((key) => {
        if (!groups.has(key)) groups.set(key, { key, label: key, sum: 0, count: 0 });
      });
    }

    let list = [...groups.values()].map((group) => ({
      group,
      value: metricValue(plan.metric, group.sum, group.count),
    }));
    if (plan.sort === 'chrono') {
      list.sort((left, right) => left.group.key.localeCompare(right.group.key));
    } else {
      list.sort((left, right) => (plan.sort === 'asc' ? left.value - right.value : right.value - left.value));
    }

    if (timeSeries) {
      if (plan.sort === 'chrono') list = list.slice(-LIMITS.rows);
      else list = list.slice(0, Math.min(LIMITS.rows, Math.max(plan.limit, 12)));
      const series = [...groups.values()];
      perPeriodAverage = series.length > 0
        ? round2(series.reduce((acc, group) => acc + metricValue(plan.metric, group.sum, group.count), 0) / series.length)
        : undefined;
    } else {
      const rest = list.slice(plan.limit);
      list = list.slice(0, plan.limit);
      if (rest.length > 0) {
        const restSum = rest.reduce((acc, item) => acc + item.group.sum, 0);
        const restCount = rest.reduce((acc, item) => acc + item.group.count, 0);
        other = { groups: rest.length, value: round2(metricValue(plan.metric, restSum, restCount)), count: restCount };
      }
    }

    rows = list.map(({ group, value }) => {
      const compared = compareGroups && !timeSeries ? compareGroups.get(group.key) : undefined;
      return {
        label: group.label,
        value: round2(value),
        count: group.count,
        ...(compareGroups && !timeSeries
          ? { compareValue: round2(compared ? metricValue(plan.metric, compared.sum, compared.count) : 0) }
          : {}),
      };
    });
  }

  const table: ResultTable = {
    ...tableBase,
    ...(plan.compare ? { compare: plan.compare } : {}),
    total: round2(total),
    count: current.length,
    ...(compareTotal !== undefined ? { compareTotal: round2(compareTotal), compareCount: previous.length } : {}),
    ...(compareTotal !== undefined && compareTotal !== 0
      ? { changePct: round2(((total - compareTotal) / Math.abs(compareTotal)) * 100) }
      : {}),
    ...(perPeriodAverage !== undefined ? { perPeriodAverage } : {}),
    rows,
    ...(other ? { other } : {}),
  };
  return {
    table,
    explain: { ...explainBase, matched: current.length, ...(plan.compare ? { compareMatched: previous.length } : {}) },
  };
};

// ---------------------------------------------------------------------------
// Payloads for the edge function. Names and aggregates only.

/** Names the planner can refer to: categories, accounts, people, events, teams and repeat merchants. */
export const buildAskSchema = (state: QueryState, language: 'en' | 'sr', today = todayKey()): AskSchema => {
  // Shops seen at least twice: one-off notes ("lunch for Alex") are personal text, not merchants.
  const merchants = [...merchantMemoryFor(state.transactions).entries.values()]
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count || right.lastTime - left.lastTime)
    .slice(0, SCHEMA_LIMITS.merchants)
    .map((entry) => entry.label.replace(AUTO_PREFIX, '').slice(0, LIMITS.name));
  const events = [...state.events]
    .sort((left, right) => (right.startDate ?? '').localeCompare(left.startDate ?? ''))
    .slice(0, SCHEMA_LIMITS.events)
    .map((event) => ({
      name: event.name,
      ...(event.startDate ? { from: dayKey(event.startDate) } : {}),
      ...(event.endDate ? { to: dayKey(event.endDate) } : {}),
    }));
  return {
    today,
    language,
    currency: state.baseCurrency,
    categories: state.categories.slice(0, SCHEMA_LIMITS.categories).map((category) => ({
      name: category.name,
      type: category.type,
      ...(category.subcategories.length > 0 ? { subcategories: category.subcategories.slice(0, SCHEMA_LIMITS.subcategories) } : {}),
    })),
    accounts: state.accounts.slice(0, SCHEMA_LIMITS.accounts).map((account) => account.name),
    people: state.people
      .filter((person) => person.id !== state.userProfile?.id)
      .slice(0, SCHEMA_LIMITS.people)
      .map((person) => person.name),
    events,
    merchants,
    teams: (state.teams ?? []).slice(0, SCHEMA_LIMITS.teams).map((team) => team.name),
  };
};

export interface PlanRequestBody {
  mode: 'plan';
  question: string;
  schema: AskSchema;
  history: HistoryTurn[];
}

export interface AnswerRequestBody {
  mode: 'answer';
  question: string;
  title: string;
  language: 'en' | 'sr';
  token: string;
  result: ResultTable;
}

export const buildPlanRequest = (question: string, schema: AskSchema, history: HistoryTurn[]): PlanRequestBody => ({
  mode: 'plan',
  question: question.trim().slice(0, LIMITS.question),
  schema,
  history: history.slice(-LIMITS.history).map((turn) => ({ question: turn.question, plan: turn.plan })),
});

export const buildAnswerRequest = (
  question: string,
  title: string,
  language: 'en' | 'sr',
  token: string,
  table: ResultTable,
): AnswerRequestBody => {
  const sanitized = sanitizeResultTable(table);
  if (!sanitized.ok) throw new Error(`result table rejected: ${sanitized.error}`);
  return {
    mode: 'answer',
    question: question.trim().slice(0, LIMITS.question),
    title: title.slice(0, LIMITS.title),
    language,
    token,
    result: sanitized.value,
  };
};
