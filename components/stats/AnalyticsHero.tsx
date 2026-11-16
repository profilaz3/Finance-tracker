import React from 'react';
import clsx from 'clsx';
import { m } from 'motion/react';
import { PiggyBank } from 'lucide-react';
import type { Currency, HomeHeaderTone, View } from '../../types';
import { MOTION } from '../../config';
import type { AnalyticsPeriod, AnalyticsStudioSummary } from '../../utils/analyticsSelectors';
import type { SpendingBar } from '../../domain/periodCompare';
import { formatDate, getIntlLocale, type AppLanguage } from '../../utils/locale';
import { Segmented } from '../ui/Segmented';
import { ON_COLOUR, ScreenHero } from '../ui/ScreenHero';
import { fill, fitFont } from '../home/parts';
import { plainAmount, type AnalyticsStrings } from './analyticsStrings';

interface AnalyticsHeroProps {
  tone: HomeHeaderTone;
  title: string;
  periodLabel: string;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  /** Switches to the AI side of Insights. */
  onNavigate?: (view: View) => void;
  summary: AnalyticsStudioSummary;
  bars: SpendingBar[];
  average: number | null;
  currency: Currency;
  language: AppLanguage;
  s: AnalyticsStrings;
}

/** 0, 50k, 100k...: four even steps that cover the tallest bar (or the average line). */
const ticksFor = (max: number): number[] => {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(multiple => multiple * power).find(candidate => candidate >= rough) ?? rough;
  return [0, step, step * 2, step * 3, step * 4];
};

const tickLabel = (value: number, locale: string): string => {
  const format = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  if (value >= 1_000_000) return `${format(value / 1_000_000)}M`;
  if (value >= 1000) return `${format(value / 1000)}k`;
  return format(value);
};

export const barLabel = (bar: SpendingBar, period: AnalyticsPeriod, language: AppLanguage): string => {
  if (period === 'year') return String(bar.start.getFullYear());
  if (period === 'quarter') {
    const quarter = Math.floor(bar.start.getMonth() / 3) + 1;
    return language === 'sr' ? `${quarter}. kv.` : `Q${quarter}`;
  }
  const month = formatDate(bar.start, { month: 'short' }, language).replace(/\.$/, '');
  return month.charAt(0).toLocaleUpperCase(getIntlLocale(language)) + month.slice(1);
};

const CHART_HEIGHT = 132;

/**
 * The top of Insights in the Home header colour: the Numbers / Ask AI switch, the period, what
 * went out so far with what came in and what was kept, and the last few periods as bars against
 * their average.
 */
