import React, { useMemo } from 'react';
import { Transaction, Currency, ExchangeRates } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { convertAmount } from '../../services/currencyService';
import { m } from 'motion/react';
import { Percent } from 'lucide-react';
import { formatMoney, formatPercent } from '../../utils/locale';

interface StatsSummaryProps {
  transactions: Transaction[];
  baseCurrency: Currency;
  rates: ExchangeRates;
  language: 'en' | 'sr';
  totalExpense: number;
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({
  transactions,
  baseCurrency,
  rates,
  language,
  totalExpense
}) => {
  const t = TRANSLATIONS[language];

  // Calculate Total Fees (fees are always in USD)
  const totalFees = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.fees) {
        // Fees are strictly in USD, convert to base currency
        return acc + convertAmount(t.fees, 'USD', baseCurrency, rates);
      }
      return acc;
    }, 0);
  }, [transactions, baseCurrency, rates]);

  // Total fees in USD (no conversion needed for display)
  const totalFeesUSD = useMemo(() => {
    return transactions.reduce((acc, t) => acc + (t.fees || 0), 0);
  }, [transactions]);

  if (totalFees <= 0) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="paper-tile flex min-w-0 items-center gap-3 p-4"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] bg-chip text-muted" aria-hidden="true">
        <Percent size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">{t.totalFeesPaid}</p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-[20px] font-bold tabular-nums tracking-[-0.4px]">
            {formatMoney(totalFeesUSD, 'USD', language)}
          </p>
          {baseCurrency !== 'USD' && (
            <p className="text-[14px] tabular-nums text-muted">
              ≈ {formatMoney(totalFees, baseCurrency, language)}
            </p>
          )}
        </div>
        {totalExpense > 0 && (
          <p className="text-[12px] text-muted">
            {formatPercent((totalFees / totalExpense) * 100, 2)} {t.ofTotalExpenses}
          </p>
        )}
      </div>
    </m.div>
  );
};
