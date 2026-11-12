import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const distAssetsDir = path.resolve('dist', 'assets');

const formatKb = bytes => `${(bytes / 1024).toFixed(2)} KB`;

const summarizeAsset = fileName => {
  if (fileName.startsWith('index-') && fileName.endsWith('.js')) return 'main-entry';
  if (fileName.startsWith('TransactionsView-')) return 'transactions-route';
  if (fileName.startsWith('ExportModal-')) return 'export-modal';
  if (fileName.startsWith('pdfExport-')) return 'pdf-export';
  if (fileName.startsWith('Stats-')) return 'stats-shell';
  if (fileName.startsWith('ExpenseChart-')) return 'expense-chart';
  if (fileName.startsWith('IncomeChart-')) return 'income-chart';
  if (fileName.startsWith('CategoryBreakdown-')) return 'category-breakdown';
  if (fileName.startsWith('CartesianChart-')) return 'chart-runtime';
  if (fileName.startsWith('pdf-tools-')) return 'pdf-tools';
  if (fileName.startsWith('html2canvas.esm-')) return 'dom-capture';
  if (fileName.startsWith('markdown-')) return 'markdown';
  if (fileName.startsWith('motion-')) return 'motion';
  if (fileName.startsWith('icons-')) return 'icons';
  if (fileName.startsWith('supabase-')) return 'supabase-sdk';
  if (fileName.startsWith('supabaseService-')) return 'supabase-service';

  return null;
};

const assets = readdirSync(distAssetsDir)
  .map(fileName => {
    const fullPath = path.join(distAssetsDir, fileName);
    const stats = statSync(fullPath);

    return {
      fileName,
      bytes: stats.size,
      bucket: summarizeAsset(fileName),
    };
  })
  .filter(asset => asset.bucket)
  .sort((left, right) => right.bytes - left.bytes);

console.log('Bundle snapshot');
for (const asset of assets) {
  console.log(`${asset.bucket.padEnd(20)} ${formatKb(asset.bytes).padStart(10)}  ${asset.fileName}`);
}
