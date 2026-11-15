import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const distAssetsDir = path.resolve('dist', 'assets');
const distIndexHtml = path.resolve('dist', 'index.html');

const budgets = [
  // Raised from 200 KB: theme and accent validation plus the first-paint theme apply (about 2 KB,
  // eager so a saved theme never flashes). Palettes stay in CSS and the custom accent maths is lazy.
  { label: 'entry-chunk', prefix: 'index-', maxBytes: 202 * 1024, aggregate: false },
  // Raised from 360 KB: the complete EN+SR translation table (~50 KB raw, ~122 KB gzip startup total) is eager by design.
  // Raised from 400 KB for the redesign: EN+SR strings for the new screens (+34 KB, eager by design)
  // and the new app shell (add sheet, home, notifications, swipe pager). AI features stay lazy.
  // Raised from 520 KB for the themes (EN+SR strings and the eager theme code above, about 3.5 KB).
  // Reminders, alerts and the monthly letter load after first paint (components/app/BackgroundJobs),
  // which took about 16 KB out of startup; keep that headroom for strings rather than raising this.
  { label: 'startup-js', prefix: null, maxBytes: 522 * 1024, aggregate: false },
  { label: 'transactions-route', prefix: 'TransactionsView-', maxBytes: 80 * 1024, aggregate: false },
  { label: 'stats-shell', prefix: 'Stats-', maxBytes: 12 * 1024, aggregate: false },
  { label: 'export-modal', prefix: 'ExportModal-', maxBytes: 8 * 1024, aggregate: false },
  { label: 'pdf-export', prefix: 'pdfExport-', maxBytes: 8 * 1024, aggregate: false },
  // Raised from 16 KB: teams and avatar storage calls.
  { label: 'supabase-service', prefix: 'supabaseService-', maxBytes: 18 * 1024, aggregate: false },
  // Raised from 48 KB for the screen headers redesign (filters, calendar and menu icons).
  { label: 'icons', prefix: 'icons-', maxBytes: 49 * 1024, aggregate: false },
  { label: 'motion', prefix: 'motion-', maxBytes: 128 * 1024, aggregate: false },
  { label: 'motion-max-features', prefix: 'motionMaxFeatures-', maxBytes: 56 * 1024, aggregate: false },
  { label: 'virtuoso', prefix: 'virtuoso-', maxBytes: 64 * 1024, aggregate: false },
  { label: 'react', prefix: 'react-', maxBytes: 224 * 1024, aggregate: false },
];

const forbiddenChunkPrefixes = ['CartesianChart-', 'pdf-tools-', 'html2canvas.esm-'];

const files = readdirSync(distAssetsDir).map(fileName => ({
  fileName,
  bytes: statSync(path.join(distAssetsDir, fileName)).size,
}));

const formatKb = bytes => `${(bytes / 1024).toFixed(2)} KB`;
const indexHtml = readFileSync(distIndexHtml, 'utf8');
const startupAssetNames = [
  ...Array.from(
    indexHtml.matchAll(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+)"/g),
    match => match[1]
  ),
  ...Array.from(
    indexHtml.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/assets\/([^"]+)"/g),
    match => match[1]
  ),
];
const startupBytes = startupAssetNames.reduce((total, fileName) => {
  const file = files.find(asset => asset.fileName === fileName);
  return total + (file?.bytes ?? 0);
}, 0);

const violations = [];

for (const forbiddenPrefix of forbiddenChunkPrefixes) {
  const forbiddenChunk = files.find(file => file.fileName.startsWith(forbiddenPrefix));
  if (forbiddenChunk) {
    violations.push(`forbidden chunk emitted: ${forbiddenChunk.fileName}`);
  }
}

for (const budget of budgets) {
  const measuredBytes = budget.label === 'startup-js'
    ? startupBytes
    : (() => {
        const matchingFiles = files.filter(file => file.fileName.startsWith(budget.prefix));
        return budget.aggregate
          ? matchingFiles.reduce((total, file) => total + file.bytes, 0)
          : Math.max(0, ...matchingFiles.map(file => file.bytes));
      })();

  if (measuredBytes > budget.maxBytes) {
    violations.push(
      `${budget.label} exceeded budget: ${formatKb(measuredBytes)} > ${formatKb(budget.maxBytes)}`
    );
  }
}

if (violations.length > 0) {
  console.error('Bundle budget failed');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Bundle budget passed');
for (const budget of budgets) {
  const measuredBytes = budget.label === 'startup-js'
    ? startupBytes
    : (() => {
        const matchingFiles = files.filter(file => file.fileName.startsWith(budget.prefix));
        return budget.aggregate
          ? matchingFiles.reduce((total, file) => total + file.bytes, 0)
          : Math.max(0, ...matchingFiles.map(file => file.bytes));
      })();

  console.log(`${budget.label.padEnd(20)} ${formatKb(measuredBytes).padStart(10)} / ${formatKb(budget.maxBytes)}`);
}
