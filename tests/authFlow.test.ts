import { describe, expect, it } from 'vitest';
import { getAuthErrorKey, PASSWORD_MIN_LENGTH, validatePassword } from '../utils/authValidation';
import { parseAuthRedirect, stripAuthParams } from '../hooks/usePasswordRecovery';

describe('validatePassword', () => {
  it('requires at least 10 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(validatePassword('abc12345')).toBe('tooShort');
  });

  it('requires a letter and a digit', () => {
    expect(validatePassword('abcdefghijk')).toBe('needsLetterAndDigit');
    expect(validatePassword('12345678901')).toBe('needsLetterAndDigit');
    expect(validatePassword('lozinka2026')).toBeNull();
    expect(validatePassword('šđčćž123456')).toBeNull();
  });
});

describe('getAuthErrorKey', () => {
  it('maps common Supabase auth errors to translation keys', () => {
    expect(getAuthErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('authErrorInvalidCredentials');
    expect(getAuthErrorKey({ message: 'Invalid login credentials' })).toBe('authErrorInvalidCredentials');
    expect(getAuthErrorKey({ code: 'email_not_confirmed' })).toBe('authErrorEmailNotConfirmed');
    expect(getAuthErrorKey({ code: 'weak_password', reasons: ['length'] })).toBe('authErrorWeakPassword');
    expect(getAuthErrorKey({ name: 'AuthWeakPasswordError', code: 'weak_password', reasons: ['pwned'] })).toBe('authErrorPwnedPassword');
    expect(getAuthErrorKey({ code: 'over_email_send_rate_limit' })).toBe('authErrorRateLimit');
    expect(getAuthErrorKey({ status: 429 })).toBe('authErrorRateLimit');
    expect(getAuthErrorKey({ code: 'otp_expired' })).toBe('authErrorLinkExpired');
    expect(getAuthErrorKey({ name: 'AuthRetryableFetchError', status: 0 })).toBe('authErrorNetwork');
  });

  it('falls back to a generic message instead of raw server text', () => {
    expect(getAuthErrorKey(new Error('Database error saving new user'))).toBe('authErrorGeneric');
    expect(getAuthErrorKey(null)).toBe('authErrorGeneric');
  });
});

describe('auth redirect URL handling', () => {
  it('detects a recovery callback in the hash', () => {
    const info = parseAuthRedirect('https://vratipare.netlify.app/#access_token=x&refresh_token=y&expires_in=3600&token_type=bearer&type=recovery');
    expect(info).toEqual({ type: 'recovery', errorCode: null, hasAuthParams: true });
  });

  it('detects an expired-link error', () => {
    const info = parseAuthRedirect('https://vratipare.netlify.app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    expect(info.errorCode).toBe('otp_expired');
  });

  it('ignores ordinary URLs', () => {
    expect(parseAuthRedirect('http://localhost:3000/').hasAuthParams).toBe(false);
  });

  it('strips auth params but keeps unrelated ones', () => {
    expect(stripAuthParams('https://vratipare.netlify.app/?code=abc&keep=1#')).toBe('https://vratipare.netlify.app/?keep=1');
    expect(stripAuthParams('https://vratipare.netlify.app/#error=access_denied&error_code=otp_expired')).toBe('https://vratipare.netlify.app/');
  });
});
