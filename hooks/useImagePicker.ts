import { useState, useRef, useCallback } from 'react';
import { Camera, MediaTypeSelection } from '@capacitor/camera';
import type { MediaResult } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { getTranslations } from '../utils/i18n';
import { PHOTO_MAX_DIMENSION, fetchAsBlob, processImage } from '../utils/imageResize';

export interface ImageResult {
  base64: string;      // Raw base64 without data URL prefix
  dataUrl: string;     // data:image/... format for display
  file?: File;         // Downscaled, re-encoded file ready for upload
  webPath?: string;    // Web path for native display
}

interface UseImagePickerOptions {
  quality?: number;        // 0-100, default 80 (WebP/JPEG encoder quality)
  maxDimension?: number;   // Longest edge in px, default PHOTO_MAX_DIMENSION (1600)
}

interface UseImagePickerReturn {
  // Open the picker sheet
  openPicker: () => void;

  // Picker sheet state
  isPickerOpen: boolean;

  // Close the picker
  closePicker: () => void;

  // Pick from camera
  pickFromCamera: () => Promise<ImageResult | null>;

  // Pick from gallery
  pickFromGallery: () => Promise<ImageResult | null>;

  // Loading state
  isLoading: boolean;

  // Error state
  error: string | null;

  // Clear error
  clearError: () => void;

  // Hidden file input ref (for web fallback)
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Handle file input change (for web fallback)
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<ImageResult | null>;
}

// Error codes from @capacitor/camera 8 (CameraErrorCode) for a user-cancelled action.
const CANCEL_CODES = new Set(['OS-PLUG-CAMR-0006', 'OS-PLUG-CAMR-0013', 'OS-PLUG-CAMR-0020']);

function isCancellation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && CANCEL_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(message);
}

/**
 * Convert base64 string to File object
 */
export function base64ToFile(base64: string, filename: string = 'image.jpg'): File {
  // Handle both raw base64 and data URL formats
  let base64Data = base64;
  let mimeType = 'image/jpeg';

  if (base64.startsWith('data:')) {
    const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Data = matches[2];
    }
  }

  const byteCharacters = atob(base64Data);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const blob = new Blob([byteArray], { type: mimeType });

  // Determine file extension from mime type
  const ext = mimeType.split('/')[1] || 'jpg';
  const finalFilename = filename.includes('.') ? filename : `${filename}.${ext}`;

  return new File([blob], finalFilename, { type: mimeType });
}

/**
 * Custom hook for picking images from camera or gallery.
 * Native uses the @capacitor/camera 8 API (takePhoto / chooseFromGallery); web uses a
 * hidden file input. Every result is downscaled (longest edge `maxDimension`) and
 * re-encoded as WebP before it is returned, so uploads and AI requests stay small.
 */
export function useImagePicker(options: UseImagePickerOptions = {}): UseImagePickerReturn {
  const { quality = 80, maxDimension = PHOTO_MAX_DIMENSION } = options;
  const encoderQuality = Math.min(1, Math.max(0.1, quality / 100));

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isNative = Capacitor.isNativePlatform();

  const openPicker = useCallback(() => {
    setError(null);
    setIsPickerOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const toImageResult = useCallback(async (source: Blob, webPath?: string): Promise<ImageResult> => {
    const processed = await processImage(source, {
      maxDimension,
      quality: encoderQuality,
      fileName: `photo_${Date.now()}`,
    });
    return { base64: processed.base64, dataUrl: processed.dataUrl, file: processed.file, webPath };
  }, [encoderQuality, maxDimension]);

  const fromMediaResult = useCallback(async (media: MediaResult | undefined): Promise<ImageResult | null> => {
    if (!media) return null;
    if (media.webPath) {
      return toImageResult(await fetchAsBlob(media.webPath), media.webPath);
    }
    if (media.thumbnail) {
      return toImageResult(base64ToFile(media.thumbnail));
    }
    return null;
  }, [toImageResult]);

  const reportError = useCallback((err: unknown, fallback: string) => {
    if (isCancellation(err)) return;
    console.error(fallback, err);
    setError(err instanceof Error && err.message ? err.message : fallback);
  }, []);

  /**
   * Pick image from camera (native) or trigger file input with capture (web)
   */
  const pickFromCamera = useCallback(async (): Promise<ImageResult | null> => {
    if (!isNative) {
      // Web fallback: the result arrives through handleFileInputChange.
      const input = fileInputRef.current;
      if (input) {
        input.setAttribute('capture', 'environment');
        input.click();
      }
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const media = await Camera.takePhoto({
        quality,
        correctOrientation: true,
        saveToGallery: false,
      });
      return await fromMediaResult(media);
    } catch (err: unknown) {
      reportError(err, getTranslations().cameraAccessFailed);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isNative, quality, fromMediaResult, reportError]);

  /**
   * Pick image from gallery (native) or trigger file input (web)
   */
  const pickFromGallery = useCallback(async (): Promise<ImageResult | null> => {
    if (!isNative) {
      // Web fallback: only open the input. Its onChange (handleFileInputChange) delivers
      // the result; resolving here as well used to process and upload the image twice.
      const input = fileInputRef.current;
      if (input) {
        input.removeAttribute('capture');
        input.click();
      }
      return null;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { results } = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        quality,
        correctOrientation: true,
      });
      return await fromMediaResult(results[0]);
    } catch (err: unknown) {
      reportError(err, getTranslations().galleryAccessFailed);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isNative, quality, fromMediaResult, reportError]);

  /**
   * Handle file input change (for web fallback)
   */
  const handleFileInputChange = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<ImageResult | null> => {
    const file = e.target.files?.[0];
    if (!file) return null;

    // Reset input so same file can be selected again
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setError(getTranslations().selectImageFile);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      return await toImageResult(file);
    } catch (err: unknown) {
      reportError(err, getTranslations().fileReadFailed);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toImageResult, reportError]);

  return {
    openPicker,
    isPickerOpen,
    closePicker,
    pickFromCamera,
    pickFromGallery,
    isLoading,
    error,
    clearError,
    fileInputRef,
    handleFileInputChange,
  };
}
