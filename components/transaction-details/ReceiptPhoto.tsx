import React, { useEffect, useState } from 'react';
import { m } from 'motion/react';
import { Camera, ExternalLink, Image as ImageIcon, Loader2, Trash2, X } from 'lucide-react';
import type { TRANSLATIONS } from '../../constants';
import { useDialog } from '../../hooks/useFocusTrap';
import { useBackLayer } from '../../hooks/useBackLayer';
import { receiptPhotoUrl } from '../../services/receiptPhotoService';

type T = typeof TRANSLATIONS['en'];

/** A signed link for the photo; `failed` when it cannot be loaded (offline, no access, deleted). */
export const useReceiptPhotoUrl = (path: string | null) => {
  const [result, setResult] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void receiptPhotoUrl(path).then(url => {
      if (alive) setResult({ path, url });
    });
    return () => {
      alive = false;
    };
  }, [path]);
  const current = result && result.path === path ? result : null;
  return { url: current?.url ?? null, loading: !!path && !current, failed: !!current && !current.url };
};

export const ReceiptPhotoTile: React.FC<{ path: string; t: T; onOpen: () => void; busy?: boolean }> = ({ path, t, onOpen, busy }) => {
  const { url, loading, failed } = useReceiptPhotoUrl(path);
  const [broken, setBroken] = useState(false);
  const unavailable = failed || broken;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={unavailable}
      aria-label={t.receiptPhotoView}
      className="relative block h-44 w-full overflow-hidden rounded-[16px] bg-chip disabled:cursor-default"
    >
      {url && !broken && (
        <img src={url} alt="" className="h-full w-full object-cover object-top" onError={() => setBroken(true)} />
      )}
      {(loading || busy) && (
        <span className="absolute inset-0 flex items-center justify-center bg-[var(--paper-scrim)]">
          <Loader2 size={22} className="animate-spin text-muted" aria-hidden="true" />
        </span>
      )}
      {unavailable && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-[12.5px] font-medium text-muted">
          <ImageIcon size={20} aria-hidden="true" />
          {t.receiptPhotoUnavailable}
        </span>
      )}
    </button>
  );
};

/** The photo as a small thumbnail on the receipt card's header; opens the viewer. */
export const ReceiptPhotoThumb: React.FC<{ path: string; label: string; onOpen: () => void; busy?: boolean; className?: string }> = ({
  path,
  label,
  onOpen,
  busy,
  className,
}) => {
  const { url, loading, failed } = useReceiptPhotoUrl(path);
  const [broken, setBroken] = useState(false);
  const unavailable = failed || broken;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={unavailable}
      aria-label={label}
      className={`relative shrink-0 overflow-hidden rounded-[14px] bg-chip ring-1 ring-inset ring-hair disabled:cursor-default ${className ?? ''}`}
    >
      {url && !broken && <img src={url} alt="" className="h-full w-full object-cover object-top" onError={() => setBroken(true)} />}
      {(loading || busy) && (
        <span className="absolute inset-0 flex items-center justify-center bg-[var(--paper-scrim)]">
          <Loader2 size={18} className="animate-spin text-muted" aria-hidden="true" />
        </span>
      )}
      {unavailable && (
        <span className="absolute inset-0 flex items-center justify-center text-muted">
          <ImageIcon size={20} aria-hidden="true" />
        </span>
      )}
      {!unavailable && !loading && (
        <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white">
          <Camera size={11} aria-hidden="true" />
        </span>
      )}
    </button>
  );
};

interface ReceiptPhotoViewerProps {
  path: string;
  t: T;
  onClose: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
}

/** The photo full screen, with Replace and Remove for people who can edit the entry. */
export const ReceiptPhotoViewer: React.FC<ReceiptPhotoViewerProps> = ({ path, t, onClose, onReplace, onRemove }) => {
  const { dialogProps, titleId } = useDialog(true, onClose);
  useBackLayer('receipt-photo', true, onClose);
  const { url, loading, failed } = useReceiptPhotoUrl(path);

  const barButton = 'flex h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-[14px] font-semibold text-white transition-colors hover:bg-white/20';

  return (
    <m.div
      {...dialogProps}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="modal-safe-area fixed inset-0 z-[80] flex flex-col bg-black/92 text-white outline-none"
    >
      <h2 id={titleId} className="sr-only">{t.receiptPhotoView}</h2>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button type="button" onClick={onClose} aria-label={t.close} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 hover:bg-white/20">
          <X size={20} aria-hidden="true" />
        </button>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={barButton}>
            <ExternalLink size={16} aria-hidden="true" /> {t.receiptPhotoOpen}
          </a>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-3" onClick={event => event.target === event.currentTarget && onClose()}>
        {url && <img src={url} alt={t.receiptPhotoView} className="max-h-full max-w-full rounded-[12px] object-contain" />}
        {loading && <Loader2 size={26} className="animate-spin text-white/70" aria-hidden="true" />}
        {failed && (
          <p className="flex flex-col items-center gap-2 text-[14px] text-white/75">
            <ImageIcon size={24} aria-hidden="true" /> {t.receiptPhotoUnavailable}
          </p>
        )}
      </div>
      {(onReplace || onRemove) && (
        <div className="flex shrink-0 items-center justify-center gap-2">
          {onReplace && (
            <button type="button" onClick={onReplace} className={barButton}>
              <Camera size={17} aria-hidden="true" /> {t.receiptPhotoReplace}
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className={`${barButton} text-[#FF8A8A]`}>
              <Trash2 size={17} aria-hidden="true" /> {t.receiptPhotoRemove}
            </button>
          )}
        </div>
      )}
    </m.div>
  );
};
