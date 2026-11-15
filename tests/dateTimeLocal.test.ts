import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fromDateInputValue, fromDateTimeLocalValue, toDateInputValue, toDateTimeLocalValue } from '../utils/dateTimeLocal';

describe('datetime-local helpers', () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    // A zone east of UTC: the old toISOString().slice(0, 16) showed one hour earlier here.
    process.env.TZ = 'Europe/Belgrade';
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('fills the input with local wall-clock time, not UTC', () => {
    const stored = '2026-11-14T17:30:00.000Z'; // 18:30 in Belgrade (CET)
    expect(toDateTimeLocalValue(stored)).toBe('2026-11-14T18:30');
    expect(toDateTimeLocalValue(new Date(2026, 6, 1, 9, 5))).toBe('2026-07-01T09:05');
  });

  it('reads the input as local time', () => {
    expect(fromDateTimeLocalValue('2026-11-14T18:30')).toBe('2026-11-14T17:30:00.000Z');
    expect(fromDateTimeLocalValue('2026-07-01T09:05')).toBe('2026-07-01T07:05:00.000Z'); // CEST
  });

  it('is stable across repeated edits (no drift by the zone offset)', () => {
    let stored = '2026-03-29T00:30:00.000Z';
    for (let i = 0; i < 5; i++) {
      stored = fromDateTimeLocalValue(toDateTimeLocalValue(stored))!;
    }
    expect(stored).toBe('2026-03-29T00:30:00.000Z');
  });

  it('keeps the original seconds when the minute did not change', () => {
    const stored = '2026-11-14T17:30:42.123Z';
    expect(fromDateTimeLocalValue(toDateTimeLocalValue(stored), stored)).toBe(stored);
    expect(fromDateTimeLocalValue('2026-11-14T18:31', stored)).toBe('2026-11-14T17:31:00.000Z');
  });

  it('rejects empty and malformed values', () => {
    expect(toDateTimeLocalValue(undefined)).toBe('');
    expect(toDateTimeLocalValue('not a date')).toBe('');
    expect(fromDateTimeLocalValue('')).toBeUndefined();
    expect(fromDateTimeLocalValue('14.11.2026 18:30')).toBeUndefined();
  });

  it('round-trips date inputs and keeps an untouched day as stored', () => {
    const stored = '2026-11-13T23:30:00.000Z'; // 14 Nov 00:30 in Belgrade
    expect(toDateInputValue(stored)).toBe('2026-11-14');
    expect(fromDateInputValue('2026-11-14', stored)).toBe(stored);
    expect(fromDateInputValue('2026-11-15', stored)).toBe('2026-11-14T23:00:00.000Z');
    expect(fromDateInputValue('')).toBeUndefined();
  });
});
