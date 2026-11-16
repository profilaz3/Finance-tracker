/**
 * `<input type="datetime-local">` speaks local wall-clock time ("2026-11-14T18:30") with no zone.
 * Filling it from `toISOString()` shows UTC, and saving that back through `new Date(value)` reads
 * it as local, so every edit moved the time by the zone offset. These two helpers keep the round
 * trip stable: format in local time, parse as local time.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input; empty for a missing or invalid date. */
export const toDateTimeLocalValue = (value: Date | string | number | undefined | null): string => {
    if (value === undefined || value === null || value === '') return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * ISO timestamp for a datetime-local value, read as local time. Returns undefined for empty or
 * malformed text. Seconds are kept from `keepSecondsFrom` when the minute did not change, so
 * saving an untouched field returns the original timestamp exactly.
 */
export const fromDateTimeLocalValue = (value: string, keepSecondsFrom?: string): string | undefined => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
    if (!match) return undefined;
    const [, year, month, day, hours, minutes, seconds] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds ?? 0));
    if (Number.isNaN(date.getTime())) return undefined;
    if (keepSecondsFrom && !seconds && toDateTimeLocalValue(keepSecondsFrom) === toDateTimeLocalValue(date)) {
        const original = new Date(keepSecondsFrom);
        if (!Number.isNaN(original.getTime())) return original.toISOString();
    }
    return date.toISOString();
};

/** Local "YYYY-MM-DD" for a date input; empty for a missing or invalid date. */
export const toDateInputValue = (value: Date | string | undefined | null): string =>
    toDateTimeLocalValue(value).slice(0, 10);

/**
 * ISO timestamp for a date input value (local midnight). When the day is the same as `original`,
 * the original timestamp is returned unchanged so saving an untouched field changes nothing.
 */
export const fromDateInputValue = (value: string, original?: string): string | undefined => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return undefined;
    if (original && toDateInputValue(original) === value.trim()) return original;
    return fromDateTimeLocalValue(`${value.trim()}T00:00`);
};
