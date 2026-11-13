import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { X, Camera, Loader2, AlertCircle, Check, Trash2, Plus, ScanLine, QrCode, ShieldCheck, ChevronRight, ChevronLeft, Info, Users } from 'lucide-react';
import { Category, Account, Currency, Person, Transaction } from '../types';
import { TRANSLATIONS } from '../constants';
import { formatMoney } from '../utils/locale';
import { scanReceipt, ParsedReceipt, isAIAvailable } from '../services/aiService';
import { v4 as uuidv4 } from 'uuid';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { useImagePicker, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { MOTION } from '../config';
import { useDialog } from '../hooks/useFocusTrap';
import { isSupportedReceiptImageType, RECEIPT_IMAGE_ACCEPT } from '../utils/receiptImage';
import { processImage } from '../utils/imageResize';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { QrScanner } from './receipt-scan/QrScanner';
import { decodeQrFromImage } from './receipt-scan/qr';
import { parseFiscalUrl, type FiscalReceipt } from '../utils/fiscalReceipt';
import { importFiscalReceipt } from '../services/fiscalReceiptService';
import { SplitAssign } from './receipt-scan/SplitAssign';
import { receiptItemsForSplit } from '../domain/receiptSplit';
import { excludeOwnProfile } from '../domain/people';
import type { SplitPrefill } from './split-expense/types';

/** What the result screen needs to know about a receipt imported from a fiscal QR code. */
interface FiscalInfo {
  partial: boolean;
  refund: boolean;
  notSale: boolean;
}

interface ReceiptScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  accounts: Account[];
  baseCurrency: Currency;
  language: 'en' | 'sr';
  onTransactionCreated: (transaction: Transaction) => void;
  /** A receipt image (data URL) shared into the app from another app; shown preloaded. */
  initialImage?: string | null;
  /** People to split the receipt with; enables "Split this receipt" together with `onSplitRequested`. */
  people?: Person[];
  userProfile?: Person;
  onAddPerson?: (name: string) => Promise<void>;
  /** Hands the worked-out split to the split expense flow. */
  onSplitRequested?: (prefill: SplitPrefill) => void;
}

