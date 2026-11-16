import type { Person, Transaction } from '../types';

const DAY_MS = 86_400_000;
/** A bill from three months ago counts half as much as one from today. */
const HALF_LIFE_DAYS = 90;

export interface SplitSuggestionInput {
  transactions: readonly Transaction[];
  people: readonly Person[];
  /** The user's own person id (`userProfile.id`); never suggested. */
  selfId?: string;
  /** People of the event the entry belongs to; they come first. */
  eventPersonIds?: readonly string[];
  limit?: number;
  now?: Date;
}

/** Who was on an entry as someone you split with or paid for. */
const peopleOn = (transaction: Transaction): string[] => {
  const shares = transaction.splitDetails?.shares;
  if (shares && shares.length > 0) return shares.map(share => share.personId);
  return transaction.type === 'expense' && transaction.personId ? [transaction.personId] : [];
};

/**
 * People to offer as one-tap chips when splitting a bill: the entry's event people first, then
 * whoever was on your recent split bills (more often and more recently ranks higher), then the
 * rest by name so there is always someone to pick.
 */
export function suggestSplitPeople({
  transactions,
  people,
  selfId,
  eventPersonIds = [],
  limit = 4,
  now = new Date(),
}: SplitSuggestionInput): Person[] {
  const byId = new Map(people.map(person => [person.id, person]));
  const eligible = (id: string) => id !== selfId && byId.has(id);
  const scores = new Map<string, { weight: number; last: number }>();
  const nowMs = now.getTime();

  for (const transaction of transactions) {
    const ids = peopleOn(transaction).filter(eligible);
    if (ids.length === 0) continue;
    const time = Date.parse(transaction.date);
    if (!Number.isFinite(time)) continue;
    const weight = 0.5 ** (Math.max(0, nowMs - time) / DAY_MS / HALF_LIFE_DAYS);
    for (const id of new Set(ids)) {
      const score = scores.get(id) ?? { weight: 0, last: -Infinity };
      score.weight += weight;
      score.last = Math.max(score.last, time);
      scores.set(id, score);
    }
  }

  const result: Person[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (result.length >= limit || seen.has(id) || !eligible(id)) return;
    seen.add(id);
    result.push(byId.get(id)!);
  };
  const byName = (a: string, b: string) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '');

  eventPersonIds.forEach(add);
  [...scores.entries()]
    .sort(([a, left], [b, right]) => right.weight - left.weight || right.last - left.last || byName(a, b))
    .forEach(([id]) => add(id));
  [...byId.keys()].sort(byName).forEach(add);
  return result;
}
