import React, { Suspense, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { AppState, Event, Person, Transaction, View } from '../../types';
import { TRANSLATIONS } from '../../constants';
import type { ParsedTransaction } from '../../services/aiService';
import { duplicateTransactionDraft } from '../../domain/transactions';
import { PAGE_GAP, type SwipeDirection } from '../../hooks/useSwipePager';
import { PageActiveContext } from '../../hooks/useBackLayer';
import { requestSettingsSection } from '../settings/settingsSectionBus';
import { openTransactionDetails } from '../transaction-details/detailsBus';
import { requestSubscriptionsTab } from '../../services/subscriptionStore';

const Stats = lazyWithReload(() => import('../Stats').then(m => ({ default: m.Stats })));
const HomeView = lazyWithReload(() => import('../home').then(m => ({ default: m.HomeView })));
const BudgetsView = lazyWithReload(() => import('../BudgetsView').then(m => ({ default: m.BudgetsView })));
const PeopleView = lazyWithReload(() => import('../PeopleView').then(m => ({ default: m.PeopleView })));
const TransactionsView = lazyWithReload(() => import('../TransactionsView').then(m => ({ default: m.TransactionsView })));
const SettingsView = lazyWithReload(() => import('../settings').then(m => ({ default: m.SettingsView })));
const CalendarView = lazyWithReload(() => import('../CalendarView').then(m => ({ default: m.CalendarView })));
const EventsView = lazyWithReload(() => import('../EventsView').then(m => ({ default: m.EventsView })));
const EventDetailView = lazyWithReload(() => import('../event-detail').then(m => ({ default: m.EventDetailView })));
const InsightsView = lazyWithReload(() => import('../InsightsView').then(m => ({ default: m.InsightsView })));
// Shared and People: one page at a time, or on wide windows the list beside the open event or person.
const SplitWhenWide = lazyWithReload(() => import('../shared/SharedSplit'));

/** Fetch every page in the background so the first swipe or tap to each one is instant. */
export const preloadViews = (): Promise<unknown> =>
  // SplitWhenWide wraps Shared and People (every width), so it loads with them.
  [HomeView, TransactionsView, CalendarView, SplitWhenWide, EventsView, PeopleView, Stats, InsightsView, EventDetailView, SettingsView, BudgetsView]
    .reduce<Promise<unknown>>((chain, view) => chain.then(() => view.preload()).catch(() => undefined), Promise.resolve());

/** A neighbouring page rendered beside the current one while it is being swiped. */
export interface PagePeek {
  view: View;
  dir: SwipeDirection;
  /** Offset from the pager's top, so the page lands where it will sit once it is current. */
  top: number;
}
/** A neighbour mounted ahead of time, hidden, so a swipe only has to reveal it. */
export interface ParkedPage {
  view: View;
}
export interface PeekControl {
  /** Shows the live neighbour beside the current page, or hides it with null. */
  show: (peek: PagePeek | null) => void;
  /** Keeps exactly these neighbours mounted and hidden (an empty list drops them). */
  park: (pages: ParkedPage[]) => void;
}

const offscreen = (dir: SwipeDirection) => `translate3d(calc(${dir} * (100% + ${PAGE_GAP}px)), 0, 0)`;

/** Shows a parked page as the live neighbour without a React render. */
const revealParked = (el: HTMLElement, peek: PagePeek) => {
  el.style.transition = 'none';
  el.style.top = `${peek.top}px`;
  el.style.transform = offscreen(peek.dir);
  el.style.willChange = 'transform';
  el.setAttribute('data-pager-peek', String(peek.dir));
};

const concealParked = (el: HTMLElement) => {
  el.removeAttribute('data-pager-peek');
  el.style.transition = '';
  el.style.top = '0px';
  el.style.transform = '';
  el.style.willChange = '';
};

/**
 * A page's body. While parked, app updates reach it at background priority: the urgent render
 * keeps its previous element (React skips the subtree) and the catch-up render is interruptible.
 * The same component wraps every role, so a page changing role never remounts.
 */
const PageBody: React.FC<{ content: React.ReactNode; defer: boolean }> = ({ content, defer }) => {
  const deferred = useDeferredValue(content);
  return <>{defer ? deferred : content}</>;
};

interface PagerPagesProps {
  currentView: View;
  current: React.ReactNode;
  renderPeek: (view: View) => React.ReactNode;
  peekControlRef?: React.MutableRefObject<PeekControl | null>;
  fallback?: React.ReactNode;
}

/**
 * The current page, the neighbours parked beside it, and (during a swipe) the live neighbour.
 * All live in one keyed list in a stable order, so when a swipe commits the neighbour's
 * instance simply becomes the page and the old page becomes a parked neighbour: nothing
 * remounts and no DOM node moves.
 *
 * Parked pages are mounted while the app is idle and kept hidden (no paint, no height, so they
 * add no scroll range); revealing one at the start of a swipe is a few style writes instead of
 * rendering a whole page. A neighbour that is not parked yet is mounted on demand as before.
 */
const PagerPages: React.FC<PagerPagesProps> = ({ currentView, current, renderPeek, peekControlRef, fallback }) => {
  const [peek, setPeek] = useState<PagePeek | null>(null);
  const [parked, setParked] = useState<ParkedPage[]>([]);
  const parkedRef = useRef(parked);
  parkedRef.current = parked;
  const peekRef = useRef(peek);
  peekRef.current = peek;
  const elements = useRef(new Map<View, HTMLDivElement>());
  const revealed = useRef<HTMLElement | null>(null);
  // A park request that arrived while a neighbour was on screen; applied once it is hidden.
  const pendingPark = useRef<ParkedPage[] | null>(null);
  // The neighbours still to be parked, one step at a time.
  const targetPark = useRef<ParkedPage[] | null>(null);
  // Stable first-seen order, so pages never swap places in the DOM when their roles change.
  const order = useRef<View[]>([]);

  // The page being left stays mounted as a parked neighbour (swiping straight back is then
  // instant and keeps its state); the next park request decides whether it is still needed.
  const [lastView, setLastView] = useState(currentView);
  if (lastView !== currentView) {
    setLastView(currentView);
    setParked(prev => (prev.some(page => page.view === lastView) ? prev : [...prev, { view: lastView }]));
  }

  const conceal = useCallback(() => {
    if (revealed.current) concealParked(revealed.current);
    revealed.current = null;
  }, []);

  // Parks toward the requested list one page per step, so each mount is its own short commit
  // instead of one long one. Renders run in a transition: a touch arriving mid-render is handled.
  const stepPark = useCallback(() => {
    const target = targetPark.current;
    if (!target) return;
    const current = parkedRef.current;
    // Pages already mounted stay.
    const kept = target.filter(t => current.some(page => page.view === t.view));
    const missing = target.filter(t => !kept.includes(t));
    const next = missing.length ? [...kept, missing[0]] : kept;
    if (missing.length <= 1) targetPark.current = null;
    const same = next.length === current.length
      && next.every((page, index) => page.view === current[index].view);
    if (!same) {
      startTransition(() => setParked(next));
    }
  }, []);

  useEffect(() => {
    if (!targetPark.current) return;
    const run = () => {
      if (!revealed.current && !peekRef.current) stepPark();
    };
    const idle = 'requestIdleCallback' in window
      ? window.requestIdleCallback(run, { timeout: 1000 })
      : (window as Window).setTimeout(run, 50);
    return () => {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idle);
      else (window as Window).clearTimeout(idle);
    };
  }, [parked, stepPark]);

  useLayoutEffect(() => {
    if (!peekControlRef) return;
    const applyPark = (pages: ParkedPage[]) => {
      targetPark.current = pages;
      stepPark();
    };
    peekControlRef.current = {
      show: next => {
        const el = next && parkedRef.current.some(page => page.view === next.view) ? elements.current.get(next.view) : undefined;
        if (el && el !== revealed.current) conceal();
        if (el) {
          revealParked(el, next!);
          revealed.current = el;
          setPeek(prev => (prev === null ? prev : null));
          return;
        }
        conceal();
        if (!next) {
          setPeek(prev => (prev === null ? prev : null));
          const pending = pendingPark.current;
          pendingPark.current = null;
          if (pending) applyPark(pending);
          else if (targetPark.current) stepPark();
          return;
        }
        startTransition(() => setPeek(next));
      },
      park: pages => {
        // Never restyle a page while it rides beside the finger.
        if (revealed.current || peekRef.current) {
          pendingPark.current = pages;
          return;
        }
        pendingPark.current = null;
        applyPark(pages);
      },
    };
    return () => {
      peekControlRef.current = null;
    };
  }, [peekControlRef, conceal, stepPark]);

  // The page that just became current may have been revealed imperatively: hand it back to React.
  useLayoutEffect(() => {
    const el = elements.current.get(currentView);
    if (el && el === revealed.current) {
      el.removeAttribute('data-pager-peek');
      revealed.current = null;
    }
    setPeek(prev => (prev && prev.view === currentView ? null : prev));
  }, [currentView]);

  // Neighbour bodies are built once per router render, so peek/park updates (which re-render
  // only this list) never re-render the pages themselves.
  const contentCache = useMemo(() => new Map<View, React.ReactNode>(), [renderPeek]);
  const contentFor = (view: View) => {
    if (!contentCache.has(view)) contentCache.set(view, renderPeek(view));
    return contentCache.get(view);
  };

  const shell = (view: View, content: React.ReactNode, role: 'current' | 'peek' | 'parked', spec?: PagePeek) => (
    <div
      key={view}
      ref={(el: HTMLDivElement) => {
        elements.current.set(view, el);
        return () => {
          if (elements.current.get(view) === el) elements.current.delete(view);
        };
      }}
      data-pager-page={role === 'current' ? '' : undefined}
      data-pager-peek={role === 'peek' ? String(spec!.dir) : undefined}
      data-pager-park={role === 'parked' ? view : undefined}
      aria-hidden={role === 'current' ? undefined : true}
      inert={role === 'current' ? undefined : true}
      className={role === 'current' ? 'app-view-enter' : 'pointer-events-none'}
      style={role === 'peek' ? {
        position: 'absolute',
        top: spec!.top,
        left: 0,
        right: 0,
        transform: offscreen(spec!.dir),
        willChange: 'transform',
      } : role === 'parked' ? {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
      } : undefined}
    >
      <div data-pager-content="">
        <PageActiveContext.Provider value={role === 'current'}>
          <Suspense fallback={role === 'current' ? fallback : null}>
            <PageBody content={content} defer={role === 'parked'} />
          </Suspense>
        </PageActiveContext.Provider>
      </div>
    </div>
  );

  const byView = new Map<View, React.ReactNode>();
  byView.set(currentView, shell(currentView, current, 'current'));
  parked.forEach(page => {
    if (!byView.has(page.view)) byView.set(page.view, shell(page.view, contentFor(page.view), 'parked'));
  });
  if (peek && !byView.has(peek.view)) byView.set(peek.view, shell(peek.view, contentFor(peek.view), 'peek', peek));
  byView.forEach((_, view) => {
    if (!order.current.includes(view)) order.current.push(view);
  });
  order.current = order.current.filter(view => byView.has(view));
  return <>{order.current.map(view => byView.get(view))}</>;
};

