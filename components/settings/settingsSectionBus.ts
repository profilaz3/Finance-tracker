import type { SettingsTabId } from './useSettingsViewState';

/**
 * Lets other screens open Settings at a section (Home's Wallets tile opens Settings > Wallets).
 * Call `requestSettingsSection(id)` right before navigating to the settings view: a mounted
 * Settings page switches at once, otherwise the next one to mount starts on that section.
 */

let pending: SettingsTabId | null = null;
const listeners = new Set<(section: SettingsTabId) => void>();

export const requestSettingsSection = (section: SettingsTabId): void => {
  if (listeners.size > 0) {
    pending = null;
    listeners.forEach(listener => listener(section));
  } else {
    pending = section;
  }
};

/** The section a Settings page that is mounting should open (read-only; see `clearPendingSettingsSection`). */
export const peekPendingSettingsSection = (): SettingsTabId | null => pending;

export const clearPendingSettingsSection = (): void => {
  pending = null;
};

export const subscribeSettingsSection = (listener: (section: SettingsTabId) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
