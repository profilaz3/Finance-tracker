import { useState } from 'react';
import type { Account, Currency } from '../../types';

interface UseAccountSettingsStateOptions {
  handleAddAccount: (account: Account) => void;
}

const getInitialAccountState = () => ({
  isAddingAccount: false,
  newAccountName: '',
  newAccountCurrency: 'RSD' as Currency,
  newAccountType: 'cash' as Account['type'],
});

export function useAccountSettingsState({ handleAddAccount }: UseAccountSettingsStateOptions) {
  const [isAddingAccount, setIsAddingAccount] = useState(getInitialAccountState().isAddingAccount);
  const [newAccountName, setNewAccountName] = useState(getInitialAccountState().newAccountName);
  const [newAccountCurrency, setNewAccountCurrency] = useState<Currency>(getInitialAccountState().newAccountCurrency);
  const [newAccountType, setNewAccountType] = useState<Account['type']>(getInitialAccountState().newAccountType);

  const resetAccountForm = () => {
    const initialState = getInitialAccountState();
    setIsAddingAccount(initialState.isAddingAccount);
    setNewAccountName(initialState.newAccountName);
    setNewAccountCurrency(initialState.newAccountCurrency);
    setNewAccountType(initialState.newAccountType);
  };

  const handleCreateAccount = () => {
    if (!newAccountName.trim()) {
      return;
    }

    handleAddAccount({
      id: crypto.randomUUID(),
      name: newAccountName.trim(),
      type: newAccountType,
      currency: newAccountCurrency,
      initialBalance: 0,
      color: '#10b981',
      icon: 'wallet',
    });

    resetAccountForm();
  };

  return {
    isAddingAccount,
    setIsAddingAccount,
    newAccountName,
    setNewAccountName,
    newAccountCurrency,
    setNewAccountCurrency,
    newAccountType,
    setNewAccountType,
    handleCreateAccount,
    resetAccountForm,
  };
}
