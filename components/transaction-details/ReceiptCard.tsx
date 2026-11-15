import React, { useId, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { ChevronDown, ExternalLink, ReceiptText, ShieldCheck } from 'lucide-react';
import type { Currency, ReceiptData } from '../../types';
import type { TRANSLATIONS } from '../../constants';
import { formatMoney, formatNumber, type AppLanguage } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { officialReceiptUrl, receiptAddress, receiptLines } from '../../domain/receiptDetails';
import { receiptPhotoOf } from '../../domain/receiptPhoto';
import { ReceiptPhotoTile } from './ReceiptPhoto';

/** Lines shown before "Show all": a short shop fits, a long one still reaches its total. */
const PREVIEW_LINES = 6;

interface ReceiptCardProps {
  receipt: ReceiptData;
  currency: Currency;
  language: AppLanguage;
  t: typeof TRANSLATIONS['en'];
  /** Open on first show (an entry that is not split has room for its lines). */
  defaultOpen?: boolean;
  /** Opens the photo full screen. */
  onOpenPhoto?: () => void;
  /** A new photo is being saved over the current one. */
  photoBusy?: boolean;
}

/**
 * The scanned receipt as one compact card: a header row with the item count and total that opens
 * the lines, the shop's details, and the official copy on the tax portal.
 */
export const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, currency, language, t, defaultOpen = false, onOpenPhoto, photoBusy }) => {
  const lines = useMemo(() => receiptLines(receipt), [receipt]);
  const photo = receiptPhotoOf({ receiptData: receipt });
  const officialUrl = officialReceiptUrl(receipt);
  const address = receiptAddress(receipt);
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const panelId = useId();
  const visible = showAll ? lines : lines.slice(0, PREVIEW_LINES);
  const hidden = lines.length - visible.length;
  const money = (value: number) => formatMoney(value, currency, language);
  // Lines are in the receipt's currency, named once on the total; whole amounts stay whole.
  const fractionDigits = lines.some(line => Math.round(line.total * 100) % 100 !== 0) ? 2 : 0;
  const plain = (value: number) =>
    formatNumber(value, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }, language);
  const quantity = (value: number) => formatNumber(value, { maximumFractionDigits: 3 }, language);
  const count = lines.length > 0
    ? pluralText(lines.length, language, { one: t.detailsItemsOne, few: t.detailsItemsFew, other: t.detailsItemsOther })
    : photo ? t.detailsPhoto : '';
  const shop = [receipt.companyName, address].filter(Boolean).join(' · ');
  const taxId = receipt.pib ? t.detailsTaxId.replace('{pib}', receipt.pib) : '';

  return (
    <section className="paper-tile overflow-hidden" aria-label={t.detailsReceipt}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left"
      >
        <ReceiptText size={18} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
          {t.detailsReceipt}
          {count && <span className="font-medium text-muted"> · {count}</span>}
        </span>
        <span className="shrink-0 text-[14px] font-semibold tabular-nums">{money(receipt.total)}</span>
        <ChevronDown
          size={17}
          className={clsx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
        <span className="sr-only">{open ? t.detailsHideReceipt : t.detailsShowReceipt}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={panelId}
            key="lines"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            className="overflow-hidden"
          >
            <div className="border-t border-hair px-3.5 pb-1 pt-2">
              {photo && (
                <div className="pb-2 pt-1">
                  <ReceiptPhotoTile path={photo} t={t} onOpen={() => onOpenPhoto?.()} busy={photoBusy} />
                </div>
              )}
              {lines.length > 0 && (
                <ul>
                  {visible.map((line, index) => (
                    <li key={index} className="flex items-start justify-between gap-3 py-1">
                      <span className="min-w-0">
                        <span className="block break-words text-[13.5px] font-medium leading-snug">{line.name || t.untitled}</span>
                        {line.quantity !== 1 && (
                          <span className="block text-[12px] tabular-nums text-muted">
                            {quantity(line.quantity)} × {plain(line.unitPrice)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[13.5px] font-medium tabular-nums">{plain(line.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex h-10 items-center text-[13px] font-semibold text-accent"
                >
                  {t.detailsShowAllItems.replace('{count}', String(lines.length))}
                </button>
              )}
              {lines.length > 0 && (
                <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t-[1.5px] border-dashed border-hair pt-2.5">
                  <span className="text-[14px] font-bold">{t.total}</span>
                  <span className="text-[14px] font-bold tabular-nums">{money(receipt.total)}</span>
                </div>
              )}
              {(shop || taxId || receipt.invoiceNumber) && (
                <div className="mt-2 space-y-0.5 pb-1.5 text-[12px] leading-snug text-muted">
                  {shop && <p className="break-words">{shop}</p>}
                  {taxId && <p className="tabular-nums">{taxId}</p>}
                  {receipt.invoiceNumber && (
                    <p>
                      {t.detailsInvoice} <span className="break-all font-mono text-[11.5px]">{receipt.invoiceNumber}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
            {officialUrl && (
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[46px] items-center gap-2.5 border-t border-hair px-3.5 text-[13.5px] font-semibold text-accent"
              >
                <ShieldCheck size={17} className="shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  {t.detailsOfficialReceipt}
                  <span className="block text-[11.5px] font-medium text-muted">{t.detailsOfficialHint}</span>
                </span>
                <ExternalLink size={15} className="shrink-0" aria-hidden="true" />
              </a>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
};