export const ReceiptScanModal: React.FC<ReceiptScanModalProps> = ({
  isOpen,
  onClose,
  categories,
  accounts,
  baseCurrency,
  language,
  onTransactionCreated,
  initialImage,
  people: allPeople = [],
  userProfile,
  onAddPerson,
  onSplitRequested,
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
  const [isQrOpen, setIsQrOpen] = useState(false);
  // Fiscal receipt URL found in the QR code of the current photo, if any.
  const [photoFiscalUrl, setPhotoFiscalUrl] = useState<string | null>(null);
  const [fiscalInfo, setFiscalInfo] = useState<FiscalInfo | null>(null);
  const [scanMode, setScanMode] = useState<'fiscal' | 'ai'>('ai');
  const [isSplitting, setIsSplitting] = useState(false);
  // The built-in "me" is the user, so their own profile is not offered as someone to split with.
  const splitPeople = useMemo(() => excludeOwnProfile(allPeople, userProfile), [allPeople, userProfile]);
  const qrDetection = useRef<Promise<string | null> | null>(null);

  // An image shared into the app (Android share sheet) opens preloaded, ready to scan.
  React.useEffect(() => {
    if (!isOpen || !initialImage) return;
    setImagePreview(initialImage);
    setParsedReceipt(null);
    setError(null);
  }, [isOpen, initialImage]);

  const unsupportedFileMessage = t.receiptUnsupportedFile;

  const resetState = () => {
    setImagePreview(null);
    setIsScanning(false);
    setIsProcessingImage(false);
    setError(null);
    setParsedReceipt(null);
    setIsDragging(false);
    setIsQrOpen(false);
    setPhotoFiscalUrl(null);
    setFiscalInfo(null);
    setIsSplitting(false);
  };

  // Look for a fiscal receipt QR code in every new photo; it beats reading the photo with AI.
  useEffect(() => {
    setPhotoFiscalUrl(null);
    if (!imagePreview) {
      qrDetection.current = null;
      return;
    }
    let cancelled = false;
    const detection = decodeQrFromImage(imagePreview)
      .then((text) => (text ? parseFiscalUrl(text)?.url ?? null : null))
      .catch(() => null);
    qrDetection.current = detection;
    void detection.then((url) => {
      if (!cancelled) setPhotoFiscalUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [imagePreview]);

  const handleClose = () => {
    resetState();
    onClose();
  };
  const { dialogProps, titleId } = useDialog(isOpen, handleClose);
  const { wrapRef, handleProps } = useSheetDrag(handleClose);

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

  // Drag and drop: downscale to WebP like the picker paths before preview/scan.
  const handleFileSelect = async (file: File) => {
    if (!isSupportedReceiptImageType(file.type)) {
      setError(unsupportedFileMessage);
      return;
    }

    setIsProcessingImage(true);
    setError(null);
    try {
      const processed = await processImage(file, { fileName: 'receipt' });
      setImagePreview(processed.dataUrl);
      setParsedReceipt(null);
    } catch (err) {
      console.error('Drop image error:', err);
      setError(t.imageLoadFailed);
    } finally {
      setIsProcessingImage(false);
    }
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

  const fiscalToParsed = (receipt: FiscalReceipt): ParsedReceipt => {
    const refund = receipt.transactionType === 1;
    const pool = categories.filter(c => c.type === (refund ? 'income' : 'expense'));
    const suggested = receipt.categoryName?.toLowerCase();
    const categoryName =
      (!refund && suggested ? pool.find(c => c.name.toLowerCase() === suggested)?.name : undefined) ??
      (refund ? pool.find(c => /refund|povra/i.test(c.name))?.name : undefined) ??
      pool[0]?.name ??
      categories[0]?.name ??
      '';
    const account = accounts.find(a => a.currency === receipt.currency) ?? accounts[0];
    return {
      amount: receipt.total,
      currency: receipt.currency,
      categoryName,
      type: 'expense',
      note: receipt.merchant,
      date: receipt.date,
      accountName: account?.name,
      receiptData: {
        items: receipt.items.map(item => ({ name: item.name, price: item.unitPrice, quantity: item.quantity })),
        total: receipt.total,
        merchant: receipt.merchant,
      },
    };
  };

  // Imports a receipt from the URL in its fiscal QR code (Serbian Tax Administration portal).
  const handleFiscalUrl = async (url: string) => {
    setIsQrOpen(false);
    setScanMode('fiscal');
    setIsScanning(true);
    setError(null);
    try {
      const result = await importFiscalReceipt(url, categories);
      if (!result.ok) {
        const messages = {
          notFiscal: t.fiscalNotFiscal,
          offline: t.fiscalOffline,
          unavailable: t.fiscalUnavailable,
          failed: t.fiscalFailed,
        } as const;
        setError(messages[result.reason]);
        vibrate(HAPTIC_PATTERNS.error);
        return;
      }
      const { receipt } = result;
      setParsedReceipt(fiscalToParsed(receipt));
      setFiscalInfo({
        partial: receipt.partial,
        refund: receipt.transactionType === 1,
        notSale: receipt.invoiceType !== 0,
      });
      vibrate(HAPTIC_PATTERNS.success);
    } finally {
      setIsScanning(false);
    }
  };

  const handleScan = async (useAi = false) => {
    if (!imagePreview) return;

    if (!useAi) {
      // A fiscal QR code in the photo gives exact items, so try that before AI.
      setScanMode('fiscal');
      setIsScanning(true);
      const fiscalUrl = photoFiscalUrl ?? (await qrDetection.current);
      if (fiscalUrl) {
        await handleFiscalUrl(fiscalUrl);
        return;
      }
      setIsScanning(false);
    }

    if (!isAIAvailable()) {
      setError(t.aiNotConfigured);
      return;
    }

    setScanMode('ai');
    setIsScanning(true);
    setError(null);
    setFiscalInfo(null);

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

  // Category and account the scan suggested, falling back to the first sensible ones.
  const resolveTargets = (receipt: ParsedReceipt) => {
    const category = categories.find(c =>
      c.name.toLowerCase() === receipt.categoryName.toLowerCase()
    ) || categories.find(c => c.type === 'expense') || categories[0];

    const account = receipt.accountName
      ? accounts.find(a => a.name.toLowerCase() === receipt.accountName?.toLowerCase())
      : accounts[0];
    return { category, account };
  };

  const handleConfirm = () => {
    if (!parsedReceipt) return;

    vibrate(HAPTIC_PATTERNS.success);

    const { category, account } = resolveTargets(parsedReceipt);

    const transaction: Transaction = {
      id: uuidv4(),
      date: new Date(parsedReceipt.date || new Date()).toISOString(),
      amount: parsedReceipt.amount || parsedReceipt.receiptData?.total || 0,
      currency: parsedReceipt.currency || baseCurrency,
      categoryId: category?.id || categories[0]?.id,
      accountId: account?.id || accounts[0]?.id,
      // A fiscal refund receipt is money coming back.
      type: fiscalInfo?.refund ? 'income' : 'expense',
      note: parsedReceipt.note || parsedReceipt.receiptData?.merchant || '',
      subcategory: parsedReceipt.subcategory,
      receiptData: parsedReceipt.receiptData,
      fees: parsedReceipt.fees
    };

    onTransactionCreated(transaction);
    handleClose();
  };

  const splitItems = useMemo(
    () => receiptItemsForSplit(parsedReceipt?.receiptData?.items ?? []),
    [parsedReceipt],
  );
  const splitTotal = parsedReceipt ? parsedReceipt.receiptData?.total || parsedReceipt.amount : 0;
  const canSplit = Boolean(onSplitRequested && parsedReceipt && splitItems.length > 0 && splitTotal > 0 && !fiscalInfo?.refund);

  const handleSplitContinue = (split: { payerId: string; amounts: Record<string, number> }) => {
    if (!parsedReceipt || !onSplitRequested) return;
    const { category, account } = resolveTargets(parsedReceipt);
    vibrate(HAPTIC_PATTERNS.success);
    onSplitRequested({
      amount: splitTotal,
      currency: parsedReceipt.currency || baseCurrency,
      categoryId: category?.id || categories[0]?.id || '',
      accountId: account?.id || accounts[0]?.id || '',
      date: new Date(parsedReceipt.date || new Date()).toISOString(),
      note: parsedReceipt.note || parsedReceipt.receiptData?.merchant || '',
      receiptData: parsedReceipt.receiptData,
      payerId: split.payerId,
      amounts: split.amounts,
    });
    resetState();
  };

  type ReceiptItems = NonNullable<ParsedReceipt['receiptData']>['items'];
  // Edit the scanned items; price changes and removals also recompute the total.
  const editItems = (update: (items: ReceiptItems) => ReceiptItems, recomputeTotal: boolean) => {
    setParsedReceipt(prev => {
      if (!prev || !prev.receiptData) return prev;
      const items = update(prev.receiptData.items);
      if (!recomputeTotal) {
        return { ...prev, receiptData: { ...prev.receiptData, items } };
      }
      const total = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
      return { ...prev, amount: total, receiptData: { ...prev.receiptData, items, total } };
    });
  };

  if (!isOpen) return null;

  const matchedCategory = parsedReceipt
    ? categories.find(c => c.name.toLowerCase() === parsedReceipt.categoryName.toLowerCase())
    : undefined;

  const errorBox = error && (
    <div role="alert" className="flex items-start gap-2 rounded-[16px] bg-neg/10 px-4 py-3">
      <AlertCircle className="mt-0.5 shrink-0 text-neg" size={18} aria-hidden="true" />
      <p className="text-[14px] text-on-surface">{error}</p>
    </div>
  );

  return (
    <div className="modal-safe-area fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <m.div
        className="paper-scrim absolute inset-0"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={MOTION.backdrop}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div ref={wrapRef} className="relative flex w-full justify-center">
      <m.div
        {...dialogProps}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={MOTION.sheet.exit}
        transition={MOTION.sheet.spring}
        className="glass-sheet flex max-h-[90dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-[36px] text-on-surface outline-none"
      >
        {/* Header */}
        <div className="shrink-0 touch-none" {...handleProps}>
          <div className="paper-grab mx-auto mt-2 h-[5px] w-9 rounded-full md:hidden" aria-hidden="true" />
          <div className="flex items-center gap-3 px-5 pb-3 pt-2 md:pt-5">
            {isSplitting ? (
              <button
                type="button"
                onClick={() => setIsSplitting(false)}
                aria-label={t.back}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent"
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
            ) : (
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
                <ScanLine size={20} />
              </span>
            )}
            <h3 id={titleId} className="flex-1 text-[22px] font-bold tracking-[-0.4px]">
              {isSplitting ? t.splitReceiptTitle : t.scanReceipt}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t.close}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 custom-scrollbar">
          {/* Processing Overlay */}
          {(isProcessingImage || (isScanning && !imagePreview)) && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" role="status">
              <Loader2 size={36} className="animate-spin text-accent" aria-hidden="true" />
              <p className="text-[15px] font-semibold">
                {isProcessingImage ? t.loadingImage : t.fiscalLoading}
              </p>
            </div>
          )}

          {/* Upload Area */}
          {!imagePreview && !parsedReceipt && !isProcessingImage && !isScanning && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={openPicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openPicker();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={t.addReceiptImage}
              className={clsx(
                'cursor-pointer rounded-[26px] border-2 border-dashed px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent',
                isDragging ? 'border-accent bg-accent-soft' : 'border-hair bg-chip/60 hover:bg-chip'
              )}
            >
              {/* Hidden file input for web fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept={RECEIPT_IMAGE_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-accent text-on-accent shadow-[0_10px_24px_-10px_rgb(var(--accent-rgb))]">
                {isPickerLoading || isProcessingImage ? (
                  <Loader2 className="animate-spin" size={28} aria-hidden="true" />
                ) : (
                  <Camera size={28} aria-hidden="true" />
                )}
              </div>
              <p className="mb-1 text-[16px] font-semibold">
                {isProcessingImage
                  ? t.loading
                  : t.addReceiptImage
                }
              </p>
              <p className="text-[14px] text-muted">
                {t.takeOrChoosePhoto}
              </p>
            </div>
          )}

          {/* Serbian fiscal receipts: read the QR code live instead of photographing the whole receipt. */}
          {!imagePreview && !parsedReceipt && !isProcessingImage && !isScanning && (
            <button
              type="button"
              onClick={() => { setError(null); setIsQrOpen(true); }}
              className="paper-tile flex w-full items-center gap-3 p-3.5 text-left outline-none transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
                <QrCode size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{t.scanQrCode}</span>
                <span className="block text-[13px] text-muted">{t.scanQrCodeHint}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden="true" />
            </button>
          )}

          {/* Error Display (when no image) */}
          {!imagePreview && !parsedReceipt && errorBox}

          {/* Image Preview */}
          {imagePreview && !parsedReceipt && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-[22px] bg-chip">
                <img
                  src={imagePreview}
                  alt={t.receiptPreviewAlt}
                  className="max-h-64 w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => { setImagePreview(null); setError(null); }}
                  aria-label={t.remove}
                  className="glass absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              {photoFiscalUrl && (
                <div className="flex items-center gap-2 rounded-[16px] bg-pos/10 px-4 py-2.5 text-pos" role="status">
                  <QrCode size={18} className="shrink-0" aria-hidden="true" />
                  <p className="text-[14px] font-semibold">{t.fiscalDetected}</p>
                </div>
              )}

              {errorBox}

              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={isScanning}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-semibold text-on-accent transition-opacity disabled:opacity-60"
              >
                {isScanning ? (
                  <>
                    <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                    {scanMode === 'fiscal' ? t.fiscalLoading : t.analyzing}
                  </>
                ) : photoFiscalUrl ? (
                  <>
                    <QrCode size={20} aria-hidden="true" />
                    {t.fiscalImport}
                  </>
                ) : (
                  <>
                    <ScanLine size={20} aria-hidden="true" />
                    {t.scanReceipt}
                  </>
                )}
              </button>
              {photoFiscalUrl && !isScanning && (
                <button
                  type="button"
                  onClick={() => void handleScan(true)}
                  className="mx-auto flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-accent"
                >
                  <ScanLine size={16} aria-hidden="true" />
                  {t.readWithAi}
                </button>
              )}
            </div>
          )}

          {/* Splitting the receipt between people */}
          {parsedReceipt && isSplitting && (
            <SplitAssign
              items={splitItems}
              receiptTotal={splitTotal}
              currency={parsedReceipt.currency || baseCurrency}
              language={language}
              people={splitPeople}
              selfProfile={userProfile}
              onAddPerson={onAddPerson}
              onContinue={handleSplitContinue}
            />
          )}

          {/* Parsed Results */}
          {parsedReceipt && !isSplitting && (
            <div className="space-y-4">
              {fiscalInfo && !fiscalInfo.partial ? (
                <div className="flex items-center gap-2 px-1 text-pos">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <span className="text-[15px] font-semibold">{t.fiscalVerified}</span>
                </div>
              ) : !fiscalInfo ? (
                <div className="flex items-center gap-2 px-1 text-pos">
                  <Check size={18} aria-hidden="true" />
                  <span className="text-[15px] font-semibold">{t.receiptScanned}</span>
                </div>
              ) : null}

              {fiscalInfo && [
                fiscalInfo.partial && t.fiscalPartial,
                fiscalInfo.refund && t.fiscalRefundNotice,
                fiscalInfo.notSale && t.fiscalNotSaleNotice,
              ].filter((notice): notice is string => Boolean(notice)).map(notice => (
                <div key={notice} role="status" className="flex items-start gap-2 rounded-[16px] bg-chip px-4 py-3">
                  <Info className="mt-0.5 shrink-0 text-muted" size={18} aria-hidden="true" />
                  <p className="text-[14px] text-on-surface">{notice}</p>
                </div>
              ))}

              {/* Summary Card */}
              <div className="paper-tile p-4">
                <p className="text-[13px] font-semibold text-muted">{parsedReceipt.receiptData?.merchant || parsedReceipt.note}</p>
                <p className="mt-0.5 text-[30px] font-bold leading-tight tracking-tight tabular-nums">
                  {formatMoney(parsedReceipt.receiptData?.total || parsedReceipt.amount, parsedReceipt.currency, language)}
                </p>
                <div className="mt-3 divide-y divide-hair border-t border-hair">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-[14px] text-muted">{t.merchant}</span>
                    <span className="truncate pl-3 text-[15px] font-semibold">{parsedReceipt.receiptData?.merchant || parsedReceipt.note}</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-[14px] text-muted">{t.category}</span>
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <CategoryGlyph category={matchedCategory ?? { name: parsedReceipt.categoryName, color: 'var(--paper-muted)' }} size={26} className="!rounded-[9px]" />
                      {parsedReceipt.categoryName}
                    </span>
                  </div>
                  {parsedReceipt.fees && parsedReceipt.fees > 0 && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-[14px] text-muted">{t.feesOptional}</span>
                      <span className="text-[15px] font-semibold tabular-nums">{formatMoney(parsedReceipt.fees, 'USD', language)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List - Editable */}
              {parsedReceipt.receiptData?.items && (
                <div className="paper-tile p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[13px] font-semibold text-muted">{t.items}</h4>
                    <button
                      type="button"
                      onClick={() => editItems(items => [...items, { name: t.newItem, price: 0, quantity: 1 }], false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent"
                      title={t.addItem}
                      aria-label={t.addItem}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {parsedReceipt.receiptData.items.map((item, idx) => (
                      <div key={idx} className="group flex items-center gap-1.5 text-[14px]">
                        <input
                          type="number"
                          aria-label={t.qty}
                          value={item.quantity}
                          onChange={(e) => {
                            // Weighed items (0,754 kg) need decimals.
                            const parsed = parseFloat(e.target.value);
                            const qty = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                            editItems(items => items.map((it, i) => i === idx ? { ...it, quantity: qty } : it), true);
                          }}
                          className="h-9 w-12 shrink-0 rounded-[10px] border-none bg-chip px-1 text-center tabular-nums text-on-surface outline-none focus:ring-2 focus:ring-accent"
                          min="0"
                          step="any"
                          inputMode="decimal"
                        />
                        <input
                          type="text"
                          aria-label={t.name}
                          value={item.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            editItems(items => items.map((it, i) => i === idx ? { ...it, name } : it), false);
                          }}
                          className="h-9 min-w-0 flex-1 rounded-[10px] border-none bg-chip px-2.5 text-on-surface outline-none focus:ring-2 focus:ring-accent"
                        />
                        <input
                          type="number"
                          aria-label={t.amount}
                          value={item.price}
                          onChange={(e) => {
                            const price = parseFloat(e.target.value) || 0;
                            editItems(items => items.map((it, i) => i === idx ? { ...it, price } : it), true);
                          }}
                          step="0.01"
                          className="h-9 w-20 shrink-0 rounded-[10px] border-none bg-chip px-2.5 text-right font-semibold tabular-nums text-on-surface outline-none focus:ring-2 focus:ring-accent"
                        />
                        <button
                          type="button"
                          onClick={() => editItems(items => items.filter((_, i) => i !== idx), true)}
                          aria-label={t.remove}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neg transition-opacity hover:bg-neg/10 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {parsedReceipt.receiptData.items.length === 0 && (
                    <p className="py-2 text-center text-[14px] text-faint">
                      {t.noItems}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setParsedReceipt(null); setImagePreview(null); setFiscalInfo(null); setError(null); }}
                  className="h-12 flex-1 rounded-full bg-chip text-[15px] font-semibold text-on-surface"
                >
                  {t.scanAnother}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
                >
                  <Check size={18} aria-hidden="true" />
                  {t.addTransactionAction}
                </button>
              </div>
              {canSplit && (
                <button
                  type="button"
                  onClick={() => setIsSplitting(true)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-soft text-[15px] font-semibold text-accent"
                >
                  <Users size={18} aria-hidden="true" />
                  {t.splitThisReceipt}
                </button>
              )}
            </div>
          )}
        </div>
      </m.div>
      </div>

      {/* Image Picker Bottom Sheet */}
      <ImagePickerSheet
        isOpen={isPickerOpen}
        onClose={closePicker}
        onSelectCamera={handleCameraSelect}
        onSelectGallery={handleGallerySelect}
        language={language}
        title={t.addReceiptImageTitle}
      />

      <QrScanner
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        onResult={(url) => void handleFiscalUrl(url)}
        onChoosePhoto={() => { setIsQrOpen(false); openPicker(); }}
        labels={{
          title: t.scanQrCode,
          hint: t.fiscalQrHint,
          notFiscal: t.fiscalNotFiscal,
          cameraUnavailable: t.fiscalCameraUnavailable,
          choosePhoto: t.chooseFromGallery,
          torch: t.fiscalTorch,
          close: t.close,
        }}
      />
    </div>
  );
};
