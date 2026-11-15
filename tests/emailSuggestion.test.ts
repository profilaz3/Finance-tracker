import { describe, expect, it } from 'vitest';
import { suggestEmail } from '../utils/emailSuggestion';
import { passwordChecks } from '../utils/authValidation';

describe('suggestEmail', () => {
  it('corrects common provider typos and keeps the local part as typed', () => {
    expect(suggestEmail('Ana.Petrovic@gmial.com')).toBe('Ana.Petrovic@gmail.com');
    expect(suggestEmail('ana@gmail.con')).toBe('ana@gmail.com');
    expect(suggestEmail('ana@gmail.cm')).toBe('ana@gmail.com');
    expect(suggestEmail('ana@hotmial.com')).toBe('ana@hotmail.com');
    expect(suggestEmail('ana@outlok.com')).toBe('ana@outlook.com');
    expect(suggestEmail('ana@yaho.com')).toBe('ana@yahoo.com');
    expect(suggestEmail('ana@icloud.co')).toBe('ana@icloud.com');
    expect(suggestEmail(' ana@GMAIL.COM ')).toBeNull();
  });

  it('leaves real and unknown domains alone', () => {
    for (const email of ['ana@gmail.com', 'ana@ymail.com', 'ana@email.com', 'ana@gmx.at', 'ana@ftn.uns.ac.rs', 'ana@firma.rs', 'ana@company.io', 'ana@mts.rs', 'ana@yahoo.fr', 'ana@hotmail.de']) {
      expect(suggestEmail(email)).toBeNull();
    }
  });

  it('ignores input that is not an address yet', () => {
    for (const email of ['', 'ana', 'ana@', '@gmail.com', 'ana@gmail', 'ana@gm ail.com']) {
      expect(suggestEmail(email)).toBeNull();
    }
  });
});

describe('passwordChecks', () => {
  it('reports each rule of the policy on its own', () => {
    expect(passwordChecks('')).toEqual({ length: false, letter: false, digit: false });
    expect(passwordChecks('abc')).toEqual({ length: false, letter: true, digit: false });
    expect(passwordChecks('1234567890')).toEqual({ length: true, letter: false, digit: true });
    expect(passwordChecks('lozinka2026')).toEqual({ length: true, letter: true, digit: true });
    expect(passwordChecks('šifraŽivot9')).toEqual({ length: true, letter: true, digit: true });
  });
});
