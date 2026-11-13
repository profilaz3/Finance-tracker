import { useEffect, useRef } from 'react';
import { TRANSLATIONS } from '../../constants';
import type { AppState, View } from '../../types';
import type { AddToast } from '../../hooks/useToasts';
import { useNotificationPrefs } from '../../hooks/useNotifications';
import { notificationId } from '../../domain/notificationRules';
import {
  letterMonthFor,
  monthId,
  nextAttempt,
  nextLetterReminderAt,
  shouldAutoGenerate,
} from '../../domain/letterArchive';
import {
  getLetterSnapshot,
  readLetterAttempt,
  requestOpenLetter,
  saveLetterAttempt,
  setLetterContext,
} from '../../services/letterStore';
import { CONFIG } from '../../config';
import { canScheduleReminders, getNotificationPermission, notifyNow, syncLetterReminder } from '../../utils/notifications';
import { formatDate } from '../../utils/locale';

interface UseMonthlyLetterOptions {
  /** The active workspace's state. */
  state: AppState;
  workspaceId: string | null;
  currentUserId: string | null;
  isAuthenticated: boolean;
  /** True once the server copy of the data is in. */
  hydrated: boolean;
  addToast: AddToast;
  onNavigate: (view: View) => void;
}

/** Waits for startup work to settle before spending an AI call. */
const START_DELAY_MS = 5000;

const fill = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(value), template);

const monthLabel = (month: string, language: AppState['language']) => {
  const [year, value] = month.split('-').map(Number);
  return formatDate(new Date(year, value - 1, 15), { month: 'long' }, language);
};

/**
 * Last month's letter, written in the background on the 1st (or the first open after it),
 * announced with a toast (app open) or a notification (app in the background). On the phone a
 * reminder for the next 1st is kept scheduled while the toggle is on.
 */
export function useMonthlyLetter({
  state,
  workspaceId,
  currentUserId,
  isAuthenticated,
  hydrated,
  addToast,
  onNavigate,
}: UseMonthlyLetterOptions) {
  const prefs = useNotificationPrefs();
  const stateRef = useRef(state);
  stateRef.current = state;
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const t = TRANSLATIONS[state.language];

  useEffect(() => {
    setLetterContext(isAuthenticated ? currentUserId : null, workspaceId);
  }, [isAuthenticated, currentUserId, workspaceId]);

  // Background writing, once per month and workspace.
  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !hydrated || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return;
    const timer = window.setTimeout(async () => {
      if (navigator.onLine === false) return;
      const now = new Date();
      const snapshot = getLetterSnapshot();
      if (snapshot.userId !== currentUserId || snapshot.scope !== workspaceId) return;
      const attempt = readLetterAttempt();
      if (!shouldAutoGenerate(now, snapshot.archive, attempt)) return;

      // Writing code loads only when a letter is due, keeping it out of the entry chunk.
      const { generateLetter } = await import('../../services/letterService');
      const current = stateRef.current;
      const result = await generateLetter(current, current.language, { quiet: true, now });
      if (result.status === 'thin') return;
      if (result.status === 'failed') {
        saveLetterAttempt(nextAttempt(now, attempt));
        return;
      }
      if (!prefs.letter) return;

      const strings = TRANSLATIONS[current.language];
      const month = result.letter.month;
      const title = fill(strings.notifLetterReadyTitle, { month: monthLabel(month, current.language) });
      if (document.visibilityState === 'visible') {
        addToast(title, 'info', {
          label: strings.letterRead,
          onClick: () => {
            requestOpenLetter(month);
            navigateRef.current('insights');
          },
        }, { id: `toast-letter-${month}` });
      } else {
        void notifyNow(notificationId(`letter-ready:${month}:${workspaceId ?? ''}`), title, strings.notifLetterReadyBody, { kind: 'letter', month });
      }
    }, START_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per user, workspace and hydration
  }, [isAuthenticated, currentUserId, workspaceId, hydrated, prefs.letter, addToast]);

  // Phone: keep a reminder on the next 1st so the letter is announced even if the app stays closed.
  useEffect(() => {
    if (!canScheduleReminders()) return;
    const timer = window.setTimeout(async () => {
      const permission = await getNotificationPermission();
      if (!isAuthenticated || !prefs.letter || permission !== 'granted') {
        await syncLetterReminder(null);
        return;
      }
      const now = new Date();
      const at = nextLetterReminderAt(now);
      // The letter announced on that day is about the month we are in now.
      const month = monthId(letterMonthFor(at));
      await syncLetterReminder({
        id: notificationId(`letter-reminder:${month}`),
        title: fill(t.notifLetterReadyTitle, { month: monthLabel(month, state.language) }),
        body: t.notifLetterReadyBody,
        at,
        extra: { kind: 'letter', month },
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, prefs.letter, t, state.language]);
}
