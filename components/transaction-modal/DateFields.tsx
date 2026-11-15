import React from 'react';
import clsx from 'clsx';
import { CalendarDays, Clock } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { getIntlLocale } from '../../utils/locale';

interface DateFieldsProps {
    date: string;
    onChange: (isoDate: string) => void;
    language: 'en' | 'sr';
    t: typeof TRANSLATIONS['en'];
}

const pad = (value: number) => String(value).padStart(2, '0');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Opens the native picker on click or Enter/Space where the browser supports it (the field itself is invisible). */
const openPicker = (input: HTMLInputElement) => {
    try {
        input.showPicker?.();
    } catch {
        // Not allowed here (no user gesture, cross-origin frame): the field still takes typing.
    }
};

const pickerKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPicker(event.currentTarget);
    }
};

const chipClass = (selected: boolean) => clsx(
    'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors',
    selected ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface'
);

/**
 * When an entry happened. Most are today, so Today and Yesterday are one tap; any other day comes
 * from the date picker, and the time sits beside the label. Changing the day keeps the time.
 */
export const DateFields: React.FC<DateFieldsProps> = ({ date, onChange, language, t }) => {
    const parsed = new Date(date);
    const current = Number.isFinite(parsed.getTime()) ? parsed : new Date();
    const today = startOfDay(new Date());
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const day = startOfDay(current).getTime();
    const which = day === today.getTime() ? 'today' : day === yesterday.getTime() ? 'yesterday' : 'other';
    const dateValue = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
    const timeValue = `${pad(current.getHours())}:${pad(current.getMinutes())}`;
    const otherLabel = which === 'other'
        ? new Intl.DateTimeFormat(getIntlLocale(language), {
            day: 'numeric',
            month: 'short',
            ...(current.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
        }).format(current)
        : t.otherDay;

    const moveTo = (target: Date) => {
        const next = new Date(target.getFullYear(), target.getMonth(), target.getDate(), current.getHours(), current.getMinutes(), 0, 0);
        onChange(next.toISOString());
    };

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-2 pl-1">
                <span id="edit-tx-date-label" className="text-[13px] font-semibold text-muted">{t.date}</span>
                <label className="relative flex h-10 items-center gap-1.5 rounded-full bg-chip pl-3 pr-2 text-on-surface focus-within:ring-2 focus-within:ring-accent">
                    <Clock size={15} aria-hidden="true" className="shrink-0 text-muted" />
                    <span className="sr-only">{t.time}</span>
                    <input
                        id="edit-tx-time"
                        type="time"
                        data-focus-ring="parent"
                        value={timeValue}
                        onClick={event => openPicker(event.currentTarget)}
                        onChange={e => {
                            const [hours, minutes] = e.target.value.split(':').map(Number);
                            if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
                            const next = new Date(current);
                            next.setHours(hours, minutes, 0, 0);
                            onChange(next.toISOString());
                        }}
                        className="h-full min-w-0 bg-transparent text-[15px] font-semibold tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                </label>
            </div>
            <div role="group" aria-labelledby="edit-tx-date-label" className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={which === 'today'} onClick={() => moveTo(today)} className={chipClass(which === 'today')}>
                    {t.today}
                </button>
                <button type="button" aria-pressed={which === 'yesterday'} onClick={() => moveTo(yesterday)} className={chipClass(which === 'yesterday')}>
                    {t.yesterday}
                </button>
                <label className={clsx(chipClass(which === 'other'), 'relative cursor-pointer pl-3 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-[var(--paper-bg)]')}>
                    <CalendarDays size={16} aria-hidden="true" className="shrink-0" />
                    <span aria-hidden="true">{otherLabel}</span>
                    <input
                        id="edit-tx-date"
                        type="date"
                        data-focus-ring="parent"
                        aria-label={t.pickDate}
                        value={dateValue}
                        onClick={event => openPicker(event.currentTarget)}
                        onKeyDown={pickerKeys}
                        onChange={e => {
                            // A cleared date field keeps the last date instead of saving an invalid one.
                            const [year, month, dayOfMonth] = e.target.value.split('-').map(Number);
                            if (!year || !month || !dayOfMonth) return;
                            moveTo(new Date(year, month - 1, dayOfMonth));
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                </label>
            </div>
        </div>
    );
};
