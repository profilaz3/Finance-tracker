import React from 'react';
import clsx from 'clsx';
import { CalendarDays, Clock } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { getIntlLocale } from '../../utils/locale';

type T = typeof TRANSLATIONS['en'];

const pad = (value: number) => String(value).padStart(2, '0');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayOffset = (base: Date, days: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
/** Days offered as one tap: today and the six before it. */
const RECENT_DAYS = 7;

/** The entry's date, or now when the stored one cannot be read. */
export const entryDate = (date: string) => {
    const parsed = new Date(date);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

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

/** "Today" / "Yesterday" / "Friday", and the date under it ("Sun, 15 Nov"), for the date tile. */
export const dateTileText = (date: string, language: 'en' | 'sr', t: T): { name: string; sub: string } => {
    const current = entryDate(date);
    const today = startOfDay(new Date());
    const day = startOfDay(current).getTime();
    const locale = getIntlLocale(language);
    const sub = new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(current.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
    }).format(current);
    if (day === today.getTime()) return { name: t.today, sub };
    if (day === dayOffset(today, -1).getTime()) return { name: t.yesterday, sub };
    const name = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(current);
    return { name: name.charAt(0).toUpperCase() + name.slice(1), sub };
};

interface DatePanelProps {
    date: string;
    onChange: (isoDate: string) => void;
    /** A day was picked (the panel closes). */
    onPicked: () => void;
    language: 'en' | 'sr';
    t: T;
    /** The date field's id (unique on the page). */
    inputId?: string;
}

/**
 * Which day an entry happened: the last seven days as one tap each (today on the right, like a
 * calendar row), and any other day from the date picker. Changing the day keeps the time.
 */
export const DatePanel: React.FC<DatePanelProps> = ({ date, onChange, onPicked, language, t, inputId = 'edit-tx-date' }) => {
    const current = entryDate(date);
    const today = startOfDay(new Date());
    const selected = startOfDay(current).getTime();
    const days = Array.from({ length: RECENT_DAYS }, (_, index) => dayOffset(today, index - RECENT_DAYS + 1));
    const recent = days.some(day => day.getTime() === selected);
    const locale = getIntlLocale(language);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const dateValue = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
    const otherLabel = recent
        ? t.otherDay
        : new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'long',
            ...(current.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
        }).format(current);

    const moveTo = (target: Date) => {
        const next = new Date(target.getFullYear(), target.getMonth(), target.getDate(), current.getHours(), current.getMinutes(), 0, 0);
        onChange(next.toISOString());
        onPicked();
    };

    return (
        <div className="space-y-2">
            <div role="group" aria-label={t.date} className="grid grid-cols-7 gap-1">
                {days.map(day => {
                    const on = day.getTime() === selected;
                    const isToday = day.getTime() === today.getTime();
                    const full = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(day);
                    return (
                        <button
                            key={day.getTime()}
                            type="button"
                            aria-pressed={on}
                            aria-label={isToday ? `${t.today}, ${full}` : full}
                            onClick={() => moveTo(day)}
                            className={clsx(
                                'flex h-[62px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[16px] transition-colors',
                                on ? 'bg-accent text-on-accent' : 'bg-chip text-on-surface',
                            )}
                        >
                            <span className={clsx('max-w-full truncate px-0.5 text-[11.5px] font-semibold', !on && 'text-muted')}>
                                {isToday ? t.today : weekday.format(day)}
                            </span>
                            <span className="text-[19px] font-bold tabular-nums leading-none">{day.getDate()}</span>
                        </button>
                    );
                })}
            </div>
            <label
                className={clsx(
                    'relative flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[16px] text-[15px] font-semibold focus-within:ring-2 focus-within:ring-accent',
                    recent ? 'bg-chip text-on-surface' : 'bg-accent text-on-accent',
                )}
            >
                <CalendarDays size={17} aria-hidden="true" className="shrink-0" />
                <span aria-hidden="true">{otherLabel}</span>
                <input
                    id={inputId}
                    type="date"
                    data-focus-ring="parent"
                    aria-label={t.pickDate}
                    value={dateValue}
                    onClick={event => openPicker(event.currentTarget)}
                    onKeyDown={pickerKeys}
                    onChange={event => {
                        // A cleared date field keeps the last date instead of saving an invalid one.
                        const [year, month, dayOfMonth] = event.target.value.split('-').map(Number);
                        if (!year || !month || !dayOfMonth) return;
                        moveTo(new Date(year, month - 1, dayOfMonth));
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </label>
        </div>
    );
};

/** The time of day an entry happened (in More); the day stays as it is. */
export const TimeField: React.FC<{ date: string; onChange: (isoDate: string) => void; t: T; inputId?: string }> = ({ date, onChange, t, inputId = 'edit-tx-time' }) => {
    const current = entryDate(date);
    const timeValue = `${pad(current.getHours())}:${pad(current.getMinutes())}`;
    return (
        <div>
            <label htmlFor={inputId} className="mb-1.5 block px-1 text-[13px] font-semibold text-muted">{t.time}</label>
            <div className="relative flex h-12 items-center gap-2.5 rounded-[14px] bg-chip px-4 focus-within:ring-2 focus-within:ring-accent">
                <Clock size={16} aria-hidden="true" className="shrink-0 text-muted" />
                <input
                    id={inputId}
                    type="time"
                    data-focus-ring="parent"
                    value={timeValue}
                    onClick={event => openPicker(event.currentTarget)}
                    onChange={event => {
                        const [hours, minutes] = event.target.value.split(':').map(Number);
                        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
                        const next = new Date(current);
                        next.setHours(hours, minutes, 0, 0);
                        onChange(next.toISOString());
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold tabular-nums text-on-surface outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                />
            </div>
        </div>
    );
};
