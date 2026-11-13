import { useEffect, useRef } from 'react';
import { listenForNativeIntents, type NativeAction } from '../utils/shareIntent';

interface Options {
  /** Pending shares and actions wait (natively) until this is true, e.g. until signed in. */
  enabled: boolean;
  onSharedImage: (dataUrl: string) => void;
  onAction: (action: NativeAction) => void;
}

/** Android entry points from outside the app: the share sheet and the home screen widget. */
export function useNativeIntents({ enabled, onSharedImage, onAction }: Options): void {
  const handlers = useRef({ onSharedImage, onAction });
  handlers.current = { onSharedImage, onAction };

  useEffect(() => {
    if (!enabled) return;
    return listenForNativeIntents({
      onSharedImage: dataUrl => handlers.current.onSharedImage(dataUrl),
      onAction: action => handlers.current.onAction(action),
    });
  }, [enabled]);
}
