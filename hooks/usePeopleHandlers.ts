import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getSupabaseService, getSyncManager } from '../services/runtimeServices';
import { Account, AppState, Category, Currency, Person, Transaction } from '../types';
import {
  addAccountToCollection,
  buildPerson,
  buildSettlementDraft,
  buildUserProfile,
  removeAccountFromCollection,
  removePersonFromCollection,
  updatePersonBalanceInCollection,
  updatePersonInCollection,
} from '../domain/people';
import { LEGACY_USER_PROFILE_ID, normalizeUserProfileId } from '../utils/remotePeople';
import { calculateBalanceOffset, getEffectivePersonBalances } from '../domain/balances';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type AddToast = (message: string, type: ToastType, action?: { label: string; onClick: () => void }) => void;

interface UsePeopleHandlersOptions {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  selectedPerson: Person | null;
  setSelectedPerson: Dispatch<SetStateAction<Person | null>>;
  closeUserProfileModal: () => void;
  addToast: AddToast;
  addTransaction: (transaction: Transaction) => Promise<void>;
  createId: () => string;
}

export function usePeopleHandlers({
  state,
  setState,
  selectedPerson,
  setSelectedPerson,
  closeUserProfileModal,
  addToast,
  addTransaction,
  createId,
}: UsePeopleHandlersOptions) {
  const addPerson = useCallback(async (name: string, defaultCurrency: Currency, color: string, avatar?: string) => {
    const newPerson = buildPerson({ createId, name, defaultCurrency, color, avatar });
    setState(prev => ({ ...prev, people: [...prev.people, newPerson] }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(newPerson);
    } catch (error) {
      console.error('Failed to sync person:', error);
      addToast('Person saved locally, but sync failed', 'error');
    }
  }, [addToast, createId, setState]);

  const updatePerson = useCallback(async (id: string, rawUpdates: Partial<Person>) => {
    // Balances are derived (domain/balances.ts); profile edits must not overwrite
    // the stored offsets with displayed (effective) balances.
    const { balances: _ignoredBalances, ...updates } = rawUpdates;
    const updatedPeople = updatePersonInCollection(state.people, id, updates);
    const updatedPerson = updatedPeople.find(person => person.id === id);

    setState(prev => ({
      ...prev,
      people: updatePersonInCollection(prev.people, id, updates),
    }));

    if (selectedPerson?.id === id) {
      setSelectedPerson(prev => prev ? { ...prev, ...updates } : null);
    }

    if (!updatedPerson) {
      return;
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(updatedPerson);
    } catch (error) {
      console.error('Failed to sync person update:', error);
      addToast('Person updated locally, but sync failed', 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState, state.people]);

  const createUserProfile = useCallback(async (name: string, defaultCurrency: Currency, color: string, avatar?: string) => {
    const supabaseService = await getSupabaseService();
    const user = await supabaseService.getUser();
    const profileId = normalizeUserProfileId(undefined, user?.id) ?? LEGACY_USER_PROFILE_ID;
    const newProfile = buildUserProfile({ profileId, name, defaultCurrency, color, avatar });

    setState(prev => ({ ...prev, userProfile: newProfile }));
    addToast(state.language === 'sr' ? 'Profil napravljen' : 'Profile created', 'success');
    closeUserProfileModal();
  }, [addToast, closeUserProfileModal, setState, state.language]);

  const updateUserProfile = useCallback(async (_id: string, updates: Partial<Person>) => {
    if (!state.userProfile) {
      return;
    }

    const updatedProfile = { ...state.userProfile, ...updates };
    setState(prev => ({ ...prev, userProfile: updatedProfile }));
    addToast(state.language === 'sr' ? 'Profil azuriran' : 'Profile updated', 'success');
    closeUserProfileModal();
  }, [addToast, closeUserProfileModal, setState, state.language, state.userProfile]);

  const handleUpdatePersonBalance = useCallback(async (personId: string, currency: Currency, newBalance: number) => {
    const person = state.people.find(entry => entry.id === personId);
    if (!person) {
      return;
    }

    // `newBalance` is the balance the user wants to see. Only the manual offset is
    // stored; transaction effects keep being derived on top of it.
    const offset = calculateBalanceOffset(person, state.transactions, currency, newBalance);
    const { updatedPerson } = updatePersonBalanceInCollection(state.people, personId, currency, offset);
    if (!updatedPerson) {
      return;
    }

    setState(prev => ({
      ...prev,
      people: updatePersonBalanceInCollection(prev.people, personId, currency, offset).people,
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(updatedPerson);
      addToast(`Balance updated for ${person.name}`, 'success');
    } catch (error) {
      console.error('Failed to sync person balance:', error);
      addToast('Balance updated locally, but sync failed', 'error');
    }
  }, [addToast, setState, state.people, state.transactions]);

  const deletePerson = useCallback(async (id: string) => {
    setState(prev => ({ ...prev, people: removePersonFromCollection(prev.people, id) }));
    if (selectedPerson?.id === id) {
      setSelectedPerson(null);
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.deletePerson(id);
    } catch (error) {
      console.error('Failed to delete person from Supabase:', error);
      addToast('Person deleted locally, but sync failed', 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState]);

  const handleAddAccount = useCallback(async (account: Account) => {
    setState(prev => ({ ...prev, accounts: addAccountToCollection(prev.accounts, account) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncAccount(account);
      addToast('Account created', 'success');
    } catch (error) {
      console.error('Failed to sync new account:', error);
      addToast('Account created locally, but sync failed', 'error');
    }
  }, [addToast, setState]);

  const handleDeleteAccount = useCallback(async (id: string) => {
    if (state.accounts.length <= 1) {
      addToast(state.language === 'sr' ? 'Morate imati bar jedan racun.' : 'You must have at least one account.', 'error');
      return;
    }

    if (!window.confirm('Are you sure? Transactions linked to this account will remain but might need attention.')) {
      return;
    }

    setState(prev => ({ ...prev, accounts: removeAccountFromCollection(prev.accounts, id) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteAccount(id);
      addToast('Account deleted', 'info');
    } catch (error) {
      console.error('Failed to sync account deletion:', error);
      addToast('Account deleted locally, but sync failed', 'error');
    }
  }, [addToast, setState, state.accounts.length, state.language]);

  const handleSettleUp = useCallback(async (personId: string, currency: Currency, settleAmount?: number) => {
    const person = state.people.find(entry => entry.id === personId);
    const defaultAccountId = state.accounts[0]?.id;
    if (!person || !defaultAccountId) {
      return;
    }

    const settlement = buildSettlementDraft({
      createId,
      person: { ...person, balances: getEffectivePersonBalances(person, state.transactions) },
      currency,
      categories: state.categories,
      defaultAccountId,
      settleAmount,
    });

    if (!settlement) {
      return;
    }

    const { createdCategory } = settlement;
    if (createdCategory) {
      setState(prev => (
        prev.categories.some(category => category.id === createdCategory.id)
          ? prev
          : { ...prev, categories: [...prev.categories, createdCategory] }
      ));
      try {
        const syncManager = await getSyncManager();
        await syncManager.syncCategory(createdCategory);
      } catch (error) {
        console.error('Failed to sync repayment category:', error);
      }
    }

    // The settlement transaction itself moves the derived balance; nothing else to write.
    await addTransaction(settlement.transaction);

    addToast(settlement.isPartial ? 'Partial settlement recorded' : 'Debt settled', 'success');
  }, [addToast, addTransaction, createId, setState, state.accounts, state.categories, state.people, state.transactions]);

  const handleAddCategory = useCallback(async (category: Category) => {
    setState(prev => ({ ...prev, categories: [...prev.categories, category] }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.syncCategory(category);
    } catch (error) {
      console.error(error);
    }
  }, [setState]);

  const handleUpdateCategory = useCallback(async (category: Category) => {
    setState(prev => ({ ...prev, categories: prev.categories.map(existing => existing.id === category.id ? category : existing) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.syncCategory(category);
    } catch (error) {
      console.error(error);
    }
  }, [setState]);

  const handleDeleteCategory = useCallback(async (id: string) => {
    setState(prev => ({ ...prev, categories: prev.categories.filter(category => category.id !== id) }));
    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteCategory(id);
    } catch (error) {
      console.error(error);
    }
  }, [setState]);

  return {
    addPerson,
    updatePerson,
    createUserProfile,
    updateUserProfile,
    handleUpdatePersonBalance,
    deletePerson,
    handleAddAccount,
    handleDeleteAccount,
    handleSettleUp,
    handleAddCategory,
    handleUpdateCategory,
    handleDeleteCategory,
  };
}

