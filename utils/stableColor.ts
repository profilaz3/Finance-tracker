/**
 * A stable, pleasant colour for a name (merchants, people without a colour, monograms).
 * Same name, same colour on every device; nothing leaves the device.
 */
export const STABLE_PALETTE = [
  '#0F766E', '#2563EB', '#7C3AED', '#C026D3', '#DB2777', '#DC2626',
  '#EA580C', '#CA8A04', '#65A30D', '#059669', '#0891B2', '#4F46E5',
] as const;

const normalize = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ')
    .trim();

/** FNV-1a over the normalized name. */
const hash = (value: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const stableColor = (name: string | null | undefined): string => {
  const key = normalize(name ?? '');
  if (!key) return '#64748B';
  return STABLE_PALETTE[hash(key) % STABLE_PALETTE.length];
};

/** One or two letters: "Maxi Beograd" -> "MB", "Netflix" -> "NE", "" -> "?". */
export const monogram = (name: string | null | undefined, letters: 1 | 2 = 2): string => {
  const words = (name ?? '').trim().split(/[\s._\-/]+/).filter(word => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return '?';
  const first = [...words[0].replace(/[^\p{L}\p{N}]/gu, '')];
  if (letters === 1) return (first[0] ?? '?').toUpperCase();
  if (words.length > 1) {
    const second = [...words[1].replace(/[^\p{L}\p{N}]/gu, '')];
    return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase() || '?';
  }
  return first.slice(0, 2).join('').toUpperCase() || '?';
};
