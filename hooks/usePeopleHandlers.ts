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
import { TRANSLATIONS } from '../constants';
import { getTranslations } from '../utils/i18n';

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
      addToast(getTranslations().personSavedSyncFailed, 'error');
    }
  }, [addToast, createId, setState]);

  const updatePerson = useCallback(async (id: string, updates: Partial<Person>) => {
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
      addToast(getTranslations().personUpdatedSyncFailed, 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState, state.people]);

  const createUserProfile = useCallback(async (name: string, defaultCurrency: Currency, color: string, avatar?: string) => {
    const supabaseService = await getSupabaseService();
    const user = await supabaseService.getUser();
    const profileId = normalizeUserProfileId(undefined, user?.id) ?? LEGACY_USER_PROFILE_ID;
    const newProfile = buildUserProfile({ profileId, name, defaultCurrency, color, avatar });

    setState(prev => ({ ...prev, userProfile: newProfile }));
    addToast(TRANSLATIONS[state.language].profileCreated, 'success');
    closeUserProfileModal();
  }, [addToast, closeUserProfileModal, setState, state.language]);

  const updateUserProfile = useCallback(async (_id: string, updates: Partial<Person>) => {
    if (!state.userProfile) {
      return;
    }

    const updatedProfile = { ...state.userProfile, ...updates };
    setState(prev => ({ ...prev, userProfile: updatedProfile }));
    addToast(TRANSLATIONS[state.language].profileUpdated, 'success');
    closeUserProfileModal();
  }, [addToast, closeUserProfileModal, setState, state.language, state.userProfile]);

  const handleUpdatePersonBalance = useCallback(async (personId: string, currency: Currency, newBalance: number) => {
    const person = state.people.find(entry => entry.id === personId);
    if (!person) {
      return;
    }

    const { people, updatedPerson } = updatePersonBalanceInCollection(state.people, personId, currency, newBalance);
    if (!updatedPerson) {
      return;
    }

    setState(prev => ({
      ...prev,
      people: updatePersonBalanceInCollection(prev.people, personId, currency, newBalance).people,
    }));

    if (selectedPerson?.id === personId) {
      setSelectedPerson(updatedPerson);
    }

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(updatedPerson);
      addToast(getTranslations().balanceUpdatedFor.replace('{name}', person.name), 'success');
    } catch (error) {
      console.error('Failed to sync person balance:', error);
      addToast(getTranslations().balanceUpdatedSyncFailed, 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState, state.people]);

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
      addToast(getTranslations().personDeletedSyncFailed, 'error');
    }
  }, [addToast, selectedPerson?.id, setSelectedPerson, setState]);

  const handleAddAccount = useCallback(async (account: Account) => {
    setState(prev => ({ ...prev, accounts: addAccountToCollection(prev.accounts, account) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncAccount(account);
      addToast(getTranslations().walletAccountCreated, 'success');
    } catch (error) {
      console.error('Failed to sync new account:', error);
      addToast(getTranslations().walletAccountCreatedSyncFailed, 'error');
    }
  }, [addToast, setState]);

  const handleDeleteAccount = useCallback(async (id: string) => {
    if (state.accounts.length <= 1) {
      addToast(TRANSLATIONS[state.language].atLeastOneAccount, 'error');
      return;
    }

    if (!window.confirm(getTranslations().deleteWalletAccountConfirm)) {
      return;
    }

    setState(prev => ({ ...prev, accounts: removeAccountFromCollection(prev.accounts, id) }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.deleteAccount(id);
      addToast(getTranslations().walletAccountDeleted, 'info');
    } catch (error) {
      console.error('Failed to sync account deletion:', error);
      addToast(getTranslations().walletAccountDeletedSyncFailed, 'error');
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
      person,
      currency,
      categories: state.categories,
      defaultAccountId,
      settleAmount,
    });

    if (!settlement) {
      return;
    }

    await addTransaction(settlement.transaction);
    setState(prev => ({
      ...prev,
      people: updatePersonInCollection(prev.people, personId, { balances: settlement.updatedPerson.balances }),
    }));

    try {
      const syncManager = await getSyncManager();
      await syncManager.syncPerson(settlement.updatedPerson);
    } catch (error) {
      console.error('Failed to sync person settlement:', error);
    }

    addToast(settlement.isPartial ? getTranslations().partialSettlementRecorded : getTranslations().debtSettled, 'success');
  }, [addToast, addTransaction, createId, setState, state.accounts, state.categories, state.people]);

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

