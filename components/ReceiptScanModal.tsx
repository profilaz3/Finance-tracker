import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Upload, Loader2, AlertCircle, Check, Image, Pencil, Trash2, Plus } from 'lucide-react';
import { Category, Account, Currency, Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { formatMoney } from '../utils/locale';
import { scanReceipt, ParsedReceipt, isAIAvailable } from '../services/aiService';
import { v4 as uuidv4 } from 'uuid';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { useImagePicker, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { MOTION } from '../config';
import { isSupportedReceiptImageType, RECEIPT_IMAGE_ACCEPT } from '../utils/receiptImage';

interface ReceiptScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  accounts: Account[];
  baseCurrency: Currency;
  language: 'en' | 'sr';
  onTransactionCreated: (transaction: Transaction) => void;
}

export const ReceiptScanModal: React.FC<ReceiptScanModalProps> = ({
  isOpen,
  onClose,
  categories,
  accounts,
  baseCurrency,
  language,
  onTransactionCreated
}) => {
  const t = TRANSLATIONS[language];
  
  // Image picker hook
  const {
    openPicker,
    isPickerOpen,
    closePicker,
    pickFromCamera,
    pickFromGallery,
    isLoading: isPickerLoading,
    fileInputRef,
    handleFileInputChange,
  } = useImagePicker({ quality: 85 });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const unsupportedFileMessage = t.receiptUnsupportedFile;

  const resetState = () => {
    setImagePreview(null);
    setIsScanning(false);
    setIsProcessingImage(false);
    setError(null);
    setParsedReceipt(null);
    setIsDragging(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Handle image result from picker
  const handleImageResult = useCallback((result: ImageResult | null) => {
    if (result) {
      if (result.file && !isSupportedReceiptImageType(result.file.type)) {
        setImagePreview(null);
        setParsedReceipt(null);
        setError(unsupportedFileMessage);
        return;
      }
      setImagePreview(result.dataUrl);
      setError(null);
      setParsedReceipt(null);
    }
  }, [unsupportedFileMessage]);

  // Handle camera selection
  const handleCameraSelect = useCallback(async () => {
    setIsProcessingImage(true);
    setError(null);
    try {
      const result = await pickFromCamera();
      handleImageResult(result);
    } catch (err) {
      console.error('Camera error:', err);
      setError(t.imageCaptureFailed);
    } finally {
      setIsProcessingImage(false);
    }
  }, [pickFromCamera, handleImageResult, language]);

  // Handle gallery selection
  const handleGallerySelect = useCallback(async () => {
    setIsProcessingImage(true);
    setError(null);
    try {
      const result = await pickFromGallery();
      handleImageResult(result);
    } catch (err) {
      console.error('Gallery error:', err);
      setError(t.imageLoadFailed);
    } finally {
      setIsProcessingImage(false);
    }
  }, [pickFromGallery, handleImageResult, language]);

  // Handle file input change (web fallback)
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && !isSupportedReceiptImageType(file.type)) {
      e.target.value = '';
      setError(unsupportedFileMessage);
      return;
    }

    setIsProcessingImage(true);
    setError(null);
    try {
      const result = await handleFileInputChange(e);
      handleImageResult(result);
    } catch (err) {
      console.error('File input error:', err);
      setError(t.imageLoadFailed);
    } finally {
      setIsProcessingImage(false);
    }
  }, [handleFileInputChange, handleImageResult, language, unsupportedFileMessage]);

  // Legacy file select for drag and drop
  const handleFileSelect = (file: File) => {
    if (!isSupportedReceiptImageType(file.type)) {
      setError(unsupportedFileMessage);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
      setError(null);
      setParsedReceipt(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

const handleScan = async () => {
    if (!imagePreview) return;
    
    if (!isAIAvailable()) {
      setError(t.aiNotConfigured);
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      const result = await scanReceipt(imagePreview, categories, accounts);

      if (result) {
        setParsedReceipt(result);
        vibrate(HAPTIC_PATTERNS.success);
      } else {
        setError(t.receiptReadFailed);
      }
    } catch (err: unknown) {
      console.error('Receipt scanning failed:', err);
      // Provide more specific error messages
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('API key')) {
        setError(t.aiKeyMisconfigured);
      } else if (errorMessage.includes('rate limit')) {
        setError(t.tooManyRequests);
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setError(t.networkErrorCheckConnection);
      } else {
        setError(t.receiptScanFailedRetry);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleConfirm = () => {
    if (!parsedReceipt) return;

    vibrate(HAPTIC_PATTERNS.success);

    // Find matching category and account
    const category = categories.find(c =>
      c.name.toLowerCase() === parsedReceipt.categoryName.toLowerCase()
    ) || categories.find(c => c.type === 'expense') || categories[0];

    const account = parsedReceipt.accountName
      ? accounts.find(a => a.name.toLowerCase() === parsedReceipt.accountName?.toLowerCase())
      : accounts[0];

    const transaction: Transaction = {
      id: uuidv4(),
      date: new Date(parsedReceipt.date || new Date()).toISOString(),
      amount: parsedReceipt.amount || parsedReceipt.receiptData?.total || 0,
      currency: parsedReceipt.currency || baseCurrency,
      categoryId: category?.id || categories[0]?.id,
      accountId: account?.id || accounts[0]?.id,
      type: 'expense',
      note: parsedReceipt.note || parsedReceipt.receiptData?.merchant || '',
      subcategory: parsedReceipt.subcategory,
      receiptData: parsedReceipt.receiptData,
      fees: parsedReceipt.fees
    };

    onTransactionCreated(transaction);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 backdrop-blur-sm p-4" onClick={handleClose}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={MOTION.modal.initial}
        animate={MOTION.modal.animate}
        exit={MOTION.modal.exit}
        transition={MOTION.modal.spring}
        className="bg-surface-container-high w-full max-w-lg rounded-xl shadow-elevation-3 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 flex justify-between items-center border-b border-outline-variant">
          <h3 className="text-lg font-display font-medium text-on-surface flex items-center gap-2">
            <Camera size={20} className="text-primary" />
            {t.scanReceipt}
          </h3>
          <button
            onClick={handleClose}
            className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-highest rounded-full transition-colors text-on-surface-variant"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4 relative">
          {/* Processing Overlay */}
          {isProcessingImage && (
            <div className="absolute inset-0 bg-surface-container-high/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
              <Loader2 size={40} className="text-primary animate-spin" />
              <p className="text-on-surface font-medium">
                {t.loadingImage}
              </p>
            </div>
          )}

          {/* Upload Area */}
          {!imagePreview && !isProcessingImage && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
                ${isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-outline-variant hover:border-primary hover:bg-surface-container'
                }
              `}
              onClick={openPicker}
            >
              {/* Hidden file input for web fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept={RECEIPT_IMAGE_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                {isPickerLoading || isProcessingImage ? (
                  <Loader2 className="text-primary animate-spin" size={32} />
                ) : (
                  <Upload className="text-primary" size={32} />
                )}
              </div>
              <p className="text-on-surface font-medium mb-1">
                {isProcessingImage 
                  ? t.loading
                  : t.addReceiptImage
                }
              </p>
              <p className="text-sm text-on-surface-variant">
                {t.takeOrChoosePhoto}
              </p>
            </div>
          )}

          {/* Error Display (when no image) */}
          {!imagePreview && error && (
            <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error/30 rounded-lg">
              <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-on-surface">{error}</p>
            </div>
          )}

          {/* Image Preview */}
          {imagePreview && !parsedReceipt && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden bg-surface-container">
                <img
                  src={imagePreview}
                  alt={t.receiptPreviewAlt}
                  className="w-full max-h-64 object-contain"
                />
                <button
                  onClick={() => { setImagePreview(null); setError(null); }}
                  className="absolute top-2 right-2 p-2 bg-surface-container-high/90 rounded-full hover:bg-error-container transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-error-container/20 border border-error/30 rounded-lg">
                  <AlertCircle className="text-error flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-sm text-on-surface">{error}</p>
                </div>
              )}

              <button
                onClick={handleScan}
                disabled={isScanning}
                className="w-full py-3 bg-primary text-on-primary rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-elevation-1"
              >
                {isScanning ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    {t.analyzing}
                  </>
                ) : (
                  <>
                    <Camera size={20} />
                    {t.scanReceipt}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Parsed Results */}
          {parsedReceipt && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-tertiary mb-4">
                <Check size={20} />
                <span className="font-medium">{t.receiptScanned}</span>
              </div>

              {/* Summary Card */}
              <div className="bg-surface-container rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant text-sm">{t.merchant}</span>
                  <span className="font-medium text-on-surface">{parsedReceipt.receiptData?.merchant || parsedReceipt.note}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant text-sm">{t.total}</span>
                  <span className="font-display font-bold text-xl text-on-surface">
                    {formatMoney(parsedReceipt.receiptData?.total || parsedReceipt.amount, parsedReceipt.currency, language)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant text-sm">{t.category}</span>
                  <span className="font-medium text-on-surface">{parsedReceipt.categoryName}</span>
                </div>
                {parsedReceipt.fees && parsedReceipt.fees > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-on-surface-variant text-sm">{t.feesOptional}</span>
                    <span className="font-medium text-on-surface">{formatMoney(parsedReceipt.fees, 'USD', language)}</span>
                  </div>
                )}
              </div>

              {/* Items List - Editable */}
              {parsedReceipt.receiptData?.items && (
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-on-surface-variant">{t.items}</h4>
                    <button
                      onClick={() => {
                        const newItem = { name: 'New Item', price: 0, quantity: 1 };
                        setParsedReceipt(prev => {
                          if (!prev || !prev.receiptData) return prev;
                          return {
                            ...prev,
                            receiptData: {
                              ...prev.receiptData,
                              items: [...prev.receiptData.items, newItem]
                            }
                          };
                        });
                      }}
                      className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title={t.addItem}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {parsedReceipt.receiptData.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm group">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const qty = parseInt(e.target.value) || 1;
                            setParsedReceipt(prev => {
                              if (!prev || !prev.receiptData) return prev;
                              return {
                                ...prev,
                                receiptData: {
                                  ...prev.receiptData,
                                  items: prev.receiptData.items.map((it, i) =>
                                    i === idx ? { ...it, quantity: qty } : it
                                  )
                                }
                              };
                            });
                          }}
                          className="w-10 bg-surface-container-high border-none rounded px-1.5 py-1 text-center text-on-surface"
                          min="1"
                        />
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            setParsedReceipt(prev => {
                              if (!prev || !prev.receiptData) return prev;
                              return {
                                ...prev,
                                receiptData: {
                                  ...prev.receiptData,
                                  items: prev.receiptData.items.map((it, i) =>
                                    i === idx ? { ...it, name: e.target.value } : it
                                  )
                                }
                              };
                            });
                          }}
                          className="flex-1 bg-surface-container-high border-none rounded px-2 py-1 text-on-surface min-w-0"
                        />
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => {
                            const price = parseFloat(e.target.value) || 0;
                            setParsedReceipt(prev => {
                              if (!prev || !prev.receiptData) return prev;
                              const newItems = prev.receiptData.items.map((it, i) =>
                                i === idx ? { ...it, price } : it
                              );
                              const newTotal = newItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
                              return {
                                ...prev,
                                amount: newTotal,
                                receiptData: {
                                  ...prev.receiptData,
                                  items: newItems,
                                  total: newTotal
                                }
                              };
                            });
                          }}
                          step="0.01"
                          className="w-20 bg-surface-container-high border-none rounded px-2 py-1 text-right font-mono text-on-surface"
                        />
                        <button
                          onClick={() => {
                            setParsedReceipt(prev => {
                              if (!prev || !prev.receiptData) return prev;
                              const newItems = prev.receiptData.items.filter((_, i) => i !== idx);
                              const newTotal = newItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
                              return {
                                ...prev,
                                amount: newTotal,
                                receiptData: {
                                  ...prev.receiptData,
                                  items: newItems,
                                  total: newTotal
                                }
                              };
                            });
                          }}
                          className="p-1 text-error/60 hover:text-error hover:bg-error/10 rounded opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {parsedReceipt.receiptData.items.length === 0 && (
                    <p className="text-sm text-on-surface-variant/60 text-center py-2">
                      {t.noItems}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setParsedReceipt(null); setImagePreview(null); }}
                  className="flex-1 py-3 bg-surface-container text-on-surface rounded-lg font-medium hover:bg-surface-container-highest transition-colors"
                >
                  {t.scanAnother}
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3 bg-primary text-on-primary rounded-lg font-medium flex items-center justify-center gap-2 hover:shadow-elevation-1 transition-all"
                >
                  <Check size={18} />
                  {t.addTransactionAction}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Image Picker Bottom Sheet */}
      <ImagePickerSheet
        isOpen={isPickerOpen}
        onClose={closePicker}
        onSelectCamera={handleCameraSelect}
        onSelectGallery={handleGallerySelect}
        language={language}
        title={t.addReceiptImageTitle}
      />
    </div>
  );
};

