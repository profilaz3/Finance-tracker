import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const storagePoliciesPath = 'supabase/storage_policies.sql';
const hardeningMigrationPath = 'supabase/migrations/20260511184500_harden_event_photo_storage.sql';

describe('supabase storage policy contracts', () => {
  it('does not allow anonymous event photo writes or guest event CRUD policies', () => {
    const storagePolicies = readFileSync(storagePoliciesPath, 'utf8');

    expect(storagePolicies).not.toMatch(/\bFOR\s+(?:INSERT|UPDATE|DELETE)\s+TO\s+anon\b/i);
    expect(storagePolicies).not.toMatch(/Allow guest event (?:inserts|reads|updates|deletes)/i);
  });

  it('hardens event photo writes to the authenticated user folder', () => {
    expect(existsSync(hardeningMigrationPath)).toBe(true);

    const migration = readFileSync(hardeningMigrationPath, 'utf8');

    expect(migration).toContain('(storage.foldername(name))[1] = auth.uid()::text');
    expect(migration).toMatch(/\bTO\s+authenticated\b/i);
  });
});
