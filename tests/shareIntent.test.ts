import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false },
  registerPlugin: () => ({}),
}));

import { isSharedImage, listenForNativeIntents, parseNativeAction, takePendingAction, takePendingShare } from '../utils/shareIntent';

const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD=';

type Listener = () => void;

const fakeBridge = (pending: { share?: string; action?: string } = {}) => {
  const listeners = new Map<string, Listener>();
  const removed: string[] = [];
  const bridge = {
    getPendingShare: vi.fn(async () => {
      const dataUrl = pending.share;
      pending.share = undefined;
      return dataUrl ? { dataUrl } : {};
    }),
    getPendingAction: vi.fn(async () => {
      const action = pending.action;
      pending.action = undefined;
      return action ? { action } : {};
    }),
    addListener: vi.fn(async (event: 'shareReceived' | 'actionReceived', listener: Listener) => {
      listeners.set(event, listener);
      return { remove: async () => { removed.push(event); } };
    }),
  };
  return { bridge, listeners, removed, pending };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('shared image validation', () => {
  it('accepts image data URLs only', () => {
    expect(isSharedImage(IMAGE)).toBe(true);
    expect(isSharedImage('data:text/html;base64,PGgxPg==')).toBe(false);
    expect(isSharedImage('https://example.test/receipt.jpg')).toBe(false);
    expect(isSharedImage(undefined)).toBe(false);
    expect(isSharedImage(`data:image/jpeg;base64,${'A'.repeat(6_000_001)}`)).toBe(false);
  });

  it('knows only the add expense action', () => {
    expect(parseNativeAction('add-expense')).toBe('add-expense');
    expect(parseNativeAction('delete-everything')).toBeNull();
  });
});

describe('pending items', () => {
  it('returns the shared image once', async () => {
    const { bridge } = fakeBridge({ share: IMAGE });
    expect(await takePendingShare(bridge)).toBe(IMAGE);
    expect(await takePendingShare(bridge)).toBeNull();
  });

  it('drops malformed shares and unknown actions', async () => {
    const { bridge } = fakeBridge({ share: 'data:image/svg+xml;base64,PHN2Zz4=', action: 'other' });
    expect(await takePendingShare(bridge)).toBeNull();
    expect(await takePendingAction(bridge)).toBeNull();
  });

  it('survives a bridge error', async () => {
    const { bridge } = fakeBridge();
    bridge.getPendingShare.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await takePendingShare(bridge)).toBeNull();
  });
});

describe('listenForNativeIntents', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing on the web', () => {
    const { bridge } = fakeBridge({ share: IMAGE });
    const onSharedImage = vi.fn();
    const stop = listenForNativeIntents({ onSharedImage, onAction: vi.fn() }, bridge, false);
    stop();
    expect(bridge.getPendingShare).not.toHaveBeenCalled();
  });

  it('delivers what is pending at start and what arrives later', async () => {
    const fake = fakeBridge({ share: IMAGE, action: 'add-expense' });
    const onSharedImage = vi.fn();
    const onAction = vi.fn();
    const stop = listenForNativeIntents({ onSharedImage, onAction }, fake.bridge, true);
    await flush();
    expect(onSharedImage).toHaveBeenCalledWith(IMAGE);
    expect(onAction).toHaveBeenCalledWith('add-expense');

    fake.pending.share = 'data:image/png;base64,iVBORw0KGgo=';
    fake.listeners.get('shareReceived')?.();
    await flush();
    expect(onSharedImage).toHaveBeenLastCalledWith('data:image/png;base64,iVBORw0KGgo=');
    expect(onSharedImage).toHaveBeenCalledTimes(2);

    stop();
    await flush();
    expect(fake.removed.sort()).toEqual(['actionReceived', 'shareReceived']);
  });

  it('ignores deliveries after cleanup', async () => {
    const fake = fakeBridge({ share: IMAGE });
    const onSharedImage = vi.fn();
    const stop = listenForNativeIntents({ onSharedImage, onAction: vi.fn() }, fake.bridge, true);
    stop();
    await flush();
    expect(onSharedImage).not.toHaveBeenCalled();
  });
});
