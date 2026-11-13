import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Plain toasts are short confirmations; toasts with an action (Undo) stay long enough to react.
const TOAST_DURATION_MS = 2500;
const ACTION_TOAST_DURATION_MS = 10000;
// Keep the stack short so rapid actions do not bury the screen.
const MAX_VISIBLE_TOASTS = 4;

export type AddToast = (message: string, type: Toast['type'], action?: Toast['action']) => string;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Stable identity: handlers across the app list addToast in their dependency arrays,
  // so a fresh function per render would rebuild every one of them.
  const addToast = useCallback<AddToast>((message, type, action) => {
    // crypto.randomUUID avoids the id collisions the old timestamp ids had when two
    // toasts fired in the same millisecond (one dismissal removed both).
    const id = crypto.randomUUID();
    const duration = action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS;
    setToasts(prev => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, message, type, action, duration }]);
    timersRef.current.set(id, setTimeout(() => dismissToast(id), duration));
    return id;
  }, [dismissToast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return useMemo(() => ({ toasts, addToast, dismissToast }), [toasts, addToast, dismissToast]);
}
