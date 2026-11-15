import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { m } from 'motion/react';
import clsx from 'clsx';
import { X, Camera, Loader2, AlertCircle, Check, Trash2, Plus, ScanLine, QrCode, ShieldCheck, ChevronRight, ChevronLeft, ChevronDown, Info, Users, PenLine } from 'lucide-react';
import { Category, Account, Currency, ExchangeRates, Person, Transaction } from '../types';
import { toStoredFee } from '../domain/money';
import { TRANSLATIONS } from '../constants';
import { formatMoney } from '../utils/locale';
import { scanReceipt, ParsedReceipt, isAIAvailable } from '../services/aiService';
import { v4 as uuidv4 } from 'uuid';
import { vibrate, HAPTIC_PATTERNS } from '../utils/haptics';
import { useImagePicker, ImageResult } from '../hooks/useImagePicker';
import { ImagePickerSheet } from './ImagePickerSheet';
import { QrViewfinder } from './receipt-scan/QrViewfinder';
import { IconTile } from './ui/IconTile';
import { MOTION } from '../config';
import { useDialog } from '../hooks/useFocusTrap';
import { isSupportedReceiptImageType, RECEIPT_IMAGE_ACCEPT } from '../utils/receiptImage';
import { dataUrlToBlob, fetchAsBlob, processImage } from '../utils/imageResize';
import { withReceiptPhoto } from '../domain/receiptPhoto';
import { ReceiptPhotoError, uploadReceiptPhoto } from '../services/receiptPhotoService';
import { useSheetDrag } from '../hooks/useSheetDrag';
import { CategoryGlyph } from './ui/CategoryGlyph';
import { QrScanner } from './receipt-scan/QrScanner';
import { classifyScannedQr, decodeQrFromImage, type ScannedQr } from './receipt-scan/qr';
import type { FiscalReceipt } from '../utils/fiscalReceipt';
import { suggestIpsCategory, type IpsBill } from '../utils/ipsQr';
import { merchantMemoryFor, usualChoice } from '../domain/merchantMemory';
import { importFiscalReceipt } from '../services/fiscalReceiptService';
import { SplitAssign } from './receipt-scan/SplitAssign';
import { receiptItemsForSplit } from '../domain/receiptSplit';
import { fiscalDetails } from '../domain/receiptDetails';
import { excludeOwnProfile } from '../domain/people';
import type { SplitPrefill } from './split-expense/types';
import { AmountInput } from './ui/AmountInput';
import { defaultCategoryId, isSystemCategoryId } from '../domain/transactions';
import { localizeCategoryName } from '../utils/systemText';

/** What the result screen needs to know about a receipt imported from a fiscal QR code. */
interface FiscalInfo {
  partial: boolean;
  refund: boolean;
  notSale: boolean;
}

/** What the result screen needs to know about a bill read from its IPS QR code. */
interface BillInfo {
  /** The bill leaves the amount to the payer. */
  noAmount: boolean;
}

interface ReceiptScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  accounts: Account[];
  baseCurrency: Currency;
  /** Turns a fee read off the receipt (in the receipt currency) into the stored USD fee. */
  rates: ExchangeRates;
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
  /** Transaction history for the user's usual category per payee (scanned IPS bills). */
  transactions?: Transaction[];
}

