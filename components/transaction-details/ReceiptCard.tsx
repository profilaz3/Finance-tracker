import React, { useId, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { ChevronDown, ExternalLink, ReceiptText } from 'lucide-react';
import type { Currency, ReceiptData } from '../../types';
import type { TRANSLATIONS } from '../../constants';
import { formatMoney, formatNumber, type AppLanguage } from '../../utils/locale';
import { pluralText } from '../../utils/plural';
import { officialReceiptUrl, receiptAddress, receiptLines } from '../../domain/receiptDetails';
import { cyrillicToLatin } from '../../utils/aiShared';
import { receiptPhotoOf } from '../../domain/receiptPhoto';
import { ReceiptPhotoThumb, ReceiptPhotoTile } from './ReceiptPhoto';
import type { DetailsStrings } from './detailsStrings';

/** Lines shown before "Show all": a short shop fits, a long one still reaches its total. */
const PREVIEW_LINES = 8;

interface ReceiptCardProps {
  receipt: ReceiptData;
  currency: Currency;
  language: AppLanguage;
  t: typeof TRANSLATIONS['en'];
  d: DetailsStrings;
  /** Open on first show (an entry that is not split has room for its lines). */
  defaultOpen?: boolean;
  /** Opens the photo full screen. */
  onOpenPhoto?: () => void;
  /** A new photo is being saved over the current one. */
  photoBusy?: boolean;
}

/**
 * The receipt: a header with the photo (or a receipt icon), the item count, where it came from and
 * the tax portal link, then the lines in roomy rows, the total and the shop's details.
 */
export const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, currency, language, t, d, defaultOpen = false, onOpenPhoto, photoBusy }) => {
  const lines = useMemo(() => receiptLines(receipt), [receipt]);
  const photo = receiptPhotoOf({ receiptData: receipt });
  const officialUrl = officialReceiptUrl(receipt);
  const address = receiptAddress(receipt);
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const panelId = useId();
  // Only the first hidden line plus a few would sit behind "Show all": show them all instead.
  const visible = showAll || lines.length <= PREVIEW_LINES + 2 ? lines : lines.slice(0, PREVIEW_LINES);
  const hidden = lines.length - visible.length;
  // Lines are in the receipt's currency, named once on the total; whole amounts stay whole.
  const fractionDigits = [receipt.total, ...lines.map(line => line.total)].some(value => Math.round(value * 100) % 100 !== 0) ? 2 : 0;
  const money = (value: number) =>
    formatMoney(value, currency, language, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  const plain = (value: number) =>
    formatNumber(value, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }, language);
  const quantity = (value: number) => formatNumber(value, { maximumFractionDigits: 3 }, language);
  const count = lines.length > 0
    ? pluralText(lines.length, language, { one: t.detailsItemsOne, few: t.detailsItemsFew, other: t.detailsItemsOther })
    : '';
  const source = officialUrl ? d.fiscalReceipt : lines.length > 0 ? d.scanned : photo ? d.photo : '';
  // Fiscal receipts often come in Cyrillic; the app shows Serbian in Latin script (stored text stays as is).
  const sub = [source, cyrillicToLatin(receipt.city?.trim() ?? '')].filter(Boolean).join(' · ');
  const shop = cyrillicToLatin([receipt.companyName, address].filter(Boolean).join(' · '));
  const taxId = receipt.pib ? t.detailsTaxId.replace('{pib}', receipt.pib) : '';
  const photoInPanel = !!photo && lines.length === 0;
  const hasPanel = lines.length > 0 || photoInPanel || !!shop || !!taxId || !!receipt.invoiceNumber;
  const title = (
    <span className="min-w-0 flex-1">
      <span className="block break-words text-[16px] font-semibold leading-snug">
        {t.detailsReceipt}
        {count && <span className="text-muted"> · {count}</span>}
      </span>
      {sub && <span className="mt-0.5 block break-words text-[13.5px] font-medium text-muted">{sub}</span>}
    </span>
  );

  return (
    <section className="paper-tile overflow-hidden" aria-label={t.detailsReceipt}>
      <div className="flex items-start gap-3.5 p-4">
        {photo ? (
          <ReceiptPhotoThumb path={photo} label={d.viewPhoto} onOpen={() => onOpenPhoto?.()} busy={photoBusy} className="h-[62px] w-[50px]" />
        ) : (
          <span className="flex h-[62px] w-[50px] shrink-0 items-center justify-center rounded-[14px] bg-chip text-muted">
            <ReceiptText size={24} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {hasPanel ? (
            <button
              type="button"
              onClick={() => setOpen(value => !value)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex min-h-[44px] w-full items-start gap-2 text-left"
            >
              {title}
              <ChevronDown
                size={20}
                className={clsx('mt-0.5 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
                aria-hidden="true"
              />
              <span className="sr-only">{open ? t.detailsHideReceipt : t.detailsShowReceipt}</span>
            </button>
          ) : (
            <div className="flex min-h-[44px] items-start">{title}</div>
          )}
          {officialUrl && (
            <a
              href={officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="-mb-2 inline-flex min-h-[40px] items-center gap-1.5 text-[14px] font-semibold text-accent"
            >
              {d.taxPortal}
              <ExternalLink size={14} className="shrink-0" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && hasPanel && (
          <m.div
            id={panelId}
            key="lines"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            className="overflow-hidden"
          >
            <div className="border-t border-hair px-4 pb-2">
              {photoInPanel && (
                <div className="pt-3">
                  <ReceiptPhotoTile path={photo} t={t} onOpen={() => onOpenPhoto?.()} busy={photoBusy} />
                </div>
              )}
              {lines.length > 0 && (
                <ul>
                  {visible.map((line, index) => (
                    <li key={index} className="flex items-baseline justify-between gap-4 border-b border-hair py-3">
                      <span className="min-w-0 break-words text-[15px] leading-snug">
                        {cyrillicToLatin(line.name) || t.untitled}
                        {line.quantity !== 1 && (
                          <span className="ml-2 whitespace-nowrap text-[13.5px] tabular-nums text-muted">
                            {quantity(line.quantity)} × {plain(line.unitPrice)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{plain(line.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex h-11 w-full items-center border-b border-hair text-[14px] font-semibold text-accent"
                >
                  {t.detailsShowAllItems.replace('{count}', String(lines.length))}
                </button>
              )}
              {lines.length > 0 && (
                <div className="flex items-baseline justify-between gap-3 pb-1 pt-3.5">
                  <span className="text-[16px] font-bold">{t.total}</span>
                  <span className="text-[16px] font-bold tabular-nums">{money(receipt.total)}</span>
                </div>
              )}
              {(shop || taxId || receipt.invoiceNumber) && (
                <div className="space-y-0.5 pb-2 pt-2 text-[12.5px] leading-snug text-muted">
                  {shop && <p className="break-words">{shop}</p>}
                  {taxId && <p className="tabular-nums">{taxId}</p>}
                  {receipt.invoiceNumber && (
                    <p>
                      {t.detailsInvoice} <span className="break-all font-mono text-[12px]">{receipt.invoiceNumber}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
};
