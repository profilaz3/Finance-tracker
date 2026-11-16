import type { AppState } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { selectPeopleWithBalances } from '../../domain/balances';

type Strings = (typeof TRANSLATIONS)['en'];

/** Questions to start with: this month, the latest event, subscriptions, and who owes what. */
export const askSuggestions = (state: Pick<AppState, 'events' | 'people' | 'transactions' | 'userProfile'>, t: Strings): string[] => {
  const list: string[] = [t.askSuggestMonth, t.askSuggestAutumn, t.askSuggestSubs];
  const event = [...state.events].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
  if (event) list.splice(1, 0, t.askSuggestEvent.replace('{event}', event.name));
  const owing = selectPeopleWithBalances(state.people, state.transactions)
    .find(person => person.id !== state.userProfile?.id && Object.values(person.balances).some(value => value > 0));
  list.push(owing ? t.askSuggestPerson.replace('{name}', owing.name) : t.askSuggestOwe);
  return list;
};