export const ReceiptScanModal: React.FC<ReceiptScanModalProps> = ({
  isOpen,
  onClose,
  categories,
  accounts,
  baseCurrency,
  rates,
  language,
  onTransactionCreated,
  initialImage,
  people: allPeople = [],
  userProfile,
  onAddPerson,
  onSplitRequested,
  transactions,
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
  // Fiscal receipt or IPS bill QR code found in the current photo, if any.
  const [photoQr, setPhotoQr] = useState<ScannedQr | null>(null);
  const [fiscalInfo, setFiscalInfo] = useState<FiscalInfo | null>(null);
  const [billInfo, setBillInfo] = useState<BillInfo | null>(null);
  const [scanMode, setScanMode] = useState<'fiscal' | 'ai'>('ai');
  const [isSplitting, setIsSplitting] = useState(false);
  // What the result will be saved as: shown and editable on the result screen.
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isManualEntry, setIsManualEntry] = useState(false);
  // The built-in "me" is the user, so their own profile is not offered as someone to split with.
  const splitPeople = useMemo(() => excludeOwnProfile(allPeople, userProfile), [allPeople, userProfile]);
  const qrDetection = useRef<Promise<ScannedQr | null> | null>(null);
  // The full-size photo behind the (downscaled) preview, for the QR search only.
  const originalImage = useRef<Blob | null>(null);
  // Keep the scanned photo with the entry (private Storage); needs a connection when saving.
  const [keepPhoto, setKeepPhoto] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // An image shared into the app (Android share sheet) opens preloaded, ready to scan.
  React.useEffect(() => {
    if (!isOpen || !initialImage) return;
    originalImage.current = null;
    setImagePreview(initialImage);
    setParsedReceipt(null);
    setError(null);
  }, [isOpen, initialImage]);

  const unsupportedFileMessage = t.receiptUnsupportedFile;

  const resetState = () => {
    setPhotoError(null);
    setSavingPhoto(false);
    originalImage.current = null;
    setImagePreview(null);
    setIsScanning(false);
    setIsProcessingImage(false);
    setError(null);
    setParsedReceipt(null);
    setIsDragging(false);
    setIsQrOpen(false);
    setPhotoQr(null);
    setFiscalInfo(null);
    setBillInfo(null);
    setIsSplitting(false);
    setTargetCategoryId('');
    setTargetAccountId('');
    setTargetDate('');
    setIsManualEntry(false);
  };

  // Look for a fiscal receipt or IPS bill QR code in every new photo; it beats reading the photo with AI.
  useEffect(() => {
    setPhotoQr(null);
    if (!imagePreview) {
      qrDetection.current = null;
      return;
    }
    let cancelled = false;
    const detection = decodeQrFromImage(originalImage.current ?? imagePreview)
      .then((text) => (text ? classifyScannedQr(text) : null))
      .catch(() => null);
    qrDetection.current = detection;
    void detection.then((found) => {
      if (!cancelled) setPhotoQr(found);
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
        originalImage.current = null;
        setImagePreview(null);
        setParsedReceipt(null);
        setError(unsupportedFileMessage);
        return;
      }
      originalImage.current = result.original ?? null;
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
      originalImage.current = file;
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

  const fiscalToParsed = (receipt: FiscalReceipt, url: string): ParsedReceipt => {
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
        ...fiscalDetails(receipt, url),
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
      presentReceipt(fiscalToParsed(receipt, url), receipt.transactionType === 1 ? 'income' : 'expense');
      setBillInfo(null);
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

  // Prefills an expense from a bill's IPS QR code (payment slip). Everything is in the code: no network.
  const handleIpsBill = (bill: IpsBill) => {
    setIsQrOpen(false);
    setError(null);
    setFiscalInfo(null);
    const expense = categories.filter(c => c.type === 'expense');
    const usual = transactions?.length ? usualChoice(merchantMemoryFor(transactions), bill.payee) : null;
    const usualCategory = usual ? expense.find(c => c.id === usual.categoryId) : undefined;
    const rule = usualCategory ? undefined : suggestIpsCategory(bill, expense);
    const categoryName = usualCategory?.name ?? rule?.categoryName ?? expense[0]?.name ?? categories[0]?.name ?? '';
    const usualAccount = usual?.accountId ? accounts.find(a => a.id === usual.accountId && a.currency === 'RSD') : undefined;
    const account = usualAccount ?? accounts.find(a => a.currency === 'RSD') ?? accounts[0];
    presentReceipt({
      amount: bill.amount,
      currency: 'RSD',
      categoryName,
      subcategory: rule?.subcategory,
      type: 'expense',
      note: bill.purpose ? `${bill.payee}, ${bill.purpose}` : bill.payee,
      date: new Date().toISOString(),
      accountName: account?.name,
      receiptData: {
        items: [{ name: bill.purpose || bill.payee, price: bill.amount, quantity: 1 }],
        total: bill.amount,
        merchant: bill.payee,
      },
    });
    setBillInfo({ noAmount: bill.amount <= 0 });
    vibrate(HAPTIC_PATTERNS.success);
  };

  const handleScannedQr = (found: ScannedQr) => {
    if (found.kind === 'ips') handleIpsBill(found.bill);
    else void handleFiscalUrl(found.url);
  };

  const handleScan = async (useAi = false) => {
    if (!imagePreview) return;

    if (!useAi) {
      // A fiscal or IPS QR code in the photo gives exact details, so try that before AI.
      setScanMode('fiscal');
      setIsScanning(true);
      const found = photoQr ?? (await qrDetection.current);
      if (found?.kind === 'fiscal') {
        await handleFiscalUrl(found.url);
        return;
      }
      setIsScanning(false);
      if (found?.kind === 'ips') {
        handleIpsBill(found.bill);
        return;
      }
    }

    if (!isAIAvailable()) {
      setError(t.aiNotConfigured);
      return;
    }

    setScanMode('ai');
    setIsScanning(true);
    setError(null);
    setFiscalInfo(null);
    setBillInfo(null);

    try {
      const result = await scanReceipt(imagePreview, categories, accounts);

      if (result) {
        presentReceipt(result);
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

  const resultType = fiscalInfo?.refund ? 'income' : 'expense';
  // Categories the result can be saved under: its own type, never a transfer or debt category.
  const categoryPool = categories.filter(c => c.type === resultType && !isSystemCategoryId(c.id));

  /** Shows a receipt on the result screen with the category, wallet and date it will be saved with. */
  const presentReceipt = (receipt: ParsedReceipt, type: 'expense' | 'income' = 'expense') => {
    const pool = categories.filter(c => c.type === type && !isSystemCategoryId(c.id));
    const named = receipt.categoryName.toLowerCase();
    const category = pool.find(c => c.name.toLowerCase() === named);
    const account = (receipt.accountName
      ? accounts.find(a => a.name.toLowerCase() === receipt.accountName?.toLowerCase())
      : undefined) ?? accounts.find(a => a.currency === receipt.currency) ?? accounts[0];
    const date = new Date(receipt.date || Date.now());
    setParsedReceipt(receipt);
    setIsManualEntry(false);
    setTargetCategoryId(category?.id ?? defaultCategoryId(type, categories, transactions ?? []));
    setTargetAccountId(account?.id ?? '');
    setTargetDate(Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString());
  };

  /** After a failed scan: the same result screen, empty, to type the receipt in by hand. */
  const enterManually = () => {
    const account = accounts[0];
    setError(null);
    setFiscalInfo(null);
    setBillInfo(null);
    presentReceipt({
      amount: 0,
      currency: account?.currency ?? baseCurrency,
      categoryName: '',
      type: 'expense',
      note: '',
      date: new Date().toISOString(),
      accountName: account?.name,
      receiptData: { items: [{ name: '', price: 0, quantity: 1 }], total: 0, merchant: '' },
    });
    setIsManualEntry(true);
  };

  const resultTotal = parsedReceipt ? parsedReceipt.receiptData?.total || parsedReceipt.amount || 0 : 0;
  const canConfirm = resultTotal > 0 && !!targetAccountId;

  const handleConfirm = async () => {
    if (!parsedReceipt || !canConfirm || savingPhoto) return;

    let photo: string | null = null;
    if (keepPhoto && imagePreview) {
      setSavingPhoto(true);
      setPhotoError(null);
      try {
        const blob = imagePreview.startsWith('data:') ? dataUrlToBlob(imagePreview) : await fetchAsBlob(imagePreview);
        photo = await uploadReceiptPhoto(blob);
      } catch (photoFailure) {
        const reason = photoFailure instanceof ReceiptPhotoError ? photoFailure.reason : 'upload';
        // Nothing is saved yet: the user can try again or switch the photo off and save.
        setPhotoError(
          reason === 'offline' ? t.receiptPhotoOffline
            : reason === 'too-large' ? t.receiptPhotoTooLarge
              : reason === 'unsupported' ? t.receiptPhotoUnsupported
                : t.receiptPhotoFailed,
        );
        setSavingPhoto(false);
        return;
      }
      setSavingPhoto(false);
    }

    vibrate(HAPTIC_PATTERNS.success);

    const currency = parsedReceipt.currency || baseCurrency;
    const transaction: Transaction = {
      id: uuidv4(),
      date: targetDate || new Date().toISOString(),
      amount: parsedReceipt.amount || parsedReceipt.receiptData?.total || 0,
      currency,
      categoryId: targetCategoryId || defaultCategoryId(resultType, categories, transactions ?? []),
      accountId: targetAccountId,
      // A fiscal refund receipt is money coming back.
      type: resultType,
      note: parsedReceipt.note || parsedReceipt.receiptData?.merchant || '',
      // The scan's subcategory only belongs to the category it suggested.
      subcategory: categories.find(c => c.id === targetCategoryId)?.subcategories?.includes(parsedReceipt.subcategory ?? '') ? parsedReceipt.subcategory : undefined,
      receiptData: parsedReceipt.receiptData,
      // The scan reads the fee in the receipt currency; fees are stored in USD.
      fees: toStoredFee(parsedReceipt.fees, currency, rates)
    };

    onTransactionCreated(photo ? withReceiptPhoto(transaction, photo) : transaction);
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
    vibrate(HAPTIC_PATTERNS.success);
    onSplitRequested({
      amount: splitTotal,
      currency: parsedReceipt.currency || baseCurrency,
      categoryId: targetCategoryId || defaultCategoryId('expense', categories, transactions ?? []),
      accountId: targetAccountId || accounts[0]?.id || '',
      date: targetDate || new Date().toISOString(),
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

  const targetCategory = categories.find(c => c.id === targetCategoryId);
  const targetDay = (() => {
    const date = new Date(targetDate);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })();
  const merchantText = parsedReceipt ? parsedReceipt.receiptData?.merchant ?? parsedReceipt.note : '';
  const setMerchant = (merchant: string) =>
    setParsedReceipt(prev => {
      if (!prev) return prev;
      const previous = prev.receiptData?.merchant ?? '';
      // A note that only repeated the shop name follows it.
      const note = !prev.note || prev.note === previous ? merchant : prev.note;
      return {
        ...prev,
        note,
        receiptData: { items: prev.receiptData?.items ?? [], total: prev.receiptData?.total ?? prev.amount, merchant },
      };
    });

  const errorBox = error && (
    <div role="alert" className="flex items-start gap-2 rounded-[16px] bg-neg/10 px-4 py-3">
      <AlertCircle className="mt-0.5 shrink-0 text-neg" size={18} aria-hidden="true" />
      <p className="text-[14px] text-on-surface">{error}</p>
    </div>
  );
  const manualButton = error && !isScanning && (
    <button
      type="button"
      onClick={enterManually}
      className="mx-auto flex h-11 items-center justify-center gap-1.5 rounded-full bg-chip px-4 text-[14px] font-semibold"
    >
      <PenLine size={16} aria-hidden="true" />
      {t.enterManually}
    </button>
  );
  const fieldRowSelect = 'h-10 min-w-0 max-w-full appearance-none truncate rounded-[12px] bg-chip pl-3 pr-8 text-right text-[15px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-accent';

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
            {/* 36px chip, 44px hit area (the negative margin keeps the header height). */}
            <button
              type="button"
              onClick={handleClose}
              aria-label={t.close}
              className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip">
                <X size={18} aria-hidden="true" />
              </span>
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

          {/* Serbian fiscal receipts: read the QR code live instead of photographing the whole receipt.
              The fastest and most exact path, so it leads. */}
          {!imagePreview && !parsedReceipt && !isProcessingImage && !isScanning && (
            <button
              type="button"
              onClick={() => { setError(null); setIsQrOpen(true); }}
              className="flex w-full items-center gap-4 rounded-[26px] bg-accent-soft p-4 text-left shadow-[inset_0_0_0_2px_rgb(var(--accent-rgb))] outline-none transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <QrViewfinder size={84} />
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-bold leading-tight">{t.scanQrCode}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.scanQrCodeHint}</span>
              </span>
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                <ChevronRight size={18} />
              </span>
            </button>
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
                'flex cursor-pointer items-center gap-4 rounded-[26px] border-2 border-dashed p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent',
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
              <IconTile icon={isPickerLoading || isProcessingImage ? Loader2 : Camera} size={52} className={isPickerLoading || isProcessingImage ? '[&_svg]:animate-spin' : undefined} />
              <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-[16px] font-semibold">
                {isProcessingImage
                  ? t.loading
                  : t.addReceiptImage
                }
              </p>
              <p className="text-[13px] leading-snug text-muted">
                {t.takeOrChoosePhoto}
              </p>
              </div>
            </div>
          )}

          {/* Error Display (when no image) */}
          {!imagePreview && !parsedReceipt && errorBox}
          {!imagePreview && !parsedReceipt && manualButton}

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
                  onClick={() => { originalImage.current = null; setImagePreview(null); setError(null); }}
                  aria-label={t.remove}
                  className="glass absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              {photoQr && (
                <div className="flex items-center gap-2 rounded-[16px] bg-pos/10 px-4 py-2.5 text-pos" role="status">
                  <QrCode size={18} className="shrink-0" aria-hidden="true" />
                  <p className="text-[14px] font-semibold">{photoQr.kind === 'ips' ? t.ipsBillDetected : t.fiscalDetected}</p>
                </div>
              )}

              {errorBox}
              {manualButton}

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
                ) : photoQr ? (
                  <>
                    <QrCode size={20} aria-hidden="true" />
                    {photoQr.kind === 'ips' ? t.ipsBillImport : t.fiscalImport}
                  </>
                ) : (
                  <>
                    <ScanLine size={20} aria-hidden="true" />
                    {t.scanReceipt}
                  </>
                )}
              </button>
              {photoQr && !isScanning && (
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
              {isManualEntry ? null : billInfo ? (
                <div className="flex items-center gap-2 px-1 text-pos">
                  <QrCode size={18} aria-hidden="true" />
                  <span className="text-[15px] font-semibold">{t.ipsBillScanned}</span>
                </div>
              ) : fiscalInfo && !fiscalInfo.partial ? (
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

              {(fiscalInfo || billInfo) && [
                fiscalInfo?.partial && t.fiscalPartial,
                fiscalInfo?.refund && t.fiscalRefundNotice,
                fiscalInfo?.notSale && t.fiscalNotSaleNotice,
                billInfo?.noAmount && t.ipsBillNoAmount,
              ].filter((notice): notice is string => Boolean(notice)).map(notice => (
                <div key={notice} role="status" className="flex items-start gap-2 rounded-[16px] bg-chip px-4 py-3">
                  <Info className="mt-0.5 shrink-0 text-muted" size={18} aria-hidden="true" />
                  <p className="text-[14px] text-on-surface">{notice}</p>
                </div>
              ))}

              {/* Summary Card */}
              <div className="paper-tile p-4">
                <p className="text-[13px] font-semibold text-muted">{merchantText}</p>
                <p className="mt-0.5 text-[30px] font-bold leading-tight tracking-tight tabular-nums">
                  {formatMoney(resultTotal, parsedReceipt.currency, language)}
                </p>
                <div className="mt-3 divide-y divide-hair border-t border-hair">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <label htmlFor="receipt-merchant" className="shrink-0 text-[14px] text-muted">{t.merchant}</label>
                    <input
                      id="receipt-merchant"
                      value={merchantText}
                      onChange={e => setMerchant(e.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-[12px] bg-chip px-3 text-right text-[15px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  {/* What is shown here is exactly what will be saved. */}
                  <div className="flex items-center justify-between gap-3 py-2">
                    <label htmlFor="receipt-category" className="shrink-0 text-[14px] text-muted">{t.category}</label>
                    <span className="flex min-w-0 items-center gap-2">
                      <CategoryGlyph category={targetCategory} size={26} className="shrink-0 !rounded-[9px]" />
                      <span className="relative min-w-0">
                        <select
                          id="receipt-category"
                          value={targetCategoryId}
                          onChange={e => setTargetCategoryId(e.target.value)}
                          className={fieldRowSelect}
                        >
                          {!categoryPool.some(c => c.id === targetCategoryId) && <option value={targetCategoryId}>{targetCategory ? localizeCategoryName(targetCategory, language) : t.chooseCategory}</option>}
                          {categoryPool.map(c => <option key={c.id} value={c.id}>{localizeCategoryName(c, language)}</option>)}
                        </select>
                        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <label htmlFor="receipt-wallet" className="shrink-0 text-[14px] text-muted">{t.wallet}</label>
                    <span className="relative min-w-0">
                      <select
                        id="receipt-wallet"
                        value={targetAccountId}
                        onChange={e => setTargetAccountId(e.target.value)}
                        className={fieldRowSelect}
                      >
                        {!targetAccountId && <option value="">{t.chooseWallet}</option>}
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                      </select>
                      <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <label htmlFor="receipt-date" className="shrink-0 text-[14px] text-muted">{t.date}</label>
                    <input
                      id="receipt-date"
                      type="date"
                      value={targetDay}
                      onChange={e => {
                        const [year, month, day] = e.target.value.split('-').map(Number);
                        if (!year || !month || !day) return;
                        const current = new Date(targetDate);
                        const next = new Date(year, month - 1, day);
                        if (Number.isFinite(current.getTime())) next.setHours(current.getHours(), current.getMinutes(), 0, 0);
                        else next.setHours(12, 0, 0, 0);
                        setTargetDate(next.toISOString());
                      }}
                      className="h-10 min-w-0 rounded-[12px] bg-chip px-3 text-[15px] font-semibold text-on-surface outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  {parsedReceipt.fees && parsedReceipt.fees > 0 && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-[14px] text-muted">{t.feesOptional}</span>
                      <span className="text-[15px] font-semibold tabular-nums">{formatMoney(parsedReceipt.fees, parsedReceipt.currency || baseCurrency, language)}</span>
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
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent"
                      title={t.addItem}
                      aria-label={t.addItem}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {parsedReceipt.receiptData.items.map((item, idx) => (
                      <div key={idx} className="group flex items-center gap-1.5 text-[14px]">
                        {/* Weighed items (0,754 kg) need decimals, typed in the app's number format. */}
                        <AmountInput
                          aria-label={t.qty}
                          language={language}
                          value={item.quantity}
                          emptyWhenZero
                          placeholder="1"
                          onValueChange={(qty) => {
                            const quantity = qty !== undefined && qty > 0 ? qty : 0;
                            editItems(items => items.map((it, i) => i === idx ? { ...it, quantity } : it), true);
                          }}
                          className="h-10 w-11 shrink-0 rounded-[10px] border-none bg-chip px-1 text-center tabular-nums text-on-surface outline-none focus:ring-2 focus:ring-accent"
                        />
                        <input
                          type="text"
                          aria-label={t.itemName}
                          value={item.name}
                          placeholder={t.itemName}
                          onChange={(e) => {
                            const name = e.target.value;
                            editItems(items => items.map((it, i) => i === idx ? { ...it, name } : it), false);
                          }}
                          className="h-10 min-w-0 flex-1 rounded-[10px] border-none bg-chip px-2.5 text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                        />
                        <AmountInput
                          aria-label={t.itemPrice}
                          language={language}
                          value={item.price}
                          emptyWhenZero
                          placeholder="0"
                          onValueChange={(price) => {
                            editItems(items => items.map((it, i) => i === idx ? { ...it, price: price ?? 0 } : it), true);
                          }}
                          className="h-10 w-24 shrink-0 rounded-[10px] border-none bg-chip px-2 text-right font-semibold tabular-nums text-on-surface outline-none focus:ring-2 focus:ring-accent"
                        />
                        <button
                          type="button"
                          onClick={() => editItems(items => items.filter((_, i) => i !== idx), true)}
                          aria-label={t.remove}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neg transition-opacity hover:bg-neg/10 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 sm:group-focus-within:opacity-100"
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

              {imagePreview && (
                <div>
                  <label className="paper-tile flex min-h-[60px] cursor-pointer items-center gap-3 px-3.5 py-2.5">
                    <img src={imagePreview} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{t.receiptKeepPhoto}</span>
                      <span className="block text-[12px] text-muted">{t.receiptKeepPhotoHint}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={keepPhoto}
                      onChange={event => {
                        setKeepPhoto(event.target.checked);
                        setPhotoError(null);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2',
                        keepPhoto ? 'bg-accent' : 'bg-chip',
                      )}
                    >
                      <span
                        className={clsx(
                          'absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform',
                          keepPhoto ? 'translate-x-[23px]' : 'translate-x-[3px]',
                        )}
                      />
                    </span>
                  </label>
                  {photoError && (
                    <p role="alert" className="mt-1.5 flex items-center gap-1.5 px-1 text-[13px] font-medium text-neg">
                      <AlertCircle size={14} aria-hidden="true" /> {photoError}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetState}
                  className="h-12 flex-1 rounded-full bg-chip text-[15px] font-semibold text-on-surface"
                >
                  {t.scanAnother}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  // Nothing to save until there is an amount (a bill without one, a receipt typed in).
                  disabled={!canConfirm || savingPhoto}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent transition-opacity disabled:opacity-50"
                >
                  {savingPhoto ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                  {savingPhoto ? t.receiptPhotoUploading : t.addTransactionAction}
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
        onResult={handleScannedQr}
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
