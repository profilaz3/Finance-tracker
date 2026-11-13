import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { isInlineAvatar, uploadInlineAvatar } from '../utils/avatarUpload';
import { toAiPerson } from '../services/aiService';
import { dataUrlToBlob } from '../utils/imageResize';
import type { Person } from '../types';

describe('avatar storage', () => {
  it('only treats data: URLs as inline avatars', () => {
    expect(isInlineAvatar('data:image/webp;base64,AAAA')).toBe(true);
    expect(isInlineAvatar('https://x.supabase.co/storage/v1/object/public/avatars/u/p.webp')).toBe(false);
    expect(isInlineAvatar('😀')).toBe(false);
    expect(isInlineAvatar(undefined)).toBe(false);
  });

  it('does not upload avatars that are already URLs', async () => {
    const getUploader = vi.fn();
    expect(await uploadInlineAvatar('https://example.com/a.webp', 'p-1', getUploader)).toBeNull();
    expect(getUploader).not.toHaveBeenCalled();
  });

  it('keeps the inline image (returns null) when the upload fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await uploadInlineAvatar('data:image/webp;base64,AAAA', 'p-1', async () => ({
      uploadAvatar: async () => { throw new Error('offline'); },
    }));
    expect(result).toBeNull();
    warn.mockRestore();
  });

  it('decodes base64 data URLs into blobs', async () => {
    const blob = dataUrlToBlob('data:image/webp;base64,' + btoa('abc'));
    expect(blob.type).toBe('image/webp');
    expect(await blob.text()).toBe('abc');
  });

  it('uploads to avatars/<userId>/<personId>-<timestamp>.<ext>', () => {
    const source = readFileSync('services/supabaseService.ts', 'utf8');
    expect(source).toContain('async uploadAvatar(file: File, personId: string)');
    expect(source).toContain('`${user.id}/${personId}-${Date.now()}.${fileExt}`');
  });

  it('person and profile handlers promote inline avatars before syncing', () => {
    const handlers = readFileSync('hooks/usePeopleHandlers.ts', 'utf8');
    expect(handlers).toContain("promoteInlineAvatar(newPerson.id, newPerson.avatar, 'person')");
    expect(handlers).toContain("promoteInlineAvatar(id, updates.avatar, 'person')");
    expect(handlers).toContain("promoteInlineAvatar(newProfile.id, newProfile.avatar, 'profile')");
  });

  it('the avatar picker downscales to 256px', () => {
    expect(readFileSync('components/AddPersonModal.tsx', 'utf8')).toContain('maxDimension: AVATAR_MAX_DIMENSION');
  });
});

describe('AI payloads', () => {
  it('never send avatars to the edge functions', () => {
    const person: Person = {
      id: 'p-1',
      name: 'Ana',
      avatar: 'data:image/webp;base64,AAAA',
      color: '#fff',
      defaultCurrency: 'EUR',
      balances: { EUR: 5, USD: 0, RSD: 0 },
    };
    const payload = toAiPerson(person);
    expect(payload).not.toHaveProperty('avatar');
    expect(payload).toEqual({ id: 'p-1', name: 'Ana', defaultCurrency: 'EUR', balances: person.balances });
    expect(readFileSync('services/aiService.ts', 'utf8')).toContain('people: people.map(toAiPerson)');
  });
});