interface AppViewRouterProps {
  currentView: View;
  /** Lets the app show a live neighbouring page during a swipe. */
  peekControlRef?: React.MutableRefObject<PeekControl | null>;
  /** Shown while the current page's code is still loading. */
  pageFallback?: React.ReactNode;
  state: AppState;
  /** The entry open in the Activity side pane (wide windows), for its row highlight and arrow keys. */
  paneDetailsId?: string | null;
  homeEditing: boolean;
  setHomeEditing: (editing: boolean) => void;
  onNavigate: (view: View) => void;
  onOpenProfile: () => void;
  onOpenAdd: () => void;
  selectedEvent: Event | null;
  setSelectedEvent: (event: Event | null) => void;
  /** The open person (their page is a panel, or on wide windows the right-hand column of Shared). */
  selectedPerson?: Person | null;
  setSelectedPerson: (person: Person | null) => void;
  setSelectedTransaction: (transaction: Transaction | null) => void;
  setCurrentView: (view: View) => void;
  setSplitTransactionContext: (transaction: Transaction | undefined) => void;
  activeEvent?: Event;
  linkToActiveEvent: boolean;
  setLinkToActiveEvent: (value: boolean) => void;
  addTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => void;
  handleParsedTransaction: (parsed: ParsedTransaction) => void;
  handleSaveAsTemplate: (transaction: Transaction) => void;
  handleUseTemplate: (templateId: string) => void;
  handleDeleteTemplate: (templateId: string) => void;
  handleUpdateEvent: (id: string, updates: Partial<Event>) => Promise<void>;
  handleShareEvent: (id: string, email: string) => Promise<void>;
  handleDeleteEvent: (id: string) => Promise<void>;
  handleAddSharedExpense: (expense: AppState['sharedExpenses'][number]) => Promise<void>;
  handleDeleteSharedExpense: (id: string) => Promise<void>;
  batchDeleteTransactions: (ids: string[]) => void;
  createId: () => string;
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  getAccountBalance: (account: AppState['accounts'][number]) => number;
  processRecurringTransactions: () => void;
  handleUpdateAccount: (accountId: string, updates: Partial<AppState['accounts'][number]>) => void;
  handleAddAccount: (account: AppState['accounts'][number]) => void;
  handleDeleteAccount: (accountId: string) => void;
  handleDeleteUserAccount: () => Promise<AppState>;
  handleLogout: (options?: { everywhere?: boolean }) => Promise<AppState>;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  setIsAddPersonModalOpen: (isOpen: boolean) => void;
  setIsEditModalOpen: (isOpen: boolean) => void;
  setIsSplitModalOpen: (isOpen: boolean) => void;
  setIsEventCreationModalOpen: (isOpen: boolean) => void;
  setIsReceiptScanModalOpen: (isOpen: boolean) => void;
  setIsSplitExpenseModalOpen: (isOpen: boolean) => void;
  setIsUserProfileModalOpen: (isOpen: boolean) => void;
  handleAddCategory: (category: AppState['categories'][number]) => void;
  handleUpdateCategory: (category: AppState['categories'][number]) => void;
  handleDeleteCategory: (categoryId: string) => void;
  handleAddRecurring: (recurring: AppState['recurringTransactions'][number]) => Promise<void>;
  handleUpdateRecurring: (id: string, updates: Partial<AppState['recurringTransactions'][number]>) => Promise<void>;
  handleDeleteRecurring: (id: string) => Promise<void>;
  handleToggleRecurring: (id: string) => Promise<void>;
  handleSettleUp: (personId: string, currency: AppState['baseCurrency'], amount?: number) => void;
  workspaceId: string | null;
  onWorkspaceChange: (teamId: string | null) => void;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', action?: { label: string; onClick: () => void }) => void;
  handleOpenAddTransaction: (type?: Transaction['type'], personId?: string) => void;
}

