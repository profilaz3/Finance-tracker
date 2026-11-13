import React, { useState, useMemo, useRef, useCallback } from 'react';
import { m, Variants, AnimatePresence } from 'motion/react';
import { Banknote, CreditCard, Globe, User, Sparkles, Loader2, Camera, Split, X, Plus, MapPin, ExternalLink, ToggleLeft, ToggleRight, Bookmark, Trash2 } from 'lucide-react';
import { ICONS, IconName } from './IconPicker';
import { EmptyState } from './EmptyState';
import clsx from 'clsx';
import { AppState, Transaction, View, Currency, Person, Event, Account, TransactionType } from '../types';
import { AnimatedNumber } from './AnimatedNumber';
import { formatCurrency } from '../utils/formatters';
import { formatNumber } from '../utils/locale';
import { convertAmount } from '../services/currencyService';
import { TRANSLATIONS } from '../constants';
import { parseTransaction, isAIAvailable, ParsedTransaction } from '../services/aiService';
import { getActiveDashboardPeople, getDashboardWalletSummaries } from '../utils/dashboardSummarySelectors';
import { getRepeatLastCandidate, selectDashboardTemplates } from '../utils/qolSuggestions';
import { DashboardQuickActions, DashboardTemplateShortcuts } from './dashboard';

