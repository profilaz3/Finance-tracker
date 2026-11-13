import { useState, useRef, useCallback } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { getTranslations } from '../utils/i18n';

export interface ImageResult {
  base64: string;      // Raw base64 without data URL prefix
  dataUrl: string;     // data:image/... format for display
  file?: File;         // File object for upload (web only, or converted)
  webPath?: string;    // Web path for native display
}

interface UseImagePickerOptions {
  quality?: number;        // 0-100, default 80
  maxWidth?: number;       // Default 1920
  maxHeight?: number;      // Default 1920
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
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  
  // Determine file extension from mime type
  const ext = mimeType.split('/')[1] || 'jpg';
  const finalFilename = filename.includes('.') ? filename : `${filename}.${ext}`;
  
  return new File([blob], finalFilename, { type: mimeType });
}

/**
 * Convert File to base64 data URL
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Custom hook for picking images from camera or gallery
 * Works on both native (Capacitor) and web platforms
 */
export function useImagePicker(options: UseImagePickerOptions = {}): UseImagePickerReturn {
  const { quality = 80, maxWidth = 1920, maxHeight = 1920 } = options;
  
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

  /**
   * Pick image from camera (native) or trigger file input with capture (web)
   */
  const pickFromCamera = useCallback(async (): Promise<ImageResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isNative) {
        // Use Capacitor Camera plugin
        const image = await Camera.getPhoto({
          quality,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
          width: maxWidth,
          height: maxHeight,
          correctOrientation: true,
        });

        if (image.base64String) {
          const mimeType = image.format === 'png' ? 'image/png' : 'image/jpeg';
          const dataUrl = `data:${mimeType};base64,${image.base64String}`;
          const file = base64ToFile(dataUrl, `photo_${Date.now()}.${image.format || 'jpg'}`);
          
          return {
            base64: image.base64String,
            dataUrl,
            file,
            webPath: image.webPath,
          };
        }
      } else {
        // Web fallback: trigger file input with capture
        if (fileInputRef.current) {
          fileInputRef.current.setAttribute('capture', 'environment');
          fileInputRef.current.click();
          // The result will come through handleFileInputChange
          return null;
        }
      }
      } catch (err: unknown) {
      // User cancelled is not an error
      const errorMessage = err instanceof Error ? err.message : getTranslations().unknownError;
      if (errorMessage?.includes('User cancelled') || errorMessage?.includes('canceled')) {
        console.log('User cancelled camera');
      } else {
        console.error('Camera error:', err);
        setError(errorMessage || getTranslations().cameraAccessFailed);
      }
    } finally {
      setIsLoading(false);
    }

    return null;
  }, [isNative, quality, maxWidth, maxHeight]);

  /**
   * Pick image from gallery (native) or trigger file input (web)
   */
  const pickFromGallery = useCallback(async (): Promise<ImageResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isNative) {
        // Use Capacitor Camera plugin with gallery source
        const image = await Camera.getPhoto({
          quality,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Photos,
          width: maxWidth,
          height: maxHeight,
          correctOrientation: true,
        });

        if (image.base64String) {
          const mimeType = image.format === 'png' ? 'image/png' : 'image/jpeg';
          const dataUrl = `data:${mimeType};base64,${image.base64String}`;
          const file = base64ToFile(dataUrl, `photo_${Date.now()}.${image.format || 'jpg'}`);
          
          return {
            base64: image.base64String,
            dataUrl,
            file,
            webPath: image.webPath,
          };
        }
      } else {
        // Web fallback: trigger file input and wait for selection
        if (fileInputRef.current) {
          const input = fileInputRef.current;
          input.removeAttribute('capture');

          // Create promise that resolves when file is selected
          const filePromise = new Promise<ImageResult | null>((resolve, reject) => {
            const handleSelect = (e: Event) => {
              input.removeEventListener('change', handleSelect);
              const files = (e.target as HTMLInputElement).files;
              if (files && files[0]) {
                const file = files[0];
                if (!file.type.startsWith('image/')) {
                  setError(getTranslations().selectImageFile);
                  reject(new Error('Invalid file type'));
                  return;
                }

                fileToBase64(file)
                  .then(dataUrl => {
                    const base64 = dataUrl.split(',')[1] || '';
                    resolve({
                      base64,
                      dataUrl,
                      file,
                    });
                  })
                  .catch(err => {
                    console.error('File read error:', err);
                    setError(err?.message || getTranslations().fileReadFailed);
                    reject(err);
                  });
              } else {
                // User cancelled
                resolve(null);
              }
            };

            input.addEventListener('change', handleSelect);
            input.click();
          });

          return filePromise;
        }
      }
      } catch (err: unknown) {
      // User cancelled is not an error
      const errorMessage = err instanceof Error ? err.message : getTranslations().unknownError;
      if (errorMessage?.includes('User cancelled') || errorMessage?.includes('canceled')) {
        console.log('User cancelled gallery');
      } else {
        console.error('Gallery error:', err);
        setError(errorMessage || getTranslations().galleryAccessFailed);
      }
    } finally {
      setIsLoading(false);
    }

    return null;
  }, [isNative, quality, maxWidth, maxHeight]);

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
      const dataUrl = await fileToBase64(file);
      const base64 = dataUrl.split(',')[1] || '';
      
      return {
        base64,
        dataUrl,
        file,
      };
      } catch (err: unknown) {
        console.error('File read error:', err);
        setError(err instanceof Error ? err.message : getTranslations().fileReadFailed);
        return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

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
