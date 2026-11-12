import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('transaction modal contracts', () => {
  it('keeps EditTransactionModal focused on modal coordination', () => {
    const editTransactionModal = readFileSync('components/EditTransactionModal.tsx', 'utf8');
    const sourceLines = editTransactionModal.trimEnd().split(/\r?\n/).length;

    expect(sourceLines).toBeLessThanOrEqual(320);
  });

  it('derives new-transaction mode from persisted state instead of treating any draft object as edit mode', () => {
    const appModals = readFileSync('components/app/AppModals.tsx', 'utf8');
    const editTransactionModal = readFileSync('components/EditTransactionModal.tsx', 'utf8');

    expect(appModals).toContain(
      'const isNewTransaction = !!selectedTransaction && !state.transactions.some(transaction => transaction.id === selectedTransaction.id);'
    );
    expect(appModals).toContain('isNewTransaction={isNewTransaction}');
    expect(editTransactionModal).toContain('isNewTransaction?: boolean;');
    expect(editTransactionModal).toContain('isNewTransaction = false,');
    expect(editTransactionModal).not.toContain('const isNewTransaction = !transaction;');
    expect(editTransactionModal).toContain("{isNewTransaction ? (t.addTransaction || 'New Transaction') : t.editTransaction}");
    expect(editTransactionModal).toContain('{!isNewTransaction ? (');
  });

  it('uses shared number input parsers for transaction amount and optional numeric fields', () => {
    const editTransactionModal = readFileSync('components/EditTransactionModal.tsx', 'utf8');
    const amountFields = readFileSync('components/transaction-modal/AmountFields.tsx', 'utf8');
    const moreOptionsFields = readFileSync('components/transaction-modal/MoreOptionsFields.tsx', 'utf8');
    const receiptFields = readFileSync('components/transaction-modal/ReceiptFields.tsx', 'utf8');
    const modalSources = [editTransactionModal, amountFields, moreOptionsFields, receiptFields].join('\n');

    expect(amountFields).toMatch(
      /import \{[^}]*parseRequiredNumberInput[^}]*\} from ['"]\.\.\/\.\.\/utils\/numberInput['"];/
    );
    expect(moreOptionsFields).toMatch(
      /import \{[^}]*parseOptionalNumberInput[^}]*\} from ['"]\.\.\/\.\.\/utils\/numberInput['"];/
    );
    expect(receiptFields).toMatch(
      /import \{[^}]*parseRequiredNumberInput[^}]*\} from ['"]\.\.\/\.\.\/utils\/numberInput['"];/
    );
    expect(amountFields).toContain('amount: parseRequiredNumberInput(val)');
    expect(moreOptionsFields).toContain('fees: parseOptionalNumberInput(e.target.value)');
    expect(receiptFields).toContain('quantity: parseRequiredNumberInput(e.target.value)');
    expect(receiptFields).toContain('price: parseRequiredNumberInput(e.target.value)');
    expect(modalSources).not.toMatch(/\bparseFloat\s*\(/);
  });

  it('delegates field rendering to focused transaction-modal components', () => {
    const editTransactionModal = readFileSync('components/EditTransactionModal.tsx', 'utf8');

    expect(editTransactionModal).toContain("from './transaction-modal/AmountFields'");
    expect(editTransactionModal).toContain("from './transaction-modal/MoreOptionsFields'");
    expect(editTransactionModal).toContain("from './transaction-modal/ReceiptFields'");
    expect(editTransactionModal).toContain('<AmountFields');
    expect(editTransactionModal).toContain('<MoreOptionsFields');
    expect(editTransactionModal).toContain('<ReceiptFields');
    expect(editTransactionModal).not.toContain('id="edit-tx-amount"');
    expect(editTransactionModal).not.toContain('id="edit-tx-fees"');
    expect(editTransactionModal).not.toContain('receiptData.items.map');
  });
});
