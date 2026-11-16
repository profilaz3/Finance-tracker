/**
 * "Did you mean ...@gmail.com?" for common mail domains. Pure and local: nothing is looked up.
 * Only domains that are close to a well-known one (and not that domain) get a suggestion, so a
 * company or university address is left alone.
 */
const KNOWN_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'mail.com', 'gmx.com', 'gmx.de', 'gmx.net',
  'proton.me', 'protonmail.com', 'yandex.com', 'zoho.com', 'web.de', 'hotmail.co.uk', 'yahoo.co.uk',
  // Real providers one letter away from a bigger one (ymail / gmail), so they are never "corrected".
  'ymail.com', 'email.com', 'rocketmail.com', 'fastmail.com', 'hey.com', 'tutanota.com', 'gmx.at', 'gmx.ch', 'mail.ru',
  // Serbian providers
  'eunet.rs', 'open.telekom.rs', 'mts.rs', 'sbb.rs', 'ptt.rs', 'yubc.net',
];

const KNOWN_TLDS = ['com', 'net', 'org', 'rs', 'me', 'de', 'co.uk', 'io', 'eu'];

/** Optimal string alignment distance (Levenshtein plus adjacent swaps), capped for speed. */
const distance = (a: string, b: string, cap = 3): number => {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
};

const closest = (value: string, candidates: string[], maxDistance: number): string | null => {
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const d = distance(value, candidate, maxDistance);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return bestDistance <= maxDistance ? best : null;
};

/** The corrected address, or null when the domain looks fine (or is not close to a known one). */
export const suggestEmail = (email: string): string | null => {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!domain.includes('.') || /\s/.test(domain)) return null;
  if (KNOWN_DOMAINS.includes(domain)) return null;

  // Whole-domain typos: gmial.com, hotmial.com, gmail.co, outlok.com.
  const maxDistance = domain.length <= 7 ? 1 : 2;
  const domainMatch = closest(domain, KNOWN_DOMAINS, maxDistance);
  if (domainMatch) return `${local}@${domainMatch}`;

  // A known provider with a mistyped ending: gmail.cm, yahoo.con.
  const dot = domain.indexOf('.');
  const name = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  if (KNOWN_TLDS.includes(tld)) return null;
  const tldMatch = closest(tld, KNOWN_TLDS, 1);
  if (tldMatch && KNOWN_DOMAINS.includes(`${name}.${tldMatch}`)) return `${local}@${name}.${tldMatch}`;
  return null;
};
