import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { BellRing, CalendarClock, Mail, PieChart, Send, TrendingUp, UsersRound, type LucideIcon } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import type { AppState } from '../../types';
import { Segmented } from '../ui/Segmented';
import { REMINDER_LEADS, type NotificationPrefs, type ReminderLead } from '../../domain/notificationRules';
import { sendTestNotification, setNotificationPrefs, useNotificationPrefs } from '../../hooks/useNotifications';
import { IconTile } from '../ui/IconTile';
import {
    canScheduleReminders,
    getNotificationPermission,
    requestNotificationPermission,
    type NotificationPermission,
} from '../../utils/notifications';

interface NotificationSettingsProps {
    language: AppState['language'];
}

const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }> = ({
    checked,
    onChange,
    label,
    disabled,
}) => (
    <>
        <input
            type="checkbox"
            role="switch"
            aria-label={label}
            checked={checked}
            disabled={disabled}
            onChange={event => onChange(event.target.checked)}
            className="peer sr-only"
        />
        <span
            aria-hidden="true"
            className={clsx(
                'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-disabled:opacity-50',
                checked ? 'bg-accent' : 'bg-chip',
            )}
        >
            <span
                className={clsx(
                    'absolute left-[2px] top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.32,0.64,1)]',
                    checked && 'translate-x-5',
                )}
            />
        </span>
    </>
);