export const AppViewRouter: React.FC<AppViewRouterProps> = props => (
  <PagerPages
    currentView={props.currentView}
    current={<PageContent {...props} />}
    renderPeek={view => <PageContent {...props} currentView={view} />}
    peekControlRef={props.peekControlRef}
    fallback={props.pageFallback}
  />
);

/** The body of one page. Also rendered for the live neighbour while swiping. */
const PageContent: React.FC<AppViewRouterProps> = ({
  currentView,
  state,
  paneDetailsId = null,
  homeEditing,
  setHomeEditing,
  onNavigate,
  onOpenProfile,
  onOpenAdd,
  selectedEvent,
  setSelectedEvent,
  selectedPerson = null,
  setSelectedPerson,
  setSelectedTransaction,
  setCurrentView,
  setSplitTransactionContext,
  activeEvent,
  handleOpenAddTransaction,
  handleParsedTransaction,
  handleSaveAsTemplate,
  handleUseTemplate,
  addTransaction,
  deleteTransaction,
  handleUpdateEvent,
  handleShareEvent,
  handleDeleteEvent,
  handleAddSharedExpense,
  handleDeleteSharedExpense,
  batchDeleteTransactions,
  createId,
  totalBalance,
  totalExpense,
  getAccountBalance,
  processRecurringTransactions,
  handleUpdateAccount,
  handleAddAccount,
  handleDeleteAccount,
  handleDeleteUserAccount,
  handleLogout,
  setState,
  setIsAddPersonModalOpen,
  setIsEditModalOpen,
  setIsSplitModalOpen,
  setIsEventCreationModalOpen,
  setIsSplitExpenseModalOpen,
  setIsUserProfileModalOpen,
  handleAddCategory,
  handleUpdateCategory,
  handleDeleteCategory,
  handleAddRecurring,
  handleUpdateRecurring,
  handleDeleteRecurring,
  handleToggleRecurring,
  handleSettleUp,
  workspaceId,
  onWorkspaceChange,
  addToast,
}) => (
  <>
    {currentView === 'dashboard' && (
      <HomeView
        state={state}
        activeTeam={workspaceId ? state.teams?.find(team => team.id === workspaceId) : undefined}
        netWorth={totalBalance}
        getAccountBalance={getAccountBalance}
        activeEvent={activeEvent}
        editing={homeEditing}
        onEditingChange={setHomeEditing}
        onLayoutChange={homeLayout => setState(prev => ({ ...prev, homeLayout }))}
        onHeaderChange={homeHeader => setState(prev => ({ ...prev, homeHeader }))}
        onOpenProfile={onOpenProfile}
        actions={{
          openBudgets: () => onNavigate('budgets'),
          openActivity: () => onNavigate('transactions'),
          openInsights: () => onNavigate('analytics'),
          openEvents: () => onNavigate('events'),
          openEvent: event => {
            setSelectedEvent(event);
            onNavigate('events');
          },
          createEvent: () => setIsEventCreationModalOpen(true),
          openPeople: () => onNavigate('people'),
          openPerson: person => setSelectedPerson(person),
          openWallets: () => {
            requestSettingsSection('wallets');
            onNavigate('settings');
          },
          openTransaction: transaction => openTransactionDetails(transaction.id),
          openRecurring: () => {
            requestSettingsSection('recurring');
            onNavigate('settings');
          },
          useTemplate: handleUseTemplate,
          addEntry: onOpenAdd,
        }}
        onToast={addToast}
      />
    )}
    {currentView === 'budgets' && (
      <BudgetsView
        // Each workspace has its own budget: switching workspaces starts the form from that one.
        key={workspaceId ?? 'personal'}
        state={state}
        setState={setState}
        workspaceId={workspaceId}
        onBack={() => onNavigate('dashboard')}
        onSaved={message => addToast(message, 'success')}
        onAddRecurring={handleAddRecurring}
        onToast={addToast}
        onOpenCalendar={() => onNavigate('calendar')}
      />
    )}
    {currentView === 'people' && (
      <SplitWhenWide
        language={state.language}
        personOpen={!!selectedPerson}
        peopleOnly
        onAddPerson={() => setIsAddPersonModalOpen(true)}
        renderList={split => (
          <PeopleView
            people={state.people}
            onAddPerson={() => setIsAddPersonModalOpen(true)}
            onSelectPerson={setSelectedPerson}
            selectedPersonId={split ? selectedPerson?.id : undefined}
            onAddTransaction={handleOpenAddTransaction}
            onSettleUp={handleSettleUp}
            baseCurrency={state.baseCurrency}
            rates={state.rates}
            language={state.language}
            selfId={state.userProfile?.id}
            homeHeader={state.homeHeader}
            onBack={() => onNavigate('events')}
          />
        )}
      />
    )}
    {currentView === 'transactions' && (
      <TransactionsView
        state={state}
        setState={setState}
        onToast={addToast}
        setSelectedTransaction={setSelectedTransaction}
        setIsEditModalOpen={setIsEditModalOpen}
        setIsSplitModalOpen={setIsSplitModalOpen}
        deleteTransaction={deleteTransaction}
        onEditSplitTransaction={(tx) => {
          setSplitTransactionContext(tx);
          setIsSplitExpenseModalOpen(true);
        }}
        onDuplicateTransaction={(tx) => {
          const duplicated = duplicateTransactionDraft(tx, { createId });
          setSelectedTransaction(duplicated);
          setIsEditModalOpen(true);
        }}
        onParsedTransaction={handleParsedTransaction}
        onSaveAsTemplate={handleSaveAsTemplate}
        onBatchDelete={batchDeleteTransactions}
        onAddTransaction={handleOpenAddTransaction}
        onOpenCalendar={() => onNavigate('calendar')}
        paneDetailsId={paneDetailsId}
      />
    )}
    {currentView === 'events' && (
      <SplitWhenWide
        language={state.language}
        personOpen={!!selectedPerson}
        onCreateEvent={() => setIsEventCreationModalOpen(true)}
        onAddPerson={() => setIsAddPersonModalOpen(true)}
        renderDetail={selectedEvent ? split => (
          <EventDetailView
            key={selectedEvent.id}
            inPane={split}
            event={selectedEvent}
            state={state}
            onBack={() => setSelectedEvent(null)}
            onUpdateEvent={handleUpdateEvent}
            onShareEvent={handleShareEvent}
            onDeleteEvent={handleDeleteEvent}
            onAddSharedExpense={handleAddSharedExpense}
            onUpdateSharedExpense={handleAddSharedExpense}
            onDeleteSharedExpense={handleDeleteSharedExpense}
            onEditTransaction={(tx) => {
              setSelectedTransaction(tx);
              setIsEditModalOpen(true);
            }}
            onDeleteTransaction={deleteTransaction}
            onShowToast={addToast}
          />
        ) : undefined}
        renderList={split => (
          <EventsView
            state={state}
            onCreateEvent={() => setIsEventCreationModalOpen(true)}
            onSelectEvent={event => {
              // Side by side, the right column shows one thing: the event replaces an open person.
              if (split) setSelectedPerson(null);
              setSelectedEvent(event);
            }}
            onOpenPeople={() => onNavigate('people')}
            onAddPerson={() => setIsAddPersonModalOpen(true)}
            onSelectPerson={person => {
              if (split) setSelectedEvent(null);
              setSelectedPerson(person);
            }}
            selectedEventId={split ? selectedEvent?.id : undefined}
            selectedPersonId={split ? selectedPerson?.id : undefined}
          />
        )}
      />
    )}
    {currentView === 'calendar' && (
      <CalendarView
        state={state}
        onOpenList={() => onNavigate('transactions')}
        onOpenRecurring={() => {
          requestSettingsSection('recurring');
          onNavigate('settings');
        }}
        setSelectedTransaction={setSelectedTransaction}
        setIsEditModalOpen={setIsEditModalOpen}
        setIsSplitModalOpen={setIsSplitModalOpen}
        deleteTransaction={deleteTransaction}
        onEditSplitTransaction={(tx) => {
          setSplitTransactionContext(tx);
          setIsSplitExpenseModalOpen(true);
        }}
      />
    )}
    {currentView === 'analytics' && (
      <Stats
        transactions={state.transactions}
        categories={state.categories}
        accounts={state.accounts}
        recurringTransactions={state.recurringTransactions}
        baseCurrency={state.baseCurrency}
        rates={state.rates}
        language={state.language}
        totalExpense={totalExpense}
        events={state.events}
        homeHeader={state.homeHeader}
        onNavigate={onNavigate}
      />
    )}
    {currentView === 'insights' && <InsightsView state={state} onNavigate={onNavigate} />}
    {currentView === 'settings' && (
      <SettingsView
        state={state}
        setState={setState}
        handleUpdateAccount={handleUpdateAccount}
        handleAddAccount={handleAddAccount}
        handleDeleteAccount={handleDeleteAccount}
        setIsAddPersonModalOpen={setIsAddPersonModalOpen}
        setSelectedPerson={setSelectedPerson}
        handleOpenAddTransaction={handleOpenAddTransaction}
        getAccountBalance={getAccountBalance}
        onLogout={async () => {
          const freshState = await handleLogout();
          setState(freshState);
        }}
        onLogoutEverywhere={async () => {
          const freshState = await handleLogout({ everywhere: true });
          setState(freshState);
        }}
        onDeleteAccount={async () => {
          const t = TRANSLATIONS[state.language];
          try {
            const freshState = await handleDeleteUserAccount();
            setState(freshState);
            addToast(t.accountDeletedSuccess, 'success');
          } catch (error: unknown) {
            console.error('Failed to delete account:', error);
            const errorMessage = error instanceof Error ? error.message : t.unknownError;
            addToast(t.accountDeleteFailed.replace('{error}', errorMessage), 'error');
          }
        }}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onCreateUserProfile={() => setIsUserProfileModalOpen(true)}
        onEditUserProfile={() => setIsUserProfileModalOpen(true)}
        onAddRecurring={handleAddRecurring}
        onUpdateRecurring={handleUpdateRecurring}
        onDeleteRecurring={handleDeleteRecurring}
        onToggleRecurring={handleToggleRecurring}
        onProcessRecurring={processRecurringTransactions}
        onSettleUp={handleSettleUp}
        onToast={addToast}
        workspaceId={workspaceId}
        onWorkspaceChange={onWorkspaceChange}
        netWorth={totalBalance}
        onBack={() => onNavigate('dashboard')}
        onOpenBudgets={() => onNavigate('budgets')}
        onOpenSubscriptions={() => {
          requestSubscriptionsTab();
          onNavigate('budgets');
        }}
        onCustomizeHome={() => {
          onNavigate('dashboard');
          setHomeEditing(true);
        }}
      />
    )}
  </>
);
