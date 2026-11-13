import React from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { TheyPaidSectionProps } from './types';
import { TRANSLATIONS } from '../../constants';
import { Avatar } from '../home/parts';
import { formatDecimal } from '../../utils/locale';

const label = 'mb-1.5 block px-1 text-[13px] font-semibold text-muted';
const chip = 'flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-[14px] font-semibold transition-colors';

export const TheyPaidSection: React.FC<TheyPaidSectionProps> = ({
    people,
    payerId,
    setPayerId,
    availableRecipients,
    includedRecipients,
    recipientTotal,
    toggleRecipient,
    updateRecipientAmount,
    currency,
    language,
    getPerson
}) => {
    const t = TRANSLATIONS[language];

    const recipientAvatar = (personId: string, name: string, size: number) => {
        if (personId === 'self') {
            return (
                <span
                    aria-hidden="true"
                    className="flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-on-accent"
                    style={{ width: size, height: size, fontSize: size < 36 ? 12 : 14 }}
                >
                    {t.meInitial}
                </span>
            );
        }
        const person = getPerson(personId);
        return <Avatar name={name} color={person?.color || '#888'} image={person?.avatar} size={size} />;
    };

    return (
        // "Someone paid for me" mode - Multi-recipient
        <div className="space-y-5">
            {/* Who paid? */}
            <div>
                <p className={label}>
                    {t.whoPaid}
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.whoPaid}>
                    {people.map(person => (
                        <button
                            key={person.id}
                            type="button"
                            role="radio"
                            aria-checked={payerId === person.id}
                            onClick={() => setPayerId(person.id)}
                            className={clsx(
                                chip,
                                payerId === person.id
                                    ? 'bg-accent text-on-accent'
                                    : 'bg-chip text-muted'
                            )}
                        >
                            <Avatar name={person.name} color={person.color} image={person.avatar} size={32} />
                            {person.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Who did they pay for? */}
            {payerId && (
                <div>
                    <p className={label}>
                        {t.whoDidPayerPayFor.replace('{name}', getPerson(payerId)?.name ?? '')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {availableRecipients.map(recipient => (
                            <button
                                key={recipient.personId}
                                type="button"
                                aria-pressed={recipient.isIncluded}
                                onClick={() => toggleRecipient(recipient.personId)}
                                className={clsx(
                                    chip,
                                    recipient.isIncluded
                                        ? 'bg-accent-soft text-accent ring-1 ring-accent/30'
                                        : 'bg-chip text-muted'
                                )}
                            >
                                {recipientAvatar(recipient.personId, recipient.name, 32)}
                                {recipient.name}
                                {recipient.isIncluded && <Check size={14} aria-hidden="true" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Amount inputs for each selected recipient */}
            {payerId && includedRecipients.length > 0 && (
                <div>
                    <p className={label}>
                        {t.enterAmounts}
                    </p>
                    <div className="paper-tile px-3">
                        <div className="divide-y divide-hair">
                            {includedRecipients.map(recipient => (
                                <div key={recipient.personId} className="flex items-center gap-2.5 py-2.5">
                                    {recipientAvatar(recipient.personId, recipient.name, 32)}
                                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{recipient.name}</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        aria-label={recipient.name}
                                        value={recipient.amount || ''}
                                        onChange={(e) => updateRecipientAmount(recipient.personId, e.target.value)}
                                        placeholder="0"
                                        className="h-10 w-[104px] shrink-0 rounded-[12px] border-none bg-chip px-3 text-right text-[15px] font-semibold tabular-nums text-on-surface outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                                        step="0.01"
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="w-9 shrink-0 text-[13px] font-semibold text-muted">{currency}</span>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="flex items-center justify-between border-t border-hair py-3">
                            <span className="text-[14px] font-semibold text-muted">
                                {t.totalPaidBy.replace('{name}', getPerson(payerId)?.name ?? '')}
                            </span>
                            <span className="text-[16px] font-bold tabular-nums">
                                {formatDecimal(recipientTotal)} {currency}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
