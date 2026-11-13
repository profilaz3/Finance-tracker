import type { AppLanguage } from '../../utils/locale';
import type { Currency } from '../../types';
import { formatDate, formatMediumDate, formatNumber, formatShortDate } from '../../utils/locale';
import { money } from '../home/parts';
import type { DateRange, QueryGroup, ResultTable } from '../../domain/financeQuery';
import { TRANSLATIONS } from '../../constants';

type Strings = (typeof TRANSLATIONS)['en'];

const OPEN_START = '2000-01-01';
const OPEN_END = '2100-12-31';

const noon = (day: string): Date => new Date(`${day}T12:00:00`);

export const formatAskValue = (value: number, table: Pick<ResultTable, 'metric' | 'currency'>, language: AppLanguage): string =>
  table.metric === 'count'
    ? formatNumber(value, { maximumFractionDigits: 0 }, language)
    : money(value, table.currency as Currency, language);

export const formatAskRange = (range: DateRange | undefined, language: AppLanguage, t: Strings): string => {
  if (!range || (range.from <= OPEN_START && range.to >= OPEN_END)) return t.askAllTime;
  if (range.from <= OPEN_START) return t.askUpTo.replace('{date}', formatMediumDate(noon(range.to), language));
  if (range.from === range.to) return formatMediumDate(noon(range.from), language);
  const end = range.to >= OPEN_END ? '' : formatMediumDate(noon(range.to), language);
  return `${formatMediumDate(noon(range.from), language)} - ${end}`.trim();
};

/** Month and week keys become readable labels; other labels pass through. */
/** `monthOnly` drops the year, for chart axes where every month is in the same year. */
export const formatGroupLabel = (label: string, groupBy: QueryGroup, language: AppLanguage, monthOnly = false): string => {
  if (groupBy === 'month' && /^\d{4}-\d{2}$/.test(label)) {
    return formatDate(noon(`${label}-01`), monthOnly ? { month: 'short' } : { month: 'short', year: '2-digit' }, language);
  }
  if (groupBy === 'week' && /^\d{4}-\d{2}-\d{2}$/.test(label)) return formatShortDate(noon(label), language);
  return label;
};

export const groupName = (groupBy: QueryGroup, t: Strings): string | null => {
  switch (groupBy) {
    case 'category': return t.askGroupCategory;
    case 'month': return t.askGroupMonth;
    case 'week': return t.askGroupWeek;
    case 'merchant': return t.askGroupMerchant;
    case 'person': return t.askGroupPerson;
    case 'event': return t.askGroupEvent;
    case 'account': return t.askGroupAccount;
    default: return null;
  }
};
