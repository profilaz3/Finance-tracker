import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { MOTION } from '../../config';
import { useDialog } from '../../hooks/useFocusTrap';
import { useSheetDrag } from '../../hooks/useSheetDrag';

interface GlassSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (still labels the dialog). */
  hideTitle?: boolean;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Extra controls on the right of the header, before the close button. */
  headerAction?: React.ReactNode;
}

/** Bottom sheet on frosted glass: floats 8px from the edges, 40px corners, grabber on top. */
export const GlassSheet: React.FC<GlassSheetProps> = ({ isOpen, onClose, ...rest }) => (
  <AnimatePresence>{isOpen && <GlassSheetPanel isOpen onClose={onClose} {...rest} />}</AnimatePresence>
);

const GlassSheetPanel: React.FC<GlassSheetProps> = ({
  isOpen,
  onClose,
  title,
  hideTitle,
  closeLabel,
  children,
  footer,
  className,
  headerAction,
}) => {
  const { dialogProps, titleId } = useDialog(isOpen, onClose);
  const { wrapRef, handleProps, contentProps } = useSheetDrag(onClose);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center">
      <m.div
        className="paper-scrim absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={MOTION.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />
      <div ref={wrapRef} className="relative flex w-full justify-center">
      <m.div
        {...dialogProps}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={MOTION.sheet.exit}
        transition={MOTION.sheet.spring}
        className={clsx(
          'glass-sheet relative mx-2 mb-[calc(8px+env(safe-area-inset-bottom))] flex max-h-[88dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-[40px] text-on-surface outline-none md:mb-0',
          className,
        )}
      >
        <div className="shrink-0 touch-none" {...handleProps}>
        <div className="paper-grab mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full" aria-hidden="true" />
        <div className={clsx('flex shrink-0 items-center gap-2 px-5 pt-2', hideTitle ? 'pb-0' : 'pb-3')}>
          <h2 id={titleId} className={clsx('flex-1 text-[22px] font-semibold tracking-tight', hideTitle && 'sr-only')}>
            {title}
          </h2>
          {hideTitle && <div className="flex-1" />}
          {headerAction}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5" {...contentProps}>{children}</div>
        {footer && <div className="shrink-0 px-5 pb-5 pt-1">{footer}</div>}
      </m.div>
      </div>
    </div>
  );
};
