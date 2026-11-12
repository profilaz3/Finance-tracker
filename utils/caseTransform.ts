type AnyRecord = Record<string, unknown>;

function snakeKeyToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function camelKeyToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

export function snakeToCamel<T extends AnyRecord>(obj: AnyRecord): T {
  const result: AnyRecord = {};
  for (const key of Object.keys(obj)) {
    result[snakeKeyToCamel(key)] = obj[key];
  }
  return result as T;
}

export function camelToSnake<T extends AnyRecord>(obj: AnyRecord): T {
  const result: AnyRecord = {};
  for (const key of Object.keys(obj)) {
    result[camelKeyToSnake(key)] = obj[key];
  }
  return result as T;
}