const Glyph: React.FC<{ icon: LucideIcon; tint: string }> = ({ icon, tint }) => <IconTile icon={icon} color={tint} size={36} />;

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ language }) => {
    const t = TRANSLATIONS[language];
    const prefs = useNotificationPrefs();
    const [permission, setPermission] = useState<NotificationPermission | null>(null);
    const [testState, setTestState] = useState<'idle' | 'sent' | 'failed'>('idle');
    const native = canScheduleReminders();

    const refreshPermission = useCallback(() => {
        void getNotificationPermission().then(setPermission);
    }, []);

    useEffect(() => {
        refreshPermission();
        // Coming back from the system settings may have changed the permission.
        const onVisible = () => {
            if (document.visibilityState === 'visible') refreshPermission();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [refreshPermission]);

    const allow = async () => {
        const next = await requestNotificationPermission();
        setPermission(next);
        if (next === 'granted') window.dispatchEvent(new Event('finance:notifications-granted'));
    };

    const sendTest = async () => {
        let current = permission;
        if (current === 'prompt') {
            current = await requestNotificationPermission();
            setPermission(current);
            if (current === 'granted') window.dispatchEvent(new Event('finance:notifications-granted'));
        }
        const ok = current === 'granted' && (await sendTestNotification(language));
        setTestState(ok ? 'sent' : 'failed');
        window.setTimeout(() => setTestState('idle'), 3000);
    };

    const update = (patch: Partial<NotificationPrefs>) => setNotificationPrefs(patch);
    // While the system blocks notifications, bill reminders (system-scheduled only) cannot arrive, so
    // that switch shows off and locked; the others still show as in-app alerts while the app is open.
    // Saved choices are kept and come back once notifications are allowed.
    const blocked = permission === 'denied' || permission === 'unsupported';
    const needsSystem = (key: string) => key === 'bills';

    const permissionText =
        permission === 'granted'
            ? t.notifPermissionGranted
            : permission === 'denied'
                ? t.notifPermissionDenied
                : permission === 'unsupported'
                    ? t.notifPermissionUnsupported
                    : t.notifPermissionPrompt;

    const leadLabels: Record<ReminderLead, string> = {
        0: t.notifLeadSameDay,
        1: t.notifLeadOneDay,
        3: t.notifLeadThreeDays,
    };

    const rows: Array<{ key: 'bills' | 'budget' | 'events' | 'letter' | 'priceIncrease'; icon: LucideIcon; tint: string; title: string; hint: string }> = [
        { key: 'bills', icon: CalendarClock, tint: '#2563EB', title: t.notifBills, hint: t.notifBillsHint },
        { key: 'budget', icon: PieChart, tint: '#EA580C', title: t.notifBudget, hint: t.notifBudgetHint },
        { key: 'events', icon: UsersRound, tint: '#0891B2', title: t.notifEvents, hint: t.notifEventsHint },
        { key: 'letter', icon: Mail, tint: '#7C3AED', title: t.notifLetter, hint: t.notifLetterHint },
        { key: 'priceIncrease', icon: TrendingUp, tint: '#B45309', title: t.priceIncreaseNotifications, hint: t.priceIncreaseNotificationsHint },
    ];

    return (
        <div className="flex flex-col gap-4">
            <section className="paper-tile flex items-center gap-3 p-4" aria-live="polite">
                <Glyph icon={BellRing} tint={permission === 'granted' ? '#16A34A' : permission === 'denied' ? '#DC2626' : '#64748B'} />
                <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold">{t.notifPermission}</h3>
                    <p className={clsx('text-[13px]', permission === 'denied' ? 'text-neg' : 'text-muted')}>{permission ? permissionText : ' '}</p>
                </div>
                {permission === 'prompt' && (
                    <button
                        type="button"
                        onClick={allow}
                        className="h-10 shrink-0 rounded-full bg-accent px-5 text-[14px] font-semibold text-on-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    >
                        {t.notifAllow}
                    </button>
                )}
            </section>

            {blocked && (
                <p id="notif-blocked-hint" className="-mb-2 px-4 text-[13px] leading-snug text-muted">{t.notifBlockedSwitches}</p>
            )}

            <ul className="paper-tile overflow-hidden py-1" aria-describedby={blocked ? 'notif-blocked-hint' : undefined}>
                {rows.map((row, index) => {
                    const locked = blocked && needsSystem(row.key);
                    return (
                    <li key={row.key} className={clsx(index < rows.length - 1 && 'border-b border-hair')}>
                        <label className={clsx('flex min-h-[64px] items-center gap-3 px-4 py-3', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
                            <span className={clsx('flex min-w-0 flex-1 items-center gap-3', locked && 'opacity-60')}>
                                <Glyph icon={row.icon} tint={row.tint} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-semibold">{row.title}</span>
                                    <span className="block text-[13px] leading-snug text-muted">{row.hint}</span>
                                </span>
                            </span>
                            <Switch
                                checked={!locked && prefs[row.key]}
                                disabled={locked}
                                onChange={checked => update({ [row.key]: checked })}
                                label={row.title}
                            />
                        </label>
                        {row.key === 'bills' && prefs.bills && !locked && (
                            <div className="flex flex-col gap-2 px-4 pb-4">
                                <span className="text-[13px] font-semibold text-muted">{t.notifLead}</span>
                                <Segmented<string>
                                    size="sm"
                                    ariaLabel={t.notifLead}
                                    value={String(prefs.leadDays)}
                                    onChange={value => update({ leadDays: Number(value) as ReminderLead })}
                                    options={REMINDER_LEADS.map(lead => ({ value: String(lead), label: leadLabels[lead] }))}
                                />
                            </div>
                        )}
                    </li>
                    );
                })}
            </ul>

            {!native && <p className="px-4 text-[13px] leading-snug text-muted">{t.notifWebHint}</p>}

            <button
                type="button"
                onClick={sendTest}
                disabled={permission === 'denied' || permission === 'unsupported'}
                className="paper-tile flex min-h-[52px] items-center justify-center gap-2 px-4 text-[15px] font-semibold text-accent disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-accent"
            >
                <Send size={17} aria-hidden="true" />
                <span aria-live="polite">
                    {testState === 'sent' ? t.notifTestSent : testState === 'failed' ? t.notifTestFailed : t.notifTest}
                </span>
            </button>
        </div>
    );
};
