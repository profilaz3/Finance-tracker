import { useState } from 'react';
import type { Account, Currency } from '../../types';
import { parseAmountInput } from '../../utils/numberInput';

interface UseAccountSettingsStateOptions {
  handleAddAccount: (account: Account) => void;
  language: 'en' | 'sr';
  /** Existing wallets: a new one goes after them (the database defaults order_index to 0, the top). */
  accounts?: Pick<Account, 'order'>[];
}

/** Order for a new wallet: after every existing one. */
export const nextAccountOrder = (accounts: Pick<Account, 'order'>[]): number =>
  accounts.reduce((max, account, index) => Math.max(max, account.order ?? index), -1) + 1;

const getInitialAccountState = () => ({
  isAddingAccount: false,
  newAccountName: '',
  newAccountCurrency: 'RSD' as Currency,
  newAccountType: 'cash' as Account['type'],
  newAccountBalance: '',
});

export function useAccountSettingsState({ handleAddAccount, language, accounts = [] }: UseAccountSettingsStateOptions) {
  const initial = getInitialAccountState();
  const [isAddingAccount, setIsAddingAccount] = useState(initial.isAddingAccount);
  const [newAccountName, setNewAccountName] = useState(initial.newAccountName);
  const [newAccountCurrency, setNewAccountCurrency] = useState<Currency>(initial.newAccountCurrency);
  const [newAccountType, setNewAccountType] = useState<Account['type']>(initial.newAccountType);
  const [newAccountBalance, setNewAccountBalance] = useState(initial.newAccountBalance);
  const [nameError, setNameError] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  const resetAccountForm = () => {
    const initialState = getInitialAccountState();
    setIsAddingAccount(initialState.isAddingAccount);
    setNewAccountName(initialState.newAccountName);
    setNewAccountCurrency(initialState.newAccountCurrency);
    setNewAccountType(initialState.newAccountType);
    setNewAccountBalance(initialState.newAccountBalance);
    setNameError(false);
    setBalanceError(false);
  };

  /** Returns false (and flags the field) when the form cannot be saved yet. */
  const handleCreateAccount = (): boolean => {
    const name = newAccountName.trim();
    const balance = newAccountBalance.trim() ? parseAmountInput(newAccountBalance, language) : 0;
    setNameError(!name);
    setBalanceError(balance === undefined);
    if (!name || balance === undefined) {
      return false;
    }

    handleAddAccount({
      id: crypto.randomUUID(),
      name,
      type: newAccountType,
      currency: newAccountCurrency,
      initialBalance: Math.round(balance * 100) / 100,
      color: '#10b981',
      icon: 'wallet',
      order: nextAccountOrder(accounts),
    });

    resetAccountForm();
    return true;
  };

  return {
    isAddingAccount,
    setIsAddingAccount,
    newAccountName,
    setNewAccountName: (value: string) => {
      setNewAccountName(value);
      if (value.trim()) setNameError(false);
    },
    newAccountCurrency,
    setNewAccountCurrency,
    newAccountType,
    setNewAccountType,
    newAccountBalance,
    setNewAccountBalance: (value: string) => {
      setNewAccountBalance(value);
      setBalanceError(false);
    },
    nameError,
    balanceError,
    handleCreateAccount,
    resetAccountForm,
  };
}
