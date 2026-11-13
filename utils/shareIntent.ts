import type { PluginListenerHandle } from '@capacitor/core';
import { FinanceBridge, isFinanceBridgeAvailable, type FinanceBridgePlugin } from './widgetBridge';

/** Shared images arrive as downscaled JPEG data URLs from the native side. */
const SHARED_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
/** Matches the receipt scan upload cap (about 6 MB of base64). */
const MAX_SHARED_IMAGE_CHARS = 6_000_000;

export type NativeAction = 'add-expense';

export const isSharedImage = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_SHARED_IMAGE_CHARS && SHARED_IMAGE.test(value);

export const parseNativeAction = (value: unknown): NativeAction | null => (value === 'add-expense' ? value : null);

type Bridge = Pick<FinanceBridgePlugin, 'getPendingShare' | 'getPendingAction' | 'addListener'>;

export async function takePendingShare(bridge: Bridge = FinanceBridge): Promise<string | null> {
  try {
    const { dataUrl } = await bridge.getPendingShare();
    return isSharedImage(dataUrl) ? dataUrl : null;
  } catch (error) {
    console.warn('[share] could not read the shared image', error);
    return null;
  }
}

export async function takePendingAction(bridge: Bridge = FinanceBridge): Promise<NativeAction | null> {
  try {
    const { action } = await bridge.getPendingAction();
    return parseNativeAction(action);
  } catch {
    return null;
  }
}

export interface NativeIntentHandlers {
  onSharedImage: (dataUrl: string) => void;
  onAction: (action: NativeAction) => void;
}

/**
 * Delivers images shared into the app and widget actions: whatever is pending at start, anything
 * that arrives while the app runs, and anything delivered while it was in the background.
 * Returns a cleanup function.
 */
export function listenForNativeIntents(
  handlers: NativeIntentHandlers,
  bridge: Bridge = FinanceBridge,
  available: boolean = isFinanceBridgeAvailable(),
): () => void {
  if (!available) return () => {};
  let disposed = false;
  const listeners: Array<Promise<PluginListenerHandle>> = [];

  const checkShare = async () => {
    const dataUrl = await takePendingShare(bridge);
    if (dataUrl && !disposed) handlers.onSharedImage(dataUrl);
  };
  const checkAction = async () => {
    const action = await takePendingAction(bridge);
    if (action && !disposed) handlers.onAction(action);
  };
  const checkAll = () => {
    void checkShare();
    void checkAction();
  };

  listeners.push(bridge.addListener('shareReceived', () => void checkShare()));
  listeners.push(bridge.addListener('actionReceived', () => void checkAction()));
  const onVisible = () => {
    if (document.visibilityState === 'visible') checkAll();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  checkAll();

  return () => {
    disposed = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    listeners.forEach(listener => void listener.then(handle => handle.remove()).catch(() => {}));
  };
}
