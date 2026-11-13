import type { AppState, Person } from '../types';

/** Appearance, Home layout and budget travel together in `settings.prefs` (jsonb). */
export interface SettingsPrefs {
  appearance?: AppState['appearance'];
  homeLayout?: AppState['homeLayout'];
  budget?: AppState['budget'];
}

export interface SettingsSyncPayload {
  baseCurrency: AppState['baseCurrency'];
  theme: AppState['theme'];
  language: AppState['language'];
  userProfile?: Person;
  prefs?: SettingsPrefs;
}

export function buildSettingsSyncPayload(
  state: Pick<AppState, 'baseCurrency' | 'theme' | 'language' | 'userProfile' | 'appearance' | 'homeLayout' | 'budget'>,
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
    },
  };
}
