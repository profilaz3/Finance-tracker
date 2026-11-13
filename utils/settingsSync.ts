import type { AppState, Person } from '../types';

/** Appearance, Home layout, budget and payment details travel together in `settings.prefs` (jsonb). */
export interface SettingsPrefs {
  appearance?: AppState['appearance'];
  homeLayout?: AppState['homeLayout'];
  budget?: AppState['budget'];
  payment?: AppState['paymentDetails'];
}

export interface SettingsSyncPayload {
  baseCurrency: AppState['baseCurrency'];
  theme: AppState['theme'];
  language: AppState['language'];
  userProfile?: Person;
  prefs?: SettingsPrefs;
}

export function buildSettingsSyncPayload(
  state: Pick<AppState, 'baseCurrency' | 'theme' | 'language' | 'userProfile' | 'appearance' | 'homeLayout' | 'budget' | 'paymentDetails'>,
): SettingsSyncPayload {
  return {
    baseCurrency: state.baseCurrency,
    theme: state.theme,
    language: state.language,
    userProfile: state.userProfile,
    prefs: {
      appearance: state.appearance,
      homeLayout: state.homeLayout,
      budget: state.budget ?? null,
      payment: state.paymentDetails ?? null,
    },
  };
}
