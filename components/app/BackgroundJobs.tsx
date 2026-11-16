import { useNotifications } from '../../hooks/useNotifications';
import { useMonthlyLetter } from '../insights/useMonthlyLetter';

export interface BackgroundJobsProps {
  notifications: Parameters<typeof useNotifications>[0];
  letter: Parameters<typeof useMonthlyLetter>[0];
}

/**
 * Work that runs beside the UI once sign-in is known: bill reminders, budget and price alerts,
 * shared-event activity and the monthly letter. Rendered (lazily, so its code stays out of the
 * startup bundle) on the sign-in screen too, so signing out still cancels scheduled reminders.
 */
export default function BackgroundJobs({ notifications, letter }: BackgroundJobsProps) {
  useNotifications(notifications);
  useMonthlyLetter(letter);
  return null;
}
