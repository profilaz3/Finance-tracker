import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AppState, Currency } from '../types';
import { TRANSLATIONS } from '../constants';
import { computeBudgetProgress, computeMonthSummary, monthKeyOf } from '../domain/home';
import { formatMoney } from './locale';

/** What the Android home screen widget shows. Text is formatted here so the widget matches the app. */
export interface WidgetSnapshot {
  signedIn: boolean;
  title: string;
  spentLabel: string;
  spentText: string;
  secondaryLabel: string;
  secondaryText: string;
  /** Budget used (0..1, may exceed 1), or -1 when no monthly budget is set. */
  progress: number;
  overBudget: boolean;
  currency: Currency;
  spent: number;
  income: number;
  /** null when no monthly budget is set. */
  budgetLeft: number | null;
  updatedLabel: string;
  addLabel: string;
  signInText: string;
  /** Epoch milliseconds. */
  updatedAt: number;
}

/** The app's native bridge (android/app/src/main/java/com/finance/tracker/FinanceBridgePlugin.java). */
export interface FinanceBridgePlugin {
  updateWidget(snapshot: WidgetSnapshot): Promise<void>;
  /** A receipt image shared into the app, as a JPEG data URL. Consumed on read. */
  getPendingShare(): Promise<{ dataUrl?: string }>;
  /** An action requested from outside the web view (the widget's "+" button). Consumed on read. */
  getPendingAction(): Promise<{ action?: string }>;
  /** Shares a PNG (base64, no data URL prefix) through the system share sheet. */
  shareImage(options: { base64: string; fileName: string; text?: string; title?: string }): Promise<void>;
  addListener(eventName: 'shareReceived' | 'actionReceived', listener: () => void): Promise<PluginListenerHandle>;
}

export const FinanceBridge = registerPlugin<FinanceBridgePlugin>('FinanceBridge');

export const isFinanceBridgeAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FinanceBridge');

type SnapshotState = Pick<AppState, 'transactions' | 'categories' | 'baseCurrency' | 'rates' | 'budget' | 'language'>;

export function buildWidgetSnapshot(state: SnapshotState | null, now: Date = new Date()): WidgetSnapshot {
  const language = state?.language ?? 'en';
  const t = TRANSLATIONS[language];
  const currency = state?.baseCurrency ?? 'EUR';
  const base = {
    title: t.thisMonth,
    spentLabel: t.spent,
    updatedLabel: t.widgetUpdated,
    addLabel: t.addExpense,
    signInText: t.widgetSignIn,
    currency,
    updatedAt: now.getTime(),
  };

  if (!state) {
    return {
      ...base,
      signedIn: false,
      spentText: '',
      secondaryLabel: '',
      secondaryText: '',
      progress: -1,
      overBudget: false,
      spent: 0,
      income: 0,
      budgetLeft: null,
    };
  }

  const money = (amount: number) => formatMoney(amount, currency, language, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const summary = computeMonthSummary(state, monthKeyOf(now), now);
  const budget = state.budget;

  if (budget && budget.monthly > 0) {
    const progress = computeBudgetProgress(budget, summary, state.categories);
    const overBudget = progress.left < 0;
    return {
      ...base,
      signedIn: true,
      spentText: money(summary.spent),
      secondaryLabel: overBudget ? t.widgetOverBudget : t.widgetBudgetLeft,
      secondaryText: money(Math.abs(progress.left)),
      progress: Math.round(progress.spentRatio * 1000) / 1000,
      overBudget,
      spent: summary.spent,
      income: summary.income,
      budgetLeft: progress.left,
    };
  }

  return {
    ...base,
    signedIn: true,
    spentText: money(summary.spent),
    secondaryLabel: t.income,
    secondaryText: money(summary.income),
    progress: -1,
    overBudget: false,
    spent: summary.spent,
    income: summary.income,
    budgetLeft: null,
  };
}

/** Pushes a snapshot to the home screen widget. A no-op on the web. */
export async function updateHomeWidget(snapshot: WidgetSnapshot): Promise<void> {
  if (!isFinanceBridgeAvailable()) return;
  try {
    await FinanceBridge.updateWidget(snapshot);
  } catch (error) {
    console.warn('[widget] update failed', error);
  }
}
