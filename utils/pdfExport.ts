import { Account, Category, Currency, Transaction } from '../types';
import { formatCurrency } from './formatters';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatDate = (value: string) => new Date(value).toLocaleString();

const buildPrintableReport = (
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  baseCurrency: Currency
) => {
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
          <td>${escapeHtml(transaction.type === 'income' ? 'Income' : 'Expense')}</td>
          <td class="amount">${escapeHtml(formatCurrency(transaction.amount, transaction.currency))}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Finance Report</title>
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
            <h1>Finance Report</h1>
            <p class="meta">Generated: ${escapeHtml(new Date().toLocaleString())}</p>
          </div>
          <div class="meta">
            <div>Transactions: ${transactions.length}</div>
            <div>Base Currency: ${escapeHtml(baseCurrency)}</div>
          </div>
        </div>

        <div class="summary">
          <div class="summary-card">
            <div class="summary-label">Income</div>
            <div class="summary-value">${escapeHtml(formatCurrency(totals.income, baseCurrency))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Expense</div>
            <div class="summary-value">${escapeHtml(formatCurrency(totals.expense, baseCurrency))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Net</div>
            <div class="summary-value">${escapeHtml(formatCurrency(totals.income - totals.expense, baseCurrency))}</div>
          </div>
        </div>

        <h2 style="margin-bottom: 12px;">Transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Account</th>
              <th>Note</th>
              <th>Type</th>
              <th>Amount</th>
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
