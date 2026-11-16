import React, { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import type { HomeHeaderTone } from '../../types';
import { MOTION } from '../../config';
import { useStatusBarOverHeader } from '../../hooks/useStatusBarOverHeader';
import { useEscapeKey, useFocusTrap } from '../../hooks/useFocusTrap';
import { useBackLayer } from '../../hooks/useBackLayer';

/** Translucent white controls drawn on the header colour. */
export const ON_COLOUR = 'bg-white/[0.14] ring-1 ring-inset ring-white/[0.18] backdrop-blur-md';

interface ScreenHeroProps {
  /** The header colour the user picked for Home (Settings > Header): the accent card or near-black. */
  tone: HomeHeaderTone;
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The coloured header a top-level screen opens with. On phones it runs edge to edge under the
 * status bar (light icons while it is there); from md up it is a card. Follow it with a
 * `.screen-sheet` for the screen's content.
 */
export const ScreenHero: React.FC<ScreenHeroProps> = ({ tone, label, className, children }) => {
  const ref = useRef<HTMLElement>(null);
  useStatusBarOverHeader(ref, true);
  return (
    <section
      ref={ref}
      aria-label={label}
      className={clsx('screen-hero hero-bg relative isolate overflow-hidden', tone === 'dark' && 'hero-dark', className)}
    >
      {children}
    </section>
  );
};

interface HeroIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
}

/** A round 44px button on the header colour. */
export const HeroIconButton = React.forwardRef<HTMLButtonElement, HeroIconButtonProps>(
  ({ icon: Icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={clsx(ON_COLOUR, 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40', className)}
      {...props}
    >
      <Icon size={19} aria-hidden="true" />
    </button>
  ),
);
HeroIconButton.displayName = 'HeroIconButton';

export interface HeroMenuItem {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/** The header's ⋯ button and the menu it opens (the screen's rarer actions). */
export const HeroMenu: React.FC<{ label: string; icon: LucideIcon; items: HeroMenuItem[] }> = ({ label, icon, items }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const menuRef = useFocusTrap(open);
  useEscapeKey(close, open);
  useBackLayer('screen-hero-menu', open, close);

  return (
    <div className="relative">
      <HeroIconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} />
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
            <m.div
              ref={menuRef}
              role="menu"
              aria-label={label}
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -6 }}
              transition={MOTION.modal.spring}
              style={{ transformOrigin: 'top right' }}
              className="glass-sheet absolute right-0 top-[52px] z-40 w-[244px] rounded-[26px] p-1.5 text-on-surface"
            >
              {items.map(item => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={clsx(
                    'flex h-12 w-full items-center gap-3 rounded-[20px] px-3.5 text-left text-[15px] font-medium transition-colors hover:bg-chip active:bg-chip disabled:opacity-40',
                    item.danger && 'text-neg',
                  )}
                >
                  <item.icon size={19} className={item.danger ? undefined : 'text-muted'} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
