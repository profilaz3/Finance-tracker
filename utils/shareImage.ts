import { blobToBase64 } from './blobBase64';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * Shares the PNG: the app's native share sheet on Android, Web Share with files where the browser
 * supports it, otherwise a download.
 */
export const sharePng = async (
  blob: Blob,
  options: { fileName: string; text: string; title: string },
): Promise<ShareOutcome> => {
  try {
    const bridge = await import('./widgetBridge');
    if (bridge.isFinanceBridgeAvailable()) {
      await bridge.FinanceBridge.shareImage({ base64: await blobToBase64(blob), ...options });
      return 'shared';
    }
  } catch {
    return 'failed';
  }

  const file = new File([blob], options.fileName, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: options.text, title: options.title });
      return 'shared';
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
};
