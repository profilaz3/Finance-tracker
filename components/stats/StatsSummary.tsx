import React, { useMemo } from 'react';
import { Transaction, Currency, ExchangeRates } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { convertAmount } from '../../services/currencyService';
import { motion } from 'motion/react';
import { formatMoney } from '../../utils/locale';

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
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-surface-container-low p-6 rounded-xl shadow-elevation-1"
    >
      <div className="flex justify-between items-center">
        <div>
          <p className="text-on-surface-variant text-sm font-medium mb-2">{t.totalFeesPaid}</p>
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-2xl font-display font-medium text-on-surface">
              {formatMoney(totalFeesUSD, 'USD', language)}
            </p>
            {baseCurrency !== 'USD' && (
              <p className="text-lg text-on-surface-variant">
                ≈ {formatMoney(totalFees, baseCurrency, language)}
              </p>
            )}
          </div>
          {totalExpense > 0 && (
            <p className="text-sm text-on-surface-variant mt-2">
              ({((totalFees / totalExpense) * 100).toFixed(2)}% {t.ofTotalExpenses})
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};
