import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';

process.env.TZ = 'Europe/Belgrade';

let getRelativeDate: typeof import('../utils/formatters').getRelativeDate;

beforeAll(async () => {
  ({ getRelativeDate } = await import('../utils/formatters'));
});

describe('getRelativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Today for dates on the current day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T15:00:00.000Z'));

    expect(getRelativeDate('2026-04-05T09:30:00.000Z')).toBe('Today');
  });

  it('returns Yesterday for dates on the previous day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T15:00:00.000Z'));

    expect(getRelativeDate('2026-04-04T12:00:00.000Z')).toBe('Yesterday');
  });

  it('returns Today when a UTC timestamp lands on the current local day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T15:00:00.000Z'));

    expect(getRelativeDate('2026-04-04T22:00:00.000Z')).toBe('Today');
  });

  it('falls back to a calendar date for future dates instead of negative relative text', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T15:00:00.000Z'));

    expect(getRelativeDate('2026-04-07T09:30:00.000Z')).toBe('Apr 07, 2026');
  });

  it('uses local calendar days instead of elapsed 24-hour blocks across DST', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T10:00:00.000Z'));

    expect(getRelativeDate('2026-03-29T10:00:00.000Z')).toBe('1 weeks ago');
  });
});
