import React from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { TheyPaidSectionProps } from './types';

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
    return (
        // "Someone paid for me" mode - Multi-recipient
        <div className="space-y-4">
            {/* Who paid? */}
            <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-2">
                    {language === 'sr' ? 'Ko je platio?' : 'Who paid?'}
                </label>
                <div className="flex flex-wrap gap-2">
                    {people.map(person => (
                        <button
                            key={person.id}
                            type="button"
                            onClick={() => setPayerId(person.id)}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                                payerId === person.id
                                    ? "bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/20"
                                    : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high"
                            )}
                        >
                            {person.avatar ? (
                                <img src={person.avatar} alt="" aria-hidden="true" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                                <div
                                    aria-hidden="true"
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                    style={{ backgroundColor: person.color + '20', color: person.color }}
                                >
                                    {person.name[0]}
                                </div>
                            )}
                            {person.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Who did they pay for? */}
            {payerId && (
                <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        {language === 'sr'
                            ? `Za koga je ${getPerson(payerId)?.name} platio?`
                            : `Who did ${getPerson(payerId)?.name} pay for?`
                        }
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {availableRecipients.map(recipient => {
                            const person = recipient.personId === 'self' ? null : getPerson(recipient.personId);
                            return (
                                <button
                                    key={recipient.personId}
                                    type="button"
                                    onClick={() => toggleRecipient(recipient.personId)}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                                        recipient.isIncluded
                                            ? "bg-secondary/10 text-secondary border-secondary/20"
                                            : "bg-surface-container text-on-surface-variant border-transparent hover:bg-surface-container-high opacity-60"
                                    )}
                                >
                                    {recipient.personId === 'self' ? (
                                        <div aria-hidden="true" className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                            {language === 'sr' ? 'J' : 'M'}
                                        </div>
                                    ) : person?.avatar ? (
                                        <img src={person.avatar} alt="" aria-hidden="true" className="w-5 h-5 rounded-full object-cover" />
                                    ) : (
                                        <div
                                            aria-hidden="true"
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                            style={{ backgroundColor: (person?.color || '#888') + '20', color: person?.color || '#888' }}
                                        >
                                            {recipient.name[0]}
                                        </div>
                                    )}
                                    {recipient.name}
                                    {recipient.isIncluded && <Check size={14} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Amount inputs for each selected recipient */}
            {payerId && includedRecipients.length > 0 && (
                <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-2">
                        {language === 'sr' ? 'Unesite iznose:' : 'Enter amounts:'}
                    </label>
                    <div className="space-y-2 bg-surface-container rounded-xl p-3">
                        {includedRecipients.map(recipient => {
                            const person = recipient.personId === 'self' ? null : getPerson(recipient.personId);
                            return (
                                <div key={recipient.personId} className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 w-1/3">
                                        {recipient.personId === 'self' ? (
                                            <div aria-hidden="true" className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                {language === 'sr' ? 'J' : 'M'}
                                            </div>
                                        ) : person?.avatar ? (
                                            <img src={person.avatar} alt="" aria-hidden="true" className="w-6 h-6 rounded-full object-cover" />
                                        ) : (
                                            <div
                                                aria-hidden="true"
                                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                                style={{ backgroundColor: (person?.color || '#888') + '20', color: person?.color || '#888' }}
                                            >
                                                {recipient.name[0]}
                                            </div>
                                        )}
                                        <span className="text-sm font-medium truncate">{recipient.name}</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={recipient.amount || ''}
                                        onChange={(e) => updateRecipientAmount(recipient.personId, e.target.value)}
                                        placeholder="0"
                                        className="flex-1 px-3 py-2 bg-surface rounded-lg border-none focus:ring-2 focus:ring-primary/20 text-sm"
                                        step="0.01"
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="text-sm text-on-surface-variant w-12">{currency}</span>
                                </div>
                            );
                        })}

                        {/* Total */}
                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-outline/10">
                            <span className="text-sm font-medium text-on-surface-variant">
                                {language === 'sr' ? `Ukupno (${getPerson(payerId)?.name} platio):` : `Total paid by ${getPerson(payerId)?.name}:`}
                            </span>
                            <span className="font-bold text-on-surface">
                                {recipientTotal.toFixed(2)} {currency}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
