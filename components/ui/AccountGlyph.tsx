import React from 'react';
import { Banknote, CreditCard, Landmark, PiggyBank, Wallet, type LucideIcon } from 'lucide-react';
import type { Account } from '../../types';
import { ACCOUNT_ICONS } from '../../utils/accountIcons';
import { CurrencyFlag } from './CurrencyFlag';
import { IconTile } from './IconTile';

const SAVINGS = /sav|štedn|stedn|reserve|rezerv|goal|cilj/i;

/**
 * Cash, bank, card and savings each get their own glyph. An icon the user picked wins; 'wallet'
 * is what new accounts get by default, so it still lets the type decide.
 */
export const accountIcon = (account: Pick<Account, 'type' | 'name' | 'icon'>): LucideIcon => {
  const picked = account.icon && account.icon !== 'wallet' ? ACCOUNT_ICONS[account.icon as keyof typeof ACCOUNT_ICONS] : undefined;
  if (picked) return picked;
  if (SAVINGS.test(account.name)) return PiggyBank;
  switch (account.type) {
    case 'cash': return Banknote;
    case 'bank': return Landmark;
    case 'digital': return CreditCard;
    default: return Wallet;
  }
};

/** An account on the shared tile in its own colour, with its currency flag in the corner. */
export const AccountGlyph: React.FC<{
  account: Pick<Account, 'type' | 'name' | 'icon' | 'color' | 'currency'>;
  size?: number;
  showCurrency?: boolean;
  className?: string;
}> = ({ account, size = 40, showCurrency = true, className }) => (
  <IconTile
    icon={accountIcon(account)}
    color={account.color}
    size={size}
    className={className}
    badge={showCurrency ? <CurrencyFlag currency={account.currency} size={Math.max(14, Math.round(size * 0.42))} /> : undefined}
  />
);
