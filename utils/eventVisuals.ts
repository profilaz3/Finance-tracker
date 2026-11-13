import type { Event } from '../types';

/** Deep two-stop palettes that keep white text readable. */
const PALETTES: Array<[string, string]> = [
  ['#0F766E', '#0B3B37'],
  ['#B43A0A', '#5A1D05'],
  ['#4338CA', '#1E1B4B'],
  ['#BE185D', '#4C0723'],
  ['#0369A1', '#0C2F4A'],
  ['#A16207', '#3D2504'],
  ['#15803D', '#06301A'],
  ['#7C3AED', '#2E1065'],
];

const hash = (value: string): number => {
  let result = 0;
  for (let i = 0; i < value.length; i++) {
    result = (result * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(result);
};

/** A stable gradient per event, used when it has no photo. */
export const eventGradient = (eventId: string): string => {
  const [from, to] = PALETTES[hash(eventId) % PALETTES.length];
  return `radial-gradient(120% 90% at 85% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%), linear-gradient(140deg, ${from} 0%, ${to} 100%)`;
};

/** The banner background: the photo when set, otherwise the event's gradient. */
export const eventBannerStyle = (event: Pick<Event, 'id' | 'imageUrl'>): { background?: string } =>
  event.imageUrl ? {} : { background: eventGradient(event.id) };

const STATUS_ORDER: Record<Event['status'], number> = { active: 0, completed: 1, archived: 2 };

/** Active first, then completed, then archived; newest start date first inside each. */
export const sortEvents = (events: Event[]): Event[] =>
  [...events].sort((left, right) => {
    const byStatus = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return new Date(right.startDate || 0).getTime() - new Date(left.startDate || 0).getTime();
  });
