import { AppearanceSchema, BudgetSchema, HomeHeaderSchema, HomeLayoutSchema, PaymentDetailsSchema, TeamBudgetsSchema } from '../schemas';
import type { AppState } from '../types';

type PrefsSlice = Pick<AppState, 'appearance' | 'homeLayout' | 'homeHeader' | 'budget' | 'teamBudgets' | 'paymentDetails'>;

/**
 * Read `settings.prefs` from the server. Each part is validated on its own so a
 * malformed layout never discards a valid budget. Absent parts stay undefined
 * (keep the local value); an explicit `budget: null` clears the budget.
 */
export function parseSettingsPrefs(raw: unknown): Partial<PrefsSlice> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const prefs = raw as Record<string, unknown>;
  const result: Partial<PrefsSlice> = {};

  const appearance = AppearanceSchema.safeParse(prefs.appearance);
  if (appearance.success) result.appearance = appearance.data;

  const layout = HomeLayoutSchema.safeParse(prefs.homeLayout);
  if (layout.success) result.homeLayout = layout.data;

  const header = HomeHeaderSchema.safeParse(prefs.homeHeader);
  if (header.success) result.homeHeader = header.data;

  if (prefs.budget === null) {
    result.budget = null;
  } else {
    const budget = BudgetSchema.safeParse(prefs.budget);
    if (budget.success) result.budget = budget.data;
  }

  // Team workspace budgets: a malformed map keeps the local copy; null means none.
  if (prefs.teamBudgets === null) {
    result.teamBudgets = {};
  } else if (prefs.teamBudgets !== undefined) {
    const teamBudgets = TeamBudgetsSchema.safeParse(prefs.teamBudgets);
    if (teamBudgets.success) result.teamBudgets = teamBudgets.data;
  }

  // Payment details: `payment: null` clears them, a malformed value keeps the local copy.
  if (prefs.payment === null) {
    result.paymentDetails = null;
  } else {
    const payment = PaymentDetailsSchema.safeParse(prefs.payment);
    if (payment.success && /^\d{18}$/.test(payment.data.account)) result.paymentDetails = payment.data;
  }

  return result;
}
