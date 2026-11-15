import { useEffect, useState } from 'react';
import { getSupabaseService } from '../services/runtimeServices';

/**
 * Who is signed in: the auth user id and email. Not the profile (`state.userProfile.id` is a person
 * id, used for splits and balances), which is why permission checks must use this instead.
 */
export interface SessionIdentity {
  userId: string | null;
  email: string | null;
}

let cached: SessionIdentity | null = null;

/** Forget the cached identity (sign-out), so the next user never sees the previous one's. */
export const clearSessionIdentityCache = (): void => {
  cached = null;
};

/**
 * The signed-in identity, read from the local session (no network, works offline). `null` until it
 * is known; callers should offer only what every viewer may do until then.
 */
export function useSessionIdentity(): SessionIdentity | null {
  const [identity, setIdentity] = useState<SessionIdentity | null>(cached);

  useEffect(() => {
    let cancelled = false;
    void getSupabaseService()
      .then(service => service.getSessionUser())
      .then(user => {
        const next: SessionIdentity = { userId: user?.id ?? null, email: user?.email?.trim().toLowerCase() ?? null };
        cached = next;
        if (cancelled) return;
        setIdentity(prev => (prev?.userId === next.userId && prev?.email === next.email ? prev : next));
      })
      .catch(error => console.warn('Reading the signed-in identity failed:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  return identity;
}
