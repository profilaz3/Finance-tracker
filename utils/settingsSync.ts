import type { AppState, Person } from '../types';

/** Appearance, Home layout and header, budget and payment details travel together in `settings.prefs` (jsonb). */
export interface SettingsPrefs {
  appearance?: AppState['appearance'];
  homeLayout?: AppState['homeLayout'];
  homeHeader?: AppState['homeHeader'];
  budget?: AppState['budget'];
  teamBudgets?: AppState['teamBudgets'];
  payment?: AppState['paymentDetails'];
}

export interface SettingsSyncPayload {
  baseCurrency: AppState['baseCurrency'];
  language: AppState['language'];
  userProfile?: Person;
  prefs?: SettingsPrefs;
}

export function buildSettingsSyncPayload(
  state: Pick<AppState, 'baseCurrency' | 'language' | 'userProfile' | 'appearance' | 'homeLayout' | 'homeHeader' | 'budget' | 'teamBudgets' | 'paymentDetails'>,
): SettingsSyncPayload {
  return {
    baseCurrency: state.baseCurrency,
    language: state.language,
    userProfile: state.userProfile,
    prefs: {
      appearance: state.appearance,
      homeLayout: state.homeLayout,
      homeHeader: state.homeHeader,
      budget: state.budget ?? null,
      teamBudgets: state.teamBudgets ?? {},
      payment: state.paymentDetails ?? null,
    },
  };
}
