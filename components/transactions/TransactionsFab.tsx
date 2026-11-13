import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import clsx from 'clsx';
import { Banknote, Plus, Split } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';

interface TransactionsFabProps {
  isVisible: boolean;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  language: 'en' | 'sr';
  onAddTransaction?: () => void;
  onOpenSplit?: () => void;
}

export const TransactionsFab: React.FC<TransactionsFabProps> = ({
  isVisible,
  isOpen,
  setIsOpen,
  language,
  onAddTransaction,
  onOpenSplit,
}) => {
  if (!onAddTransaction) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6 right-[calc(1rem+env(safe-area-inset-right))] md:right-6 z-50"
        >
          <AnimatePresence>
            {isOpen && (
              <>
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-scrim/20"
                  onClick={() => setIsOpen(false)}
                />
                <m.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-16 right-0 flex flex-col gap-3 items-end"
                >
                  {onOpenSplit && (
                    <button
                      onClick={() => {
                        onOpenSplit();
                        setIsOpen(false);
                      }}
                      aria-label={TRANSLATIONS[language].openSplitExpense}
                      className="flex items-center gap-3 bg-surface-container-high text-on-surface pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:bg-surface-container-highest transition-colors"
                    >
                      <span className="text-sm font-medium whitespace-nowrap">{TRANSLATIONS[language].split}</span>
                      <div className="w-10 h-10 bg-tertiary text-on-tertiary rounded-full flex items-center justify-center">
                        <Split size={20} />
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onAddTransaction();
                      setIsOpen(false);
                    }}
                    aria-label={TRANSLATIONS[language].addTransaction}
                    className="flex items-center gap-3 bg-surface-container-high text-on-surface pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:bg-surface-container-highest transition-colors"
                  >
                    <span className="text-sm font-medium whitespace-nowrap">{TRANSLATIONS[language].transaction}</span>
                    <div className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center">
                      <Banknote size={20} />
                    </div>
                  </button>
                </m.div>
              </>
            )}
          </AnimatePresence>
          <m.button
            onClick={() => setIsOpen(!isOpen)}
            whileTap={{ scale: 0.9 }}
            aria-label={TRANSLATIONS[language].openTransactionActions}
            className={clsx(
              'w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center transition-all z-50 hover:shadow-2xl hover:shadow-primary/20',
              isOpen ? 'rotate-45' : 'hover:scale-105'
            )}
          >
            <Plus size={28} />
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  );
};