export const AnalyticsHero: React.FC<AnalyticsHeroProps> = ({
  tone, title, periodLabel, period, onPeriodChange, onNavigate, summary, bars, average, currency, language, s,
}) => {
  const locale = getIntlLocale(language);
  const amount = (value: number) => plainAmount(value, currency, locale);
  const { expense, income, net, savingsRate } = summary.totals.current;
  const start = summary.period.currentStart;
  const spentLabel = period === 'month'
    ? fill(s.spentMonth, { month: formatDate(start, { month: 'long' }, language) })
    : period === 'quarter' ? s.spentQuarter : fill(s.spentYear, { year: String(start.getFullYear()) });
  const number = amount(expense);
  const rate = savingsRate === null ? null : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(savingsRate / 100);

  const ticks = ticksFor(Math.max(average ?? 0, ...bars.map(bar => bar.amount)));
  const top = ticks[ticks.length - 1];
  const y = (value: number) => Math.min(1, value / top) * CHART_HEIGHT;
  const labels = bars.map(bar => (bar.current ? fill(s.soFar, { label: barLabel(bar, period, language) }) : barLabel(bar, period, language)));
  const columns = { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` };
  const chartText = fill(s.chartLabel, {
    list: [
      ...bars.map((bar, index) => `${labels[index]} ${amount(bar.amount)} ${currency}`),
      ...(average !== null ? [fill(s.average, { amount: `${amount(average)} ${currency}` })] : []),
    ].join(', '),
  });

  return (
    <ScreenHero tone={tone} label={title}>
      <div className="flex h-[60px] items-center gap-3 px-3 md:px-4">
        <h1 className="min-w-0 flex-1 truncate pl-1 text-[28px] font-bold tracking-[-0.03em]">{title}</h1>
        {onNavigate && (
          <Segmented<View>
            tone="hero"
            size="sm"
            ariaLabel={s.viewSwitch}
            value="analytics"
            onChange={onNavigate}
            options={[{ value: 'analytics', label: s.numbers }, { value: 'insights', label: s.askAi }]}
          />
        )}
      </div>

      <div className="px-4 pb-[42px] pt-1 md:px-5 md:pb-5">
        <Segmented<AnalyticsPeriod>
          tone="hero"
          className="w-full"
          ariaLabel={periodLabel}
          value={period}
          onChange={onPeriodChange}
          options={[
            { value: 'month', label: s.thisMonth },
            { value: 'quarter', label: s.thisQuarter },
            { value: 'year', label: s.thisYear },
          ]}
        />

        <p className="mt-5 text-[15px] font-medium text-white/80" aria-live="polite">{spentLabel}</p>
        <div style={{ containerType: 'inline-size' }}>
          <p
            className="whitespace-nowrap font-bold leading-[1.08] tracking-[-0.04em] tabular-nums text-white"
            style={{ fontSize: fitFont(52, `${number} ${currency}`, 0.62) }}
          >
            {number}
            <span className="ml-1.5 text-[0.42em] font-semibold tracking-normal text-white/60">{currency}</span>
          </p>
        </div>

        {income > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className={clsx(ON_COLOUR, 'inline-flex h-[34px] items-center rounded-full px-3 text-[14px] font-semibold tabular-nums text-white')}>
              {fill(s.inChip, { amount: amount(income) })}
            </span>
            <span className={clsx(ON_COLOUR, 'inline-flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold tabular-nums text-white')}>
              {net >= 0 && <PiggyBank size={15} aria-hidden="true" className="shrink-0" />}
              {net >= 0
                ? fill(s.savedChip, { amount: amount(net), rate: rate ?? '' })
                : fill(s.overChip, { amount: amount(-net) })}
            </span>
          </div>
        )}

        {bars.length > 1 && (
          <figure role="img" aria-label={chartText} className="mt-5 flex gap-2">
            {/* Axis labels, bottom to top. */}
            <div aria-hidden="true" className="relative w-9 shrink-0" style={{ height: CHART_HEIGHT }}>
              {ticks.map(tick => (
                <span
                  key={tick}
                  className="absolute right-0 translate-y-1/2 text-[11.5px] font-medium tabular-nums text-white/60"
                  style={{ bottom: y(tick) }}
                >
                  {tickLabel(tick, locale)}
                </span>
              ))}
            </div>
            <div aria-hidden="true" className="min-w-0 flex-1">
              <div className="relative border-b border-white/30" style={{ height: CHART_HEIGHT }}>
                {ticks.slice(1).map(tick => (
                  <span key={tick} className="absolute inset-x-0 border-t border-white/[0.08]" style={{ bottom: y(tick) }} />
                ))}
                {average !== null && (
                  <>
                    <span className="absolute inset-x-0 border-t-2 border-dashed border-white/70" style={{ bottom: y(average) }} />
                    <span
                      className="absolute left-0.5 mb-1 whitespace-nowrap text-[12px] font-semibold tabular-nums text-white/85"
                      style={{ bottom: Math.min(y(average), CHART_HEIGHT - 16) }}
                    >
                      {fill(s.average, { amount: amount(average) })}
                    </span>
                  </>
                )}
                <div className="absolute inset-0 grid items-end" style={columns}>
                  {bars.map((bar, index) => (
                    <span key={bar.start.toISOString()} className="flex h-full items-end justify-center">
                      <m.span
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ ...MOTION.sheet.spring, delay: index * 0.04 }}
                        className={clsx('block w-[46%] max-w-[44px] origin-bottom rounded-t-[9px]', bar.current ? 'bg-white' : 'bg-white/25')}
                        style={{ height: Math.max(bar.amount > 0 ? 3 : 0, y(bar.amount)) }}
                      />
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-2 grid" style={columns}>
                {bars.map((bar, index) => (
                  <span
                    key={bar.start.toISOString()}
                    className={clsx(
                      'truncate px-0.5 text-center text-[13px] tabular-nums',
                      bar.current ? 'font-bold text-white' : 'font-medium text-white/70',
                    )}
                  >
                    {labels[index]}
                  </span>
                ))}
              </div>
            </div>
          </figure>
        )}
      </div>
    </ScreenHero>
  );
};
