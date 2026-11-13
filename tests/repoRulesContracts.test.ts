import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const getFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap(entry => {
    const fullPath = `${directory}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return getFiles(fullPath);
    }

    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });

describe('repo rules contracts', () => {
  it('checks in a repo rules document with the main architecture guardrails', () => {
    const rules = readFileSync('docs/repo-rules.md', 'utf8');

    expect(rules).toContain('# Repo Rules');
    expect(rules).toContain('## Layer Boundaries');
    expect(rules).toContain('## Import Rules');
    expect(rules).toContain('## File Size Guidance');
    expect(rules).toContain('## Data Rules');
    expect(rules).toContain('## Testing Rules');
    expect(rules).toContain('Components do not import Supabase');
    expect(rules).toContain('Use `createId()` for new IDs');
  });

  it('keeps app shell navigation and view routing extracted out of App.tsx', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const navigation = readFileSync('components/app/AppNavigation.tsx', 'utf8');
    const router = readFileSync('components/app/AppViewRouter.tsx', 'utf8');
    const modals = readFileSync('components/app/AppModals.tsx', 'utf8');

    expect(app).toContain("import { AppNavigation } from './components/app/AppNavigation'");
    expect(app).toContain("import { AppViewRouter } from './components/app/AppViewRouter'");
    expect(app).toContain("import { AppModals } from './components/app/AppModals'");
    expect(app).not.toContain('const NavItem =');
    expect(app).not.toContain('const BottomNavItem =');
    expect(app).not.toContain('const currentViewContent =');
    expect(app).not.toContain('<SplitModal');
    expect(app).not.toContain('<EditTransactionModal');
    expect(navigation).toContain('export const AppNavigation');
    expect(router).toContain('export const AppViewRouter');
    expect(modals).toContain('export const AppModals');
    expect(router).toContain("currentView === 'dashboard'");
    expect(router).toContain("currentView === 'settings'");
  });

  it('keeps UI layers off direct Supabase client imports', () => {
    const uiFiles = ['App.tsx', ...getFiles('components')];
    const directSupabaseImports = uiFiles.filter(file => {
      const source = readFileSync(file, 'utf8');
      return source.includes('services/supabaseService');
    });

    expect(directSupabaseImports).toEqual([]);
  });

  it('keeps transaction route logic extracted behind domain and route modules', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const router = readFileSync('components/app/AppViewRouter.tsx', 'utf8');
    const transactionsView = readFileSync('components/TransactionsView.tsx', 'utf8');

    expect(app).toContain("import { createTransactionDraft } from './domain/transactions'");
    expect(router).toContain("from '../../domain/transactions'");
    expect(router).toContain('duplicateTransactionDraft');
    expect(transactionsView).toContain("import { TransactionsToolbar } from './transactions/TransactionsToolbar'");
    expect(transactionsView).toContain("import { TransactionsList } from './transactions/TransactionsList'");
    expect(transactionsView).toContain("import { TransactionsFab } from './transactions/TransactionsFab'");
    expect(transactionsView).toContain("import { filterTransactions, groupTransactionsByDate } from '../utils/transactionFilters'");
    expect(transactionsView).not.toContain('const getDateGroupLabel =');
    expect(transactionsView).not.toContain('const groupTransactionsByDate =');
  });

  it('keeps people and event mutations behind hooks and domain helpers', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const eventHandlers = readFileSync('hooks/useEventHandlers.ts', 'utf8');

    expect(app).toContain("import { usePeopleHandlers } from './hooks/usePeopleHandlers'");
    expect(app).not.toContain('const addPerson = async');
    expect(app).not.toContain('const updatePerson = async');
    expect(app).not.toContain('const createUserProfile = async');
    expect(app).not.toContain('const handleSettleUp = async');
    expect(eventHandlers).toContain('addEventToCollection');
    expect(eventHandlers).toContain("from '../domain/events'");
  });

  it('keeps transaction mutation orchestration behind the transaction hook', () => {
    const app = readFileSync('App.tsx', 'utf8');
    const transactionHandlers = readFileSync('hooks/useTransactionHandlers.ts', 'utf8');

    expect(app).toContain("import { useTransactionHandlers } from './hooks/useTransactionHandlers'");
    expect(app).not.toContain('const addTransaction = useCallback');
    expect(app).not.toContain('const deleteTransaction = async');
    expect(app).not.toContain('const batchDeleteTransactions = async');
    expect(app).not.toContain('const updateTransaction = async');
    expect(transactionHandlers).toContain('export function useTransactionHandlers');
    expect(transactionHandlers).toContain("import { convertAmount } from '../services/currencyService'");
  });

  it('keeps account and split orchestration out of App.tsx and behind focused modules', () => {
    const app = readFileSync('App.tsx', 'utf8');

    expect(app).toContain("import { useAccountHandlers } from './hooks/useAccountHandlers'");
    expect(app).toContain("import { useSplitHandlers } from './hooks/useSplitHandlers'");
    expect(app).toContain("import { useFinancialSelectors } from './hooks/useFinancialSelectors'");
    expect(app).not.toContain('const handleUpdateAccount = async');
    expect(app).not.toContain('const handleSplitTransaction = async');
    expect(app).not.toContain('const handleUnifiedSplit = async');
    expect(app).not.toContain('const totalBalance = useMemo');
    expect(app).not.toContain('const totalExpense = useMemo');
    expect(app).not.toContain('const totalIncome = useMemo');
    expect(app).not.toContain('const getAccountBalance =');
  });

  it('keeps settings and account view state extracted behind focused hooks', () => {
    const settingsView = readFileSync('components/settings/index.tsx', 'utf8');
    const accountSettings = readFileSync('components/settings/AccountSettings.tsx', 'utf8');
    const dataSettings = readFileSync('components/settings/DataSettings.tsx', 'utf8');

    expect(settingsView).toContain("import { useSettingsViewState } from './useSettingsViewState'");
    expect(settingsView).not.toContain("const [activeTab, setActiveTab] = useState");
    expect(accountSettings).toContain("import { useAccountSettingsState } from './useAccountSettingsState'");
    expect(accountSettings).not.toContain("const [isAddingAccount, setIsAddingAccount] = useState");
    expect(dataSettings).toContain("import { useRecurringSettingsState } from './useRecurringSettingsState'");
    expect(dataSettings).not.toContain("const [isAddingRecurring, setIsAddingRecurring] = useState");
  });

  it('keeps hooks independent from component modules and services below the hook layer', () => {
    const hookFiles = getFiles('hooks');
    const serviceFiles = getFiles('services');

    const hookComponentImports = hookFiles.filter(file => {
      const source = readFileSync(file, 'utf8');
      return source.includes('/components/') || source.includes("from '../components") || source.includes("from '../../components");
    });

    const serviceUpwardImports = serviceFiles.filter(file => {
      const source = readFileSync(file, 'utf8');
      return source.includes('/hooks/') || source.includes('/components/') || source.includes("from '../hooks") || source.includes("from '../components");
    });

    expect(hookComponentImports).toEqual([]);
    expect(serviceUpwardImports).toEqual([]);
  });
});
