export const CONFIG = {
  SYNC_DEBOUNCE_MS: 500,
  USER_CACHE_TTL_MS: 5 * 60 * 1000,
  RETRY_DELAYS: [1000, 5000, 15000] as const,
  MAX_RETRIES: 3,
  /** Offline queue backoff: first retry delay, doubled per attempt up to the cap. Retries never give up on transient errors. */
  QUEUE_RETRY_BASE_MS: 1000,
  QUEUE_RETRY_MAX_MS: 60_000,
  /** Permanently rejected operations (4xx / validation) are parked here per user instead of being dropped. */
  OFFLINE_DEAD_LETTER_KEY: 'offline_operation_dead_letter',
  /** Upper bound on how long sign-out waits for pending writes to reach the server. */
  LOGOUT_FLUSH_TIMEOUT_MS: 3000,
  /** Page size for paginated Supabase list fetches (PostgREST caps responses at 1000 rows by default). */
  FETCH_PAGE_SIZE: 1000,
  /** Web Locks name that serialises recurring-transaction generation across tabs. */
  RECURRING_LOCK_NAME: 'finance-recurring-processor',
  RECURRING_POLL_INTERVAL_MS: 60_000,
  STORAGE_WARNING_THROTTLE_MS: 30_000,
  SAVE_DEBOUNCE_MS: 300,
  STORAGE_KEY: 'gemini_finance_data_v5',
  OFFLINE_QUEUE_KEY: 'offline_operation_queue',
  /** Active workspace: a team id, or absent for personal. */
  WORKSPACE_KEY: 'finance_workspace_v1',
  /** Notification preferences (per device) and the bookkeeping that keeps alerts once-only. */
  NOTIFICATIONS_KEY: 'finance_notifications_v1',
  /** Re-fetch shared data when the app returns after this long, so new event expenses show up. */
  RESUME_REFRESH_AFTER_MS: 5 * 60 * 1000,
  EXCHANGE_RATE_CACHE_KEY: 'exchange_rates_cache',
  EXCHANGE_RATE_CACHE_DURATION_MS: 60 * 60 * 1000,
  EXCHANGE_RATE_API_URL: 'https://api.exchangerate-api.com/v4/latest/EUR',
  AUTO_SYNC_DEBOUNCE_MS: 2000,
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
} as const;

export const MOTION = {
  modal: {
    spring: { type: 'spring' as const, stiffness: 440, damping: 30, mass: 0.8 },
    initial: { scale: 0.94, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.96, opacity: 0 },
  },
  sheet: {
    spring: { type: 'spring' as const, stiffness: 400, damping: 32, mass: 0.7 },
    exit: { y: '100%', opacity: 0 },
  },
  backdrop: { duration: 0.2, ease: 'easeOut' },
  view: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  stagger: { staggerChildren: 0.04, delayChildren: 0.05 },
} as const;
