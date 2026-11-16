import React, { useMemo } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { AppState } from '../../types';
import { formatNumber, formatPercent, formatShortDate, type AppLanguage } from '../../utils/locale';
import { belgradeToday, type NbsCurrency } from '../../utils/nbsRates';
import { pointsSince, rangeStart, rangeStats, rsdPer } from '../../domain/exchangeRates';
import { Sparkline } from '../ui/Sparkline';
import { CurrencyFlag } from '../ui/CurrencyFlag';
import { fill } from '../home/parts';
import { openRates } from './ratesBus';
import { useNbsHistory } from './useNbsHistory';
import { RATES_STRINGS } from './ratesStrings';

const PAIRS: NbsCurrency[] = ['EUR', 'USD'];
const MINUS = '−';

const formatRate = (value: number, language: AppLanguage) =>
  formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 }, language);

/**
 * Settings > Language and currency: today's EUR and USD rates with the past month as a sparkline.
 * Tapping it opens the Exchange rates sheet. Numbers come from the app's rate table until the
 * NBS history has loaded.
 */
export const RatesCard: React.FC<{ state: Pick<AppState, 'language' | 'rates'> }> = ({ state }) => {
  const language = state.language;
  const s = RATES_STRINGS[language];
  const from = rangeStart(belgradeToday(), '1M');
  const { history } = useNbsHistory(from);

  const rows = useMemo(
    () => PAIRS.map((currency) => {
      const points = history ? pointsSince(history.series[currency], from) : [];
      const stats = rangeStats(points);
      const value = history?.latest?.rates[currency] ?? stats?.current ?? rsdPer(state.rates, currency);
      return { currency, points, stats, value };
    }),
    [history, from, state.rates],
  );

  const listDate = history?.latest?.listDate ?? rows[0].stats?.currentDate ?? (state.rates.provider === 'nbs' ? state.rates.listDate : undefined);
  const subtitle = listDate
    ? fill(s.middleRate, { date: formatShortDate(new Date(`${listDate}T12:00:00`), language) })
    : fill(s.marketRate, { date: formatShortDate(new Date(state.rates.date), language) });
  const anyTrend = rows.some((row) => row.points.length > 1);

  return (
    <button type="button" onClick={openRates} className="paper-tile flex w-full flex-col p-4 text-left transition-colors hover:bg-chip/40">
      <span className="flex w-full items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">{s.title}</span>
          <span className="block truncate text-[13px] text-muted">{subtitle}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
      </span>

      <span className="mt-2 flex w-full flex-col divide-y divide-[var(--paper-line)]">
        {rows.map(({ currency, points, stats, value }) => {
          const pct = stats?.rangeChangePct ?? 0;
          const flat = Math.abs(pct) < 0.005;
          return (
            <span key={currency} className="flex h-[52px] items-center gap-3">
              <CurrencyFlag currency={currency} size={26} />
              <span className="w-9 shrink-0 text-[14px] font-semibold text-muted">{currency}</span>
              <span className="shrink-0 text-[17px] font-bold tabular-nums">
                {value > 0 ? formatRate(value, language) : '…'}{' '}
                <span className="text-[12px] font-semibold text-muted">RSD</span>
              </span>
              <span className="flex min-w-0 flex-1 justify-end" aria-hidden="true">
                {points.length > 1 && <Sparkline className="max-w-[150px]" values={points.map(([, rate]) => rate)} height={28} area={false} />}
              </span>
              {stats && points.length > 1 && (
                <span className={clsx('w-[64px] shrink-0 text-right text-[13px] font-semibold tabular-nums', flat ? 'text-muted' : 'text-accent')}>
                  {flat ? s.unchanged : `${pct > 0 ? '+' : MINUS}${formatPercent(Math.abs(pct), 2, language)}`}
                </span>
              )}
            </span>
          );
        })}
      </span>
      {anyTrend && <span className="mt-1 self-end text-[11px] font-medium text-muted">{s.pastMonth}</span>}
    </button>
  );
};
