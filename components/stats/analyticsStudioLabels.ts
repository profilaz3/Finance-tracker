export const ANALYTICS_STUDIO_LABELS = {
  en: {
    improved: 'Improved',
    worsened: 'Worsened',
    periodSpend: 'Period spend',
    previousPeriod: 'Previous period',
    anomalyTitles: {
      'category-spike': 'Category spending spike',
      'large-transaction': 'Large transaction',
      'high-fees': 'High fees',
    },
    categorySpikeDetail: (categoryName: string, amount: string, percentage: string | null) => (
      `${categoryName || 'This category'} is ${amount} higher than the previous period${percentage ? ` (${percentage})` : ''}.`
    ),
    largeTransactionDetail: (categoryName: string | null, amount: string, percentage: string | null) => (
      `${categoryName || 'One expense'} accounts for ${amount}${percentage ? `, ${percentage} of current expenses` : ''}.`
    ),
    highFeesDetail: (amount: string, percentage: string | null) => (
      `Fees total ${amount}${percentage ? `, ${percentage} of current expenses` : ''}.`
    ),
  },
  sr: {
    improved: 'Bolje',
    worsened: 'Lošije',
    periodSpend: 'Potrošnja u periodu',
    previousPeriod: 'Prethodni period',
    anomalyTitles: {
      'category-spike': 'Skok potrošnje u kategoriji',
      'large-transaction': 'Velika transakcija',
      'high-fees': 'Visoke naknade',
    },
    categorySpikeDetail: (categoryName: string, amount: string, percentage: string | null) => (
      `${categoryName || 'Ova kategorija'} je ${amount} iznad prethodnog perioda${percentage ? ` (${percentage})` : ''}.`
    ),
    largeTransactionDetail: (categoryName: string | null, amount: string, percentage: string | null) => (
      `${categoryName || 'Jedan trošak'} čini ${amount}${percentage ? `, ${percentage} trenutnih troškova` : ''}.`
    ),
    highFeesDetail: (amount: string, percentage: string | null) => (
      `Naknade su ${amount}${percentage ? `, ${percentage} trenutnih troškova` : ''}.`
    ),
  },
} as const;