interface DashboardViewProps {
  state: AppState;
  dashboardTab: 'wallets' | 'debts' | 'loans' | 'people';
  setDashboardTab: (tab: 'wallets' | 'debts' | 'loans' | 'people') => void;
  setSelectedPerson: (person: Person | null) => void;
  addTransaction: (transaction: Transaction) => void;
  setCurrentView: (view: View) => void;
  getAccountBalance: (account: Account) => number;
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  handleOpenAddTransaction: (type?: TransactionType) => void;
  onParsedTransaction?: (parsed: ParsedTransaction) => void;
  onOpenReceiptScan?: () => void;
  onOpenQuickSplit?: () => void;
  activeEvent?: Event;
  linkToActiveEvent: boolean;
  setLinkToActiveEvent: (value: boolean) => void;
  onViewEvent?: (event: Event) => void;
  onUseTemplate?: (templateId: string) => void;
  onDeleteTemplate?: (templateId: string) => void;
  onRepeatTransaction?: (transaction: Transaction) => void;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity:1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
      when: "beforeChildren"
    }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0, scale: 0.98 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
      mass: 0.8
    }
  }
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  dashboardTab,
  setDashboardTab,
  setSelectedPerson,
  addTransaction,
  setCurrentView,
  getAccountBalance,
  totalBalance,
  totalIncome,
  totalExpense,
  handleOpenAddTransaction,
  onParsedTransaction,
  onOpenReceiptScan,
  onOpenQuickSplit,
  activeEvent,
  linkToActiveEvent,
  setLinkToActiveEvent,
  onViewEvent,
  onUseTemplate,
  onDeleteTemplate,
  onRepeatTransaction
}) => {
  const [smartInput, setSmartInput] = useState('');
  const [isAIParsing, setIsAIParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabVisible, setIsFabVisible] = useState(true);
  const lastScrollTop = useRef(0);

  // Handle scroll to show/hide FAB
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollDelta = scrollTop - lastScrollTop.current;

    // Only trigger on significant scroll (prevents jitter)
    if (Math.abs(scrollDelta) > 5) {
      if (scrollDelta > 0 && scrollTop > 50) {
        // Scrolling down - hide FAB
        setIsFabVisible(false);
        setIsFabOpen(false);
      } else {
        // Scrolling up - show FAB
        setIsFabVisible(true);
      }
    }

    lastScrollTop.current = scrollTop;
  }, []);

  const t = TRANSLATIONS[state.language];

  const aiAvailable = isAIAvailable();
  const totalFlow = totalIncome + totalExpense;
  const incomeShare = totalFlow > 0 ? (totalIncome / totalFlow) * 100 : 50;
  const expenseShare = totalFlow > 0 ? 100 - incomeShare : 50;
  const netDelta = totalIncome - totalExpense;
  const netLabel = t.net;
  const heroDecimals = state.baseCurrency === 'RSD' ? 0 : 2;
  const walletSummaries = useMemo(
    () => getDashboardWalletSummaries(state.accounts, getAccountBalance),
    [state.accounts, getAccountBalance],
  );
  const activePeople = useMemo(
    () => getActiveDashboardPeople(state.people),
    [state.people],
  );
  const templateShortcuts = useMemo(
    () => selectDashboardTemplates(state.templates),
    [state.templates],
  );
  const repeatCandidate = useMemo(
    () => getRepeatLastCandidate(state.transactions),
    [state.transactions],
  );

  const handleSmartParse = async () => {
    if (!smartInput.trim() || !onParsedTransaction) return;

    setIsAIParsing(true);
    setParseError(null);

    try {
      const result = await parseTransaction(
        smartInput,
        state.categories,
        state.accounts,
        state.people
      );

      if (result) {
        onParsedTransaction(result);
        setSmartInput('');
      } else {
        setParseError(t.parseError);
      }
    } catch (error) {
      console.error('Smart parsing failed:', error);
      setParseError(t.parseError);
    } finally {
      setIsAIParsing(false);
    }
  };

  return (
    <m.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-4 sm:space-y-6 h-full overflow-y-auto"
      onScroll={handleScroll}
    >
      {/* Active Event Banner */}
      {activeEvent && (
        <m.div
          variants={itemVariants}
          className={clsx(
            "rounded-xl p-4 border transition-all",
            linkToActiveEvent
              ? "bg-primary/10 border-primary/30"
              : "bg-surface-container-low border-outline/10"
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                activeEvent.color || "bg-primary/20"
              )}>
                {activeEvent.imageUrl ? (
                  <img src={activeEvent.imageUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <MapPin size={18} className="text-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{activeEvent.name}</p>
                <p className="text-xs text-on-surface-variant">
                  {linkToActiveEvent
                    ? t.activeEventLinking
                    : t.activeEvent
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setLinkToActiveEvent(!linkToActiveEvent)}
                className={clsx(
                  "p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors",
                  linkToActiveEvent
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant"
                )}
                title={linkToActiveEvent ? t.stopLinkingEvent : t.linkTransactionsToEvent}
              >
                {linkToActiveEvent ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
              {onViewEvent && (
                <button
                  onClick={() => onViewEvent(activeEvent)}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface-variant rounded-lg transition-colors"
                  title={t.viewEvent}
                >
                  <ExternalLink size={18} />
                </button>
              )}
            </div>
          </div>
        </m.div>
      )}

      {/* Smart Transaction Input */}
      {aiAvailable && onParsedTransaction && (
        <m.div
          variants={itemVariants}
          className="bg-surface-container-low rounded-xl p-4 shadow-elevation-1"
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={smartInput}
                onChange={e => { setSmartInput(e.target.value); setParseError(null); }}
                onKeyDown={e => e.key === 'Enter' && !isAIParsing && handleSmartParse()}
                placeholder={`${t.addTransaction}... ${t.smartAddExample}`}
                className="w-full bg-surface-container border-none rounded-lg px-4 py-3 pr-10 text-on-surface placeholder-on-surface-variant/60"
                disabled={isAIParsing}
              />
              {isAIParsing && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={18} className="animate-spin text-primary" />
                </div>
              )}
            </div>
            <button
              onClick={handleSmartParse}
              disabled={isAIParsing || !smartInput.trim()}
              className="p-3 bg-primary text-on-primary rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-elevation-1"
            >
              <Sparkles size={20} />
            </button>
            {onOpenReceiptScan && (
              <button
                onClick={onOpenReceiptScan}
                disabled={isAIParsing}
                className="p-3 bg-secondary-container text-on-secondary-container rounded-lg disabled:opacity-50 transition-all hover:shadow-elevation-1"
                title={t.scanReceipt}
              >
                <Camera size={20} />
              </button>
            )}
          </div>
          {parseError && (
            <p className="text-xs text-error mt-2">{parseError}</p>
          )}
        </m.div>
      )}

      <m.div variants={itemVariants} className="space-y-3">
        <DashboardQuickActions
          language={state.language}
          aiAvailable={aiAvailable}
          onAddTransaction={handleOpenAddTransaction}
          onOpenReceiptScan={onOpenReceiptScan}
          onOpenQuickSplit={onOpenQuickSplit}
        />
        <DashboardTemplateShortcuts
          language={state.language}
          templates={templateShortcuts}
          repeatCandidate={repeatCandidate}
          categories={state.categories}
          accounts={state.accounts}
          onUseTemplate={onUseTemplate}
          onRepeatTransaction={onRepeatTransaction}
        />
      </m.div>

      {/* Net Worth Card (Standalone with rounded corners and glow) */}
      <m.div
        variants={itemVariants}
        className="relative p-8 md:p-10 overflow-hidden bg-surface-container rounded-3xl"
        style={{
          boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 60px -20px rgba(var(--md-sys-color-primary), 0.3)`
        }}
      >
        {/* Gradient background */}
        <div
          className="absolute inset-0 z-0 opacity-30 rounded-3xl"
          style={{
            background: `linear-gradient(135deg, rgba(var(--md-sys-color-primary), 0.2) 0%, transparent 50%, rgba(var(--md-sys-color-secondary), 0.2) 100%)`
          }}
        />
        {/* Glow orbs */}
        <div
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: `rgb(var(--md-sys-color-primary))` }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: `rgb(var(--md-sys-color-secondary))` }}
        />

        <div className="relative z-10 flex flex-col items-center justify-center text-center gap-5">
          <div>
            <p className="text-on-surface-variant text-sm font-semibold mb-2 tracking-[0.22em] uppercase">{t.totalNetWorth}</p>
            <h2 className="text-6xl sm:text-7xl md:text-8xl font-display font-black tracking-tight">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(135deg, rgb(var(--md-sys-color-primary)) 0%, rgb(var(--md-sys-color-secondary)) 100%)`
                }}
              >
                <AnimatedNumber value={totalBalance} decimals={heroDecimals} />
              </span>
              <span
                className="text-lg sm:text-xl md:text-2xl lg:text-3xl ml-1 sm:ml-2 font-sans font-light opacity-60"
                style={{ color: `rgb(var(--md-sys-color-primary))` }}
              >
                {state.baseCurrency}
              </span>
            </h2>
          </div>

          {/* Income/Expense Summary */}
          <div className="w-full max-w-xl px-1 sm:px-2">
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div
                  className={clsx(
                    "px-3 py-1 rounded-full text-xs font-semibold tabular-nums",
                    netDelta >= 0 ? "bg-primary/15 text-primary" : "bg-error/15 text-error"
                  )}
                >
                  {netLabel} {netDelta >= 0 ? '+' : '-'}
                  <AnimatedNumber value={Math.abs(netDelta)} decimals={heroDecimals} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-primary/70">{t.income}</p>
                  <p className="text-xl sm:text-2xl font-display font-bold text-primary tabular-nums">
                    +<AnimatedNumber value={totalIncome} decimals={heroDecimals} />
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/10 border border-secondary/25 p-3 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-secondary/80">{t.expense}</p>
                  <p className="text-xl sm:text-2xl font-display font-bold text-secondary tabular-nums">
                    -<AnimatedNumber value={totalExpense} decimals={heroDecimals} />
                  </p>
                </div>
              </div>

              <div>
                <div className="rounded-full bg-on-surface/10 p-[2px]">
                  <div className="flex h-3 rounded-full overflow-hidden bg-on-surface/5">
                    <div
                      className="h-full rounded-l-full"
                      style={{
                        width: `${incomeShare}%`,
                        backgroundImage: 'linear-gradient(90deg, rgb(var(--md-sys-color-primary)) 0%, rgb(var(--md-sys-color-primary) / 0.6) 100%)',
                        boxShadow: '0 0 10px rgb(var(--md-sys-color-primary) / 0.35)'
                      }}
                    />
                    <div
                      className="h-full rounded-r-full"
                      style={{
                        width: `${expenseShare}%`,
                        backgroundImage: 'linear-gradient(90deg, rgb(var(--md-sys-color-secondary) / 0.6) 0%, rgb(var(--md-sys-color-secondary)) 100%)',
                        boxShadow: '0 0 10px rgb(var(--md-sys-color-secondary) / 0.35)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </m.div>

      {/* Tabs & Wallets/People Section */}
      <m.div variants={itemVariants} className="bg-surface-container-low rounded-2xl p-4 md:p-6 shadow-elevation-1 border border-outline-variant/10">
        <div className="flex gap-2 mb-6 bg-surface-container rounded-full p-1 w-fit overflow-x-auto max-w-full mx-auto justify-center">
          {(['wallets', 'people'] as Array<'wallets' | 'people'>).map((tab) => (
            <button
              key={tab}
              onClick={() => setDashboardTab(tab)}
              className={clsx(
                "px-4 md:px-5 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                dashboardTab === tab
                  ? "bg-secondary-container text-on-secondary-container shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest"
              )}
            >
              {tab === 'wallets' ? t.myWallets : t.people}
            </button>
          ))}
        </div>

        <div className="min-h-[100px]">
          {dashboardTab === 'wallets' && (
            <div className={clsx(
              "grid gap-2 sm:gap-3",
              state.accounts.length === 1 ? "grid-cols-1" :
                state.accounts.length === 2 ? "grid-cols-2" :
                  "grid-cols-3"
            )}>
              {walletSummaries
                .map(({ account: acc, balance }) => {
                  const Icon = ICONS[acc.icon as IconName] || (acc.type === 'cash' ? Banknote : acc.type === 'bank' ? CreditCard : Globe);
                  return (
                    <div
                      key={acc.id}
                      className="bg-surface-container p-3 md:p-4 rounded-xl flex flex-col items-center justify-center text-center gap-1 md:gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
                      style={{
                        boxShadow: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = `0 8px 25px -5px ${acc.color}40, 0 0 1px ${acc.color}30`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div className="flex flex-col items-center">
                        <div className="relative flex-shrink-0">
                          <div
                            className="relative w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center mb-1 z-10 transition-transform duration-200"
                            style={{
                              backgroundColor: `${acc.color}40`,
                              color: acc.color,
                              boxShadow: `0 0 15px ${acc.color}30`
                            }}
                          >
                            <Icon size={20} className="md:w-6 md:h-6" />
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-on-surface-variant leading-none">{acc.currency}</span>
                      </div>
                      <p className="text-sm sm:text-lg md:text-2xl font-display font-medium text-on-surface w-full truncate tabular-nums">{formatNumber(balance, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, state.language)}</p>
                    </div>
                  );
                })}
            </div>
          )}

          {dashboardTab === 'people' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activePeople.map(person => (
                <m.div
                  key={person.id}
                  variants={itemVariants}
                  onClick={() => setSelectedPerson(person)}
                  className="bg-surface-container p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden relative flex-shrink-0" style={{ backgroundColor: person.color }}>
                      {person.avatar ? (
                        person.avatar.startsWith('data:') || person.avatar.startsWith('http') ? (
                          <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">{person.avatar}</div>
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-on-primary">
                          <User size={24} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-on-surface truncate">{person.name}</p>
                      <p className="text-xs text-on-surface-variant">{person.defaultCurrency}</p>
                      {Object.entries(person.balances).map(([currency, balance]) => balance !== 0 && (
                        <p key={currency} className={clsx("text-sm font-mono mt-1", balance > 0 ? "text-tertiary" : "text-error")}>
                          {balance > 0 ? '+' : ''}{formatCurrency(balance, currency as Currency)}
                        </p>
                      ))}
                    </div>
                  </div>
                </m.div>
              ))}
              {activePeople.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={User}
                    title={t.noActiveBalances}
                    description={t.allDebtsSettled}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </m.div>

      {/* Floating Action Button with Menu */}
      <AnimatePresence>
        {isFabVisible && (
          <m.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6 right-[calc(1rem+env(safe-area-inset-right))] md:right-6 z-50"
          >
            <AnimatePresence>
              {isFabOpen && (
                <>
                  {/* Backdrop */}
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-scrim/20"
                    onClick={() => setIsFabOpen(false)}
                  />
                  {/* Menu Items */}
                  <m.div
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-16 right-0 flex flex-col gap-3 items-end"
                  >
                    {onOpenQuickSplit && (
                      <button
                        onClick={() => { onOpenQuickSplit(); setIsFabOpen(false); }}
                        className="flex items-center gap-3 bg-surface-container-high text-on-surface pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:bg-surface-container-highest transition-colors"
                      >
                        <span className="text-sm font-medium whitespace-nowrap">{t.split}</span>
                        <div className="w-10 h-10 bg-tertiary text-on-tertiary rounded-full flex items-center justify-center">
                          <Split size={20} />
                        </div>
                      </button>
                    )}
                    <button
                      onClick={() => { handleOpenAddTransaction('expense'); setIsFabOpen(false); }}
                      className="flex items-center gap-3 bg-surface-container-high text-on-surface pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:bg-surface-container-highest transition-colors"
                    >
                      <span className="text-sm font-medium whitespace-nowrap">{t.transaction}</span>
                      <div className="w-10 h-10 bg-primary text-on-primary rounded-full flex items-center justify-center">
                        <Banknote size={20} />
                      </div>
                    </button>
                  </m.div>
                </>
              )}
            </AnimatePresence>
            {/* Main FAB */}
            <m.button
              onClick={() => setIsFabOpen(!isFabOpen)}
              whileTap={{ scale: 0.9 }}
              className={clsx(
                "w-14 h-14 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center transition-all z-50 hover:shadow-2xl hover:shadow-primary/20",
                isFabOpen ? "rotate-45" : "hover:scale-105"
              )}
            >
              <Plus size={28} />
            </m.button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
};
