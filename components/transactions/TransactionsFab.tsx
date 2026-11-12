import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Banknote, Plus, Split } from 'lucide-react';

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
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50"
        >
          <AnimatePresence>
            {isOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-scrim/20"
                  onClick={() => setIsOpen(false)}
                />
                <motion.div
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
                      aria-label={language === 'sr' ? 'Otvori podelu troska' : 'Open split expense'}
                      className="flex items-center gap-3 bg-surface-container-high text-on-surface pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:bg-surface-container-highest transition-colors"
                    >
                      <span className="text-sm font-medium whitespace-nowrap">{language === 'sr' ? 'Podeli' : 'Split'}</span>
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
                    aria-label={language === 'sr' ? 'Dodaj transakciju' : 'Add transaction'}
                    className="flex items-center gap-3 bg-surface-container-high text-on-surface pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:bg-surface-container-highest transition-colors"
                  >
                    <span className="text-sm font-medium whitespace-nowrap">{language === 'sr' ? 'Transakcija' : 'Transaction'}</span>
                    <div className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center">
                      <Banknote size={20} />
                    </div>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            whileTap={{ scale: 0.9 }}
            aria-label={language === 'sr' ? 'Otvori akcije transakcija' : 'Open transaction actions'}
            className={clsx(
              'w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center transition-all z-50 hover:shadow-2xl hover:shadow-primary/20',
              isOpen ? 'rotate-45' : 'hover:scale-105'
            )}
          >
            <Plus size={28} />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
