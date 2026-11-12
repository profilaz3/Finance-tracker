import type { AppState, Person } from '../types';

export interface SettingsSyncPayload {
  baseCurrency: AppState['baseCurrency'];
  theme: AppState['theme'];
  language: AppState['language'];
  userProfile?: Person;
}

export function buildSettingsSyncPayload(
  state: Pick<AppState, 'baseCurrency' | 'theme' | 'language' | 'userProfile'>,
): SettingsSyncPayload {
  return {
    baseCurrency: state.baseCurrency,
    theme: state.theme,
    language: state.language,
    userProfile: state.userProfile,
  };
}
