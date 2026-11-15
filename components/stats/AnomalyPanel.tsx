import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { AnalyticsAnomaly, AnalyticsPeriodRange } from '../../utils/analyticsSelectors';
import type { Category, Currency, ExchangeRates, Event, RecurringTransaction, Transaction } from '../../types';
import type { AppLanguage } from '../../utils/locale';
import { money } from '../home/parts';
import { formatPercent } from '../../utils/locale';
import { AlertTriangle, Receipt, Sparkles, TrendingUp } from 'lucide-react';
import { anomalySignature, buildAnomalyContexts } from '../../domain/anomalyContext';
import { canExplainAnomalies, explainAnomalies, getCachedExplanations, getLetterSnapshot, subscribeLetters } from '../../services/letterService';
import { ShimmerLine } from '../insights/Shimmer';
import { IconTile } from '../ui/IconTile';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { DeltaPill } from '../ui/primitives';
import { Illustration } from '../ui/Illustration';

/** What the panel needs to ask the AI why each anomaly happened. Without it, no explanations. */
export interface AnomalyExplainContext {
  transactions: Transaction[];
  categories: Category[];
  recurringTransactions?: RecurringTransaction[];
  events?: Event[];
  rates: ExchangeRates;
  period: AnalyticsPeriodRange;
  loadingLabel: string;
}

export interface AnomalyPanelProps {
  anomalies: AnalyticsAnomaly[];
  baseCurrency: Currency;
  language: AppLanguage;
  labels: {
    observations: string;
    noObservations: string;
    anomalyTitles: Record<AnalyticsAnomaly['kind'], string>;
    categorySpikeDetail: (categoryName: string, amount: string, percentage: string | null) => string;
    largeTransactionDetail: (categoryName: string | null, amount: string, percentage: string | null) => string;
    highFeesDetail: (amount: string, percentage: string | null) => string;
  };
  explain?: AnomalyExplainContext;
  /** Lets rows show the category's own glyph with a small kind badge. */
  categories?: Category[];
}

const formatPercentage = (percentage: number | undefined): string | null => (
  percentage === undefined ? null : formatPercent(percentage, 1)
);

const getAnomalyDetail = (
  anomaly: AnalyticsAnomaly,
  baseCurrency: Currency,
  language: AppLanguage,
  labels: AnomalyPanelProps['labels'],
): string => {
  const amount = money(anomaly.amount, baseCurrency, language);
  const percentage = formatPercentage(anomaly.percentage);

  if (anomaly.kind === 'category-spike') {
    return labels.categorySpikeDetail(anomaly.categoryName ?? '', amount, percentage);
  }

  if (anomaly.kind === 'large-transaction') {
    return labels.largeTransactionDetail(anomaly.categoryName ?? null, amount, percentage);
  }

  return labels.highFeesDetail(amount, percentage);
};

const ANOMALY_ICONS: Record<AnalyticsAnomaly['kind'], typeof TrendingUp> = {
  'category-spike': TrendingUp,
  'large-transaction': Receipt,
  'high-fees': AlertTriangle,
};

const NEG = 'var(--paper-neg)';
const WARN = 'rgb(var(--md-sys-color-warning))';
const ANOMALY_COLORS: Record<AnalyticsAnomaly['kind'], string> = {
  'category-spike': NEG,
  'large-transaction': 'rgb(var(--accent-rgb))',
  'high-fees': WARN,
};

type Explanations = { status: 'idle' | 'loading' | 'done'; byId: Record<string, string> };

/**
 * One batched AI call explains every flagged anomaly in a sentence. Cached per signature; while
 * it runs each row shows a shimmer, and on any failure the rows simply have no sentence.
 */
