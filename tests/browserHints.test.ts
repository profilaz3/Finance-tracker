import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('browser shell hints', () => {
  it('declares a favicon link in index.html', () => {
    const indexHtml = readFileSync('index.html', 'utf8');

    expect(indexHtml).toContain('rel="icon"');
    expect(indexHtml).toContain('href="/favicon.svg"');
  });

  it('adds auth autocomplete hints for email and password inputs', () => {
    const authView = readFileSync('components/AuthView.tsx', 'utf8');

    expect(authView).toContain('autoComplete="email"');
    expect(authView).toContain('autoComplete={mode === \'signIn\' ? \'current-password\' : \'new-password\'}');
    expect(authView).toContain('autoComplete="new-password"');
  });
});
