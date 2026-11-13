import { HttpError } from './http.ts';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const requireRecord = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new HttpError(400, 'Invalid request body');
  return value;
};

/** Returns a bounded array of records, or throws 400 when the field is not an array. */
export const boundedList = (value: unknown, field: string, max: number): Record<string, unknown>[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `Invalid ${field}`);
  if (value.length > max) throw new HttpError(413, `Too many ${field}`);
  return value.filter(isRecord);
};

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
