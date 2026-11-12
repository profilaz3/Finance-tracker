import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Image, X } from 'lucide-react';

interface ImagePickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCamera: () => void;
  onSelectGallery: () => void;
  title?: string;
  language?: 'en' | 'sr';
}

const translations = {
  en: {
    addPhoto: 'Add Photo',
    takePhoto: 'Take Photo',
    chooseFromGallery: 'Choose from Gallery',
    cancel: 'Cancel',
  },
  sr: {
    addPhoto: 'Dodaj Sliku',
    takePhoto: 'Slikaj',
    chooseFromGallery: 'Izaberi iz Galerije',
    cancel: 'Otkaži',
  },
};

export const ImagePickerSheet: React.FC<ImagePickerSheetProps> = ({
  isOpen,
  onClose,
  onSelectCamera,
  onSelectGallery,
  title,
  language = 'en',
}) => {
  const t = translations[language];

  const handleCameraClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCamera();
    onClose();
  };

  const handleGalleryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectGallery();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[150] bg-scrim/60 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed bottom-0 left-0 right-0 z-[151] bg-surface-container-high rounded-t-3xl shadow-elevation-3 pb-[env(safe-area-inset-bottom,20px)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-outline-variant/50 rounded-full" />
            </div>

            {/* Title */}
            <div className="px-6 pb-4 pt-2">
              <h3 className="text-lg font-display font-medium text-on-surface text-center">
                {title || t.addPhoto}
              </h3>
            </div>

            {/* Options */}
            <div className="px-4 pb-4 space-y-2">
              {/* Take Photo */}
              <button
                onClick={handleCameraClick}
                className="w-full flex items-center gap-4 p-4 bg-surface-container hover:bg-surface-container-highest rounded-2xl transition-colors active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera size={24} className="text-primary" />
                </div>
                <span className="text-base font-medium text-on-surface">
                  {t.takePhoto}
                </span>
              </button>

              {/* Choose from Gallery */}
              <button
                onClick={handleGalleryClick}
                className="w-full flex items-center gap-4 p-4 bg-surface-container hover:bg-surface-container-highest rounded-2xl transition-colors active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-tertiary/10 flex items-center justify-center">
                  <Image size={24} className="text-tertiary" />
                </div>
                <span className="text-base font-medium text-on-surface">
                  {t.chooseFromGallery}
                </span>
              </button>
            </div>

            {/* Cancel Button */}
            <div className="px-4 pb-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 p-4 bg-surface-container-highest hover:bg-error-container/20 rounded-2xl transition-colors active:scale-[0.98]"
              >
                <X size={20} className="text-on-surface-variant" />
                <span className="text-base font-medium text-on-surface-variant">
                  {t.cancel}
                </span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
