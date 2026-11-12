export const CONFIG = {
  SYNC_DEBOUNCE_MS: 500,
  USER_CACHE_TTL_MS: 5 * 60 * 1000,
  RETRY_DELAYS: [1000, 5000, 15000] as const,
  MAX_RETRIES: 3,
  SAVE_DEBOUNCE_MS: 300,
  STORAGE_KEY: 'gemini_finance_data_v5',
  OFFLINE_QUEUE_KEY: 'offline_operation_queue',
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
