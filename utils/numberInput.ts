const parseFiniteNumber = (value: string): number | undefined => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

export const parseRequiredNumberInput = (value: string): number => {
  return parseFiniteNumber(value) ?? 0;
};

export const parseOptionalNumberInput = (value: string): number | undefined => {
  return parseFiniteNumber(value);
};
