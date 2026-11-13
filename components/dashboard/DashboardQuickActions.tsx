import React from 'react';
import { Camera, PlusCircle, Split, TrendingUp } from 'lucide-react';
import type { TransactionType } from '../../types';
import { TRANSLATIONS } from '../../constants';

interface DashboardQuickActionsProps {
  language: 'en' | 'sr';
  aiAvailable: boolean;
  onAddTransaction: (type?: TransactionType) => void;
  onOpenReceiptScan?: () => void;
  onOpenQuickSplit?: () => void;
}

export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  language,
  aiAvailable,
  onAddTransaction,
  onOpenReceiptScan,
  onOpenQuickSplit,
}) => {
  const t = TRANSLATIONS[language];
  const labels = {
    expense: t.expenseType,
    income: t.incomeType,
    receipt: t.receipt,
    split: t.split,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <button
        type="button"
        onClick={() => onAddTransaction('expense')}
        className="min-h-[56px] rounded-xl bg-primary text-on-primary px-3 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-elevation-1"
      >
        <PlusCircle size={18} aria-hidden="true" />
        <span>{labels.expense}</span>
      </button>
      <button
        type="button"
        onClick={() => onAddTransaction('income')}
        className="min-h-[56px] rounded-xl bg-tertiary text-on-tertiary px-3 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-elevation-1"
      >
        <TrendingUp size={18} aria-hidden="true" />
        <span>{labels.income}</span>
      </button>
      {aiAvailable && onOpenReceiptScan && (
        <button
          type="button"
          onClick={onOpenReceiptScan}
          className="min-h-[56px] rounded-xl bg-secondary-container text-on-secondary-container px-3 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-elevation-1"
        >
          <Camera size={18} aria-hidden="true" />
          <span>{labels.receipt}</span>
        </button>
      )}
      {onOpenQuickSplit && (
        <button
          type="button"
          onClick={onOpenQuickSplit}
          className="min-h-[56px] rounded-xl bg-surface-container-high text-on-surface px-3 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-elevation-1"
        >
          <Split size={18} aria-hidden="true" />
          <span>{labels.split}</span>
        </button>
      )}
    </div>
  );
};
