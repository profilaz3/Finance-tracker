import { AppearanceSchema, BudgetSchema, HomeLayoutSchema } from '../schemas';
import type { AppState } from '../types';

type PrefsSlice = Pick<AppState, 'appearance' | 'homeLayout' | 'budget'>;

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

  if (prefs.budget === null) {
    result.budget = null;
  } else {
    const budget = BudgetSchema.safeParse(prefs.budget);
    if (budget.success) result.budget = budget.data;
  }

  return result;
}
