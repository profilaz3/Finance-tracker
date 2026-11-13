import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { safeValidateAppState, validateAccount, validateEvent } from '../schemas';

describe('state schemas (zod/mini)', () => {
  it('imports the tree-shakable zod/mini build instead of classic zod', () => {
    const source = readFileSync('schemas/index.ts', 'utf8');
    expect(source).toContain("from 'zod/mini'");
    expect(source).not.toMatch(/from 'zod';/);
  });

  it('applies defaults for an empty state', () => {
    const result = safeValidateAppState({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.theme).toBe('neon');
      expect(result.data.language).toBe('en');
      expect(result.data.transactions).toEqual([]);
    }
  });

  it('reports issues with paths for invalid transactions', () => {
    const result = safeValidateAppState({
      transactions: [{ id: 't', date: 'x', amount: -1, currency: 'EUR', categoryId: 'c', accountId: 'a', type: 'expense' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path.join('.')).toBe('transactions.0.amount');
    }
  });

  it('strips unknown keys and fills optional defaults', () => {
    expect(validateAccount({ id: 'a', name: 'Cash', type: 'cash', currency: 'EUR', color: '#000', extra: 1 })).toEqual({
      id: 'a',
      name: 'Cash',
      type: 'cash',
      currency: 'EUR',
      color: '#000',
      initialBalance: 0,
    });
  });

  it('still validates shared emails', () => {
    expect(() => validateEvent({ id: 'e', name: 'Trip', status: 'active', sharedEmails: ['not-an-email'] })).toThrow();
    expect(validateEvent({ id: 'e', name: 'Trip', status: 'active', sharedEmails: ['a@b.co'] }).personIds).toEqual([]);
  });
});