const useExplanations = (anomalies: AnalyticsAnomaly[], baseCurrency: Currency, language: AppLanguage, explain?: AnomalyExplainContext): Explanations => {
  // Re-checked when the signed-in user or workspace changes.
  const { userId, scope } = useSyncExternalStore(subscribeLetters, getLetterSnapshot, getLetterSnapshot);
  const enabled = Boolean(explain) && anomalies.length > 0 && Boolean(userId) && canExplainAnomalies();
  const signature = useMemo(
    () => (enabled && explain ? `${scope ?? ''}:${anomalySignature(anomalies, explain.period.currentKey, language)}` : null),
    [enabled, anomalies, explain, language, scope],
  );
  const [result, setResult] = useState<Explanations & { signature: string | null }>({ status: 'idle', byId: {}, signature: null });

  useEffect(() => {
    if (!signature || !explain) return;
    const cached = getCachedExplanations(signature);
    if (cached) {
      setResult({ status: 'done', byId: cached, signature });
      return;
    }
    let cancelled = false;
    setResult({ status: 'loading', byId: {}, signature });
    const contexts = buildAnomalyContexts(anomalies, explain.period, {
      transactions: explain.transactions,
      categories: explain.categories,
      events: explain.events,
      recurringTransactions: explain.recurringTransactions,
      baseCurrency,
      rates: explain.rates,
      language,
    });
    void explainAnomalies(contexts, signature, language).then(byId => {
      if (!cancelled) setResult({ status: 'done', byId: byId ?? {}, signature });
    });
    return () => {
      cancelled = true;
    };
    // The signature captures what matters; the inputs behind it are read when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return result.signature === signature ? result : { status: signature ? 'loading' : 'idle', byId: {} };
};

export const AnomalyPanel: React.FC<AnomalyPanelProps> = ({ anomalies, baseCurrency, language, labels, explain, categories }) => {
  const explanations = useExplanations(anomalies, baseCurrency, language, explain);
  const categoryById = useMemo(() => new Map((categories ?? explain?.categories ?? []).map(category => [category.id, category] as const)), [categories, explain?.categories]);

  return (
    <section className="paper-tile min-w-0 p-4 sm:p-5">
      <h3 className="mb-3 text-[17px] font-bold tracking-[-0.3px]">{labels.observations}</h3>
      {anomalies.length === 0 ? (
        <div className="flex items-center gap-3 py-1">
          <span className="h-[64px] w-[80px] flex-none" aria-hidden="true">
            <Illustration name="settled" />
          </span>
          <p className="min-w-0 flex-1 text-[14px] text-muted">{labels.noObservations}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-hair">
          {anomalies.map(anomaly => {
            const Icon = ANOMALY_ICONS[anomaly.kind] ?? AlertTriangle;
            const why = explanations.byId[anomaly.id];
            const color = ANOMALY_COLORS[anomaly.kind] ?? NEG;
            const category = anomaly.categoryId ? categoryById.get(anomaly.categoryId) : undefined;
            const kindBadge = <IconTile icon={Icon} color={color} size={18} shape="circle" tone="solid" />;
            return (
              <li key={anomaly.id} className="flex min-w-0 items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex-none">
                  {category
                    ? <CategoryGlyph category={category} size={40} badge={kindBadge} />
                    : <IconTile icon={Icon} color={color} size={40} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 min-w-0">
                    <p className="min-w-0 flex-1 text-[15px] font-semibold break-words">
                      {labels.anomalyTitles[anomaly.kind]}
                    </p>
                    <span className="flex flex-none flex-col items-end gap-1 text-right">
                      <span className="text-[14px] font-semibold tabular-nums">{money(anomaly.amount, baseCurrency, language)}</span>
                      {anomaly.kind === 'category-spike' && anomaly.percentage !== undefined && (
                        <DeltaPill direction="up" tone="neg">{formatPercent(anomaly.percentage, 0)}</DeltaPill>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted break-words">
                    {getAnomalyDetail(anomaly, baseCurrency, language, labels)}
                  </p>
                  {explanations.status === 'loading' && (
                    <span className="mt-2 flex flex-col gap-1.5" role="status" aria-label={explain?.loadingLabel}>
                      <ShimmerLine className="h-2.5" width="92%" />
                      <ShimmerLine className="h-2.5" width="60%" />
                    </span>
                  )}
                  {why && (
                    <p className="mt-1.5 flex gap-1.5 text-[13px] leading-snug text-on-surface break-words">
                      <Sparkles size={13} aria-hidden="true" className="mt-[3px] flex-none text-accent" />
                      <span>{why}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
