import { Account, Category, Currency, Transaction } from '../types';
import { formatCurrency } from './formatters';
import { formatDateTime, getIntlLocale } from './locale';
import { getTranslations } from './i18n';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDate = (value: string) => formatDateTime(value);

const buildPrintableReport = (
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  baseCurrency: Currency
) => {
  const t = getTranslations();
  const totals = transactions.reduce(
    (summary, transaction) => {
      if (transaction.type === 'income') {
        summary.income += transaction.amount;
      } else {
        summary.expense += transaction.amount;
      }

      return summary;
    },
    { income: 0, expense: 0 }
  );

  const rows = transactions
    .map((transaction) => {
      const category = categories.find((item) => item.id === transaction.categoryId);
      const account = accounts.find((item) => item.id === transaction.accountId);

      return `
        <tr>
          <td>${escapeHtml(formatDate(transaction.date))}</td>
          <td>${escapeHtml(category?.name || '')}</td>
          <td>${escapeHtml(account?.name || '')}</td>
          <td>${escapeHtml(transaction.note || transaction.subcategory || '')}</td>
          <td>${escapeHtml(transaction.type === 'income' ? t.income : t.expense)}</td>
          <td class="amount">${escapeHtml(formatCurrency(transaction.amount, transaction.currency))}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="${getIntlLocale()}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(t.financeReport)}</title>
        <style>
          :root {
            color-scheme: light;
            font-family: "Segoe UI", Arial, sans-serif;
          }

          body {
            margin: 0;
            padding: 32px;
            color: #1f1b16;
            background: #fffdf8;
          }

          h1, h2, p {
            margin: 0;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 24px;
            margin-bottom: 24px;
            border-bottom: 2px solid #e8dfd2;
            padding-bottom: 16px;
          }

          .meta {
            color: #645b50;
            font-size: 13px;
            line-height: 1.5;
          }

          .summary {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin: 24px 0;
          }

          .summary-card {
            background: #f3ede4;
            border-radius: 14px;
            padding: 16px;
          }

          .summary-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #645b50;
            margin-bottom: 6px;
          }

          .summary-value {
            font-size: 20px;
            font-weight: 600;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          th, td {
            padding: 10px 12px;
            border-bottom: 1px solid #e8dfd2;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f3ede4;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #645b50;
          }

          .amount {
            white-space: nowrap;
            font-weight: 600;
          }

          @media print {
            body {
              padding: 20px;
              background: white;
            }

            .summary-card {
              break-inside: avoid;
            }

            table {
              break-inside: auto;
            }

            tr {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(t.financeReport)}</h1>
            <p class="meta">${escapeHtml(t.reportGenerated.replace('{date}', formatDateTime(new Date())))}</p>
          </div>
          <div class="meta">
            <div>${escapeHtml(t.reportTransactionCount.replace('{count}', String(transactions.length)))}</div>
            <div>${escapeHtml(t.reportBaseCurrency.replace('{currency}', baseCurrency))}</div>
          </div>
        </div>

        <div class="summary">
          <div class="summary-card">
            <div class="summary-label">${escapeHtml(t.income)}</div>
            <div class="summary-value">${escapeHtml(formatCurrency(totals.income, baseCurrency))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">${escapeHtml(t.expense)}</div>
            <div class="summary-value">${escapeHtml(formatCurrency(totals.expense, baseCurrency))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">${escapeHtml(t.net)}</div>
            <div class="summary-value">${escapeHtml(formatCurrency(totals.income - totals.expense, baseCurrency))}</div>
          </div>
        </div>

        <h2 style="margin-bottom: 12px;">${escapeHtml(t.transactions)}</h2>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t.date)}</th>
              <th>${escapeHtml(t.category)}</th>
              <th>${escapeHtml(t.account)}</th>
              <th>${escapeHtml(t.note)}</th>
              <th>${escapeHtml(t.transactionType)}</th>
              <th>${escapeHtml(t.amount)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
};

export const exportToPDF = async (
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  baseCurrency: Currency
) => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');

  if (!printWindow) {
    throw new Error('Unable to open print window');
  }

  const documentMarkup = buildPrintableReport(transactions, categories, accounts, baseCurrency);

  printWindow.document.open();
  printWindow.document.write(documentMarkup);
  printWindow.document.close();

  await new Promise<void>((resolve) => {
    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
      resolve();
    };

    if (printWindow.document.readyState === 'complete') {
      triggerPrint();
      return;
    }

    printWindow.addEventListener('load', triggerPrint, { once: true });
  });
};
