import { Currency } from '../types';
import { formatCurrency } from './formatters';

export { formatCurrency };

export const convertCurrency = (
    amount: number,
    from: Currency,
    to: Currency,
    rates: Record<Currency, number>
): number => {
    if (from === to) return amount;

    const rateFrom = rates[from];
    const rateTo = rates[to];

    if (!rateFrom || !rateTo) return amount;

    const amountInBase = amount / rateFrom;
    return amountInBase * rateTo;
};
