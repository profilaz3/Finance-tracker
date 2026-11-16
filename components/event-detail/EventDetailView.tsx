import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Play, Plus, RotateCcw, UserRound } from 'lucide-react';
import { SharedExpense, Currency, Person, EventDebt } from '../../types';
import { SharedExpenseModal } from '../SharedExpenseModal';
import { ShareEventModal } from '../ShareEventModal';
import { EventCreationModal } from '../EventCreationModal';
import { useBackLayer } from '../../hooks/useBackLayer';
import { getEventPermissions } from '../../domain/eventPermissions';
import { useSessionIdentity } from '../../hooks/useSessionIdentity';
import { useEventViewerPick } from '../../hooks/useEventViewerPick';
import { getPickableParticipants, isOwnEmailPlaceholder, type ViewerPick } from '../../domain/eventViewer';
import { ImagePickerSheet } from '../ImagePickerSheet';
import { calculateEventPersonTotals } from '../../utils/eventSummarySelectors';
import { convertCurrency } from '../../utils/currencyUtils';
import { Avatar } from '../home/parts';
import { useImagePicker, base64ToFile, ImageResult } from '../../hooks/useImagePicker';
import { getSupabaseService } from '../../services/runtimeServices';
import { useEventDetailViewModel } from './useEventDetailViewModel';

import { EventDetailViewProps } from './types';
import { EventHeader, type EventHeaderTile } from './EventHeader';
import { ExpensesList } from './ExpensesList';
import { PaidVsShare } from './PaidVsShare';
import { EventCategories } from './EventCategories';
import { ViewerPickSheet } from './ViewerPickSheet';
import { EVENT_STRINGS, countText, eventAmount } from './eventStrings';
import { TRANSLATIONS } from '../../constants';
import { EventDebtSummary } from '../EventDebtSummary';
import { resolveHomeHeader } from '../../domain/homeHeader';
import { getIntlLocale } from '../../utils/locale';
import { buildSettlementExpense, planBalances, planSettlement, spendingExpenses } from '../../domain/settle';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';

export const EventDetailView: React.FC<EventDetailViewProps> = ({
    event,
    state,
    onBack,
    inPane = false,
    onUpdateEvent,
    onShareEvent,
    onDeleteEvent,
    onAddSharedExpense,
    onUpdateSharedExpense,
    onDeleteSharedExpense,
    onEditTransaction,
    onDeleteTransaction,
    onShowToast
}) => {
    const [isSharedModalOpen, setIsSharedModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [editingExpense, setEditingExpense] = useState<SharedExpense | undefined>(undefined);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    // Sums show in the currency most of the spending was in until the user picks another.
    const [chosenCurrency, setChosenCurrency] = useState<Currency | null>(null);
    const [imageVersion, setImageVersion] = useState(0);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editAtPeople, setEditAtPeople] = useState(false);
    const t = TRANSLATIONS[state.language];
    const s = EVENT_STRINGS[state.language];
    const { language } = state;

    // Guests may edit but not delete, reshare or change participants (RLS mirrors this). Ownership
    // compares the sign-in id: the profile id is a person id and never matches event.userId.
    const identity = useSessionIdentity();
    const permissions = useMemo(
        () => getEventPermissions(event, { userId: identity?.userId, teams: state.teams }),
        [event, identity?.userId, state.teams],
    );

    const closeSharedModal = useCallback(() => {
        setIsSharedModalOpen(false);
        setEditingExpense(undefined);
    }, []);
    // Back (browser or Android) closes these sheets instead of leaving the event.
    useBackLayer('event-expense', isSharedModalOpen, closeSharedModal);
    useBackLayer('event-share', isShareModalOpen, () => setIsShareModalOpen(false));
    useBackLayer('event-edit', isEditOpen, () => setIsEditOpen(false));

    // Image picker hook
    const {
        openPicker,
        isPickerOpen,
        closePicker,
        pickFromCamera,
        pickFromGallery,
        fileInputRef,
        handleFileInputChange,
    } = useImagePicker({ quality: 80 });
    // A guest says which participant they are; until then nothing is "you" (domain/eventViewer).
    const [pick, setPick] = useEventViewerPick(identity?.userId, event.id);
    const {
        viewer,
        eventPeople,
        unifiedExpenses,
        allExpensesForSummary,
    } = useEventDetailViewModel({ event, state, sessionUserId: identity?.userId, pick });
    const pickOptions = useMemo(() => getPickableParticipants(eventPeople, viewer), [eventPeople, viewer]);
    const ownInviteId = pickOptions.find(person => isOwnEmailPlaceholder(person.id, identity?.email))?.id;
    const [isPickOpen, setIsPickOpen] = useState(false);
    // Asked once per visit: skipping counts as "not listed" until the next time the event opens.
    const [askedFor, setAskedFor] = useState<string | null>(null);
    const needsPick = viewer.isGuest && viewer.pick === undefined && pickOptions.length > 0;
    useEffect(() => {
        if (!needsPick || askedFor === event.id) return;
        setAskedFor(event.id);
        setIsPickOpen(true);
    }, [askedFor, event.id, needsPick]);
    const closePick = useCallback(() => setIsPickOpen(false), []);
    useBackLayer('event-viewer-pick', isPickOpen, closePick);
    const handlePick = useCallback((next: ViewerPick) => {
        setPick(next);
        setIsPickOpen(false);
    }, [setPick]);
    const pickedPerson = viewer.viewerId ? eventPeople.find(person => person.id === viewer.viewerId) : undefined;

    // Handle image result from picker (camera or gallery)
    const handleImageResult = useCallback(async (result: ImageResult | null) => {
        if (!result) return;

        setIsUploadingPhoto(true);
        try {
            // Convert to File if needed (for native platforms)
            const file = result.file || base64ToFile(result.dataUrl, `event_${event.id}_${Date.now()}.jpg`);
            const supabaseService = await getSupabaseService();
            const publicUrl = await supabaseService.uploadEventPhoto(file, event.id, event.imageUrl);
            onUpdateEvent(event.id, { imageUrl: publicUrl });
            setImageVersion(prev => prev + 1);
        } catch (error: unknown) {
            console.error('Failed to upload photo:', error);
            const errorMessage = error instanceof Error ? error.message : t.unknownError;
            if (onShowToast) {
                onShowToast(t.photoUploadFailed.replace('{error}', errorMessage), 'error');
            }
        } finally {
            setIsUploadingPhoto(false);
        }
    }, [event.id, event.imageUrl, onUpdateEvent, onShowToast, t]);

    // Handle camera selection
    const handleCameraSelect = useCallback(async () => {
        const result = await pickFromCamera();
        await handleImageResult(result);
    }, [pickFromCamera, handleImageResult]);

    // Handle gallery selection
    const handleGallerySelect = useCallback(async () => {
        const result = await pickFromGallery();
        await handleImageResult(result);
    }, [pickFromGallery, handleImageResult]);

    // Handle file input change (web fallback)
    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const result = await handleFileInputChange(e);
        await handleImageResult(result);
    }, [handleFileInputChange, handleImageResult]);

    const handleEditSharedExpense = (expense: SharedExpense) => {
        setEditingExpense(expense);
        setIsSharedModalOpen(true);
    };

    const rates = state.rates;
    const spending = useMemo(() => spendingExpenses(allExpensesForSummary), [allExpensesForSummary]);
    const mainCurrency = useMemo(() => {
        const byCurrency = new Map<Currency, number>();
        for (const expense of spending) {
            byCurrency.set(expense.currency, (byCurrency.get(expense.currency) ?? 0) + convertCurrency(expense.amount, expense.currency, state.baseCurrency, rates.rates));
        }
        return [...byCurrency.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? state.baseCurrency;
    }, [spending, state.baseCurrency, rates.rates]);
    const summaryCurrency = chosenCurrency ?? mainCurrency;

    // Everyone who is "you" here: the owner's profile id and 'self', or the participant a guest picked.
    const { selfIds } = viewer;
    const stats = useMemo(() => {
        const total = spending.reduce((sum, expense) => sum + convertCurrency(expense.amount, expense.currency, summaryCurrency, rates.rates), 0);
        // Only the ids are read; the current user may not be in eventPeople before a profile loads.
        const mine = calculateEventPersonTotals({ people: [...selfIds].map(id => ({ id }) as Person), expenses: spending, summaryCurrency, rates: rates.rates });
        return {
            total,
            share: mine.reduce((sum, entry) => sum + entry.totalOwed, 0),
            paid: mine.reduce((sum, entry) => sum + entry.totalPaid, 0),
            paidCount: spending.filter(expense => selfIds.has(expense.paidBy)).length,
        };
    }, [spending, summaryCurrency, rates.rates, selfIds]);

    const settlementOptions = useMemo(() => ({ currency: summaryCurrency, rates }), [summaryCurrency, rates]);
    const debts = useMemo(() => planSettlement(allExpensesForSummary, settlementOptions), [allExpensesForSummary, settlementOptions]);
    // Balances come from the settle-up plan itself (rounded once), so the header, the rows and the
    // suggested payments never differ by a dinar.
    const balances = useMemo(() => planBalances(debts), [debts]);
    const myBalance = useMemo(() => {
        const sum = [...selfIds].reduce((total, id) => total + (balances.get(id) ?? 0), 0);
        return Math.abs(sum) < 0.005 ? 0 : sum;
    }, [balances, selfIds]);
    // Without a "you" (guest not listed): how much still has to change hands in total.
    const leftToSettle = useMemo(() => debts.reduce((sum, debt) => sum + debt.amount, 0), [debts]);

    // A new expense starts in the currency this event is already using (latest spending first).
    const eventCurrency = useMemo(() => {
        const latest = [...spending].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())[0];
        return latest?.currency ?? state.baseCurrency;
    }, [spending, state.baseCurrency]);

    const handleUnshare = useCallback((email: string) => {
        onUpdateEvent(event.id, { sharedEmails: (event.sharedEmails ?? []).filter(entry => entry !== email) });
        onShowToast?.(t.eventUnshared.replace('{email}', email), 'info');
    }, [event.id, event.sharedEmails, onShowToast, onUpdateEvent, t.eventUnshared]);

    // One tap records the suggested payment as a settlement row (see domain/settle.ts).
    const handleMarkPaid = useCallback((debt: EventDebt) => {
        const expense = buildSettlementExpense({
            createId: () => crypto.randomUUID(),
            eventId: event.id,
            debt,
            name: t.settlement,
        });
        if (!expense) return;
        const remaining = planSettlement([...allExpensesForSummary, expense], settlementOptions);
        vibrate(remaining.length === 0 ? HAPTIC_PATTERNS.success : HAPTIC_PATTERNS.light);
        onAddSharedExpense(expense);
    }, [allExpensesForSummary, event.id, onAddSharedExpense, settlementOptions, t.settlement]);

    const amount = (value: number) => eventAmount(value, summaryCurrency, language);
    const hasSelf = selfIds.size > 0;
    const peopleCount = countText(eventPeople.length, language, s.peopleOne, s.peopleFew, s.peopleOther);
    const balanceLabel = spending.length === 0 ? s.nothingYet
        : !hasSelf ? (leftToSettle > 0 ? s.leftToSettle : t.eventAllSettled)
            : myBalance > 0 ? s.youreOwed : myBalance < 0 ? s.youOwe : s.even;
    const balance = amount(hasSelf ? Math.abs(myBalance) : leftToSettle);

    // "a third each" for an even split, otherwise what part of the whole is yours.
    const shareSub = (() => {
        if (stats.total <= 0) return s.noneYet;
        const ratio = stats.share / stats.total;
        const count = eventPeople.length;
        if (count > 1 && Math.abs(ratio - 1 / count) < 0.005) {
            return count === 2 ? s.half : count === 3 ? s.third : count === 4 ? s.quarter : s.evenly;
        }
        return s.percentOf.replace('{percent}', String(Math.round(ratio * 100)));
    })();
    const expenseCount = countText(spending.length, language, s.expensesOne, s.expensesFew, s.expensesOther);
    const tiles: EventHeaderTile[] = hasSelf
        ? [
            { label: s.spent, value: amount(stats.total), sub: peopleCount },
            { label: s.yourShare, value: amount(stats.share), sub: shareSub },
            {
                label: s.youPaid,
                value: amount(stats.paid),
                sub: stats.paidCount > 0 ? countText(stats.paidCount, language, s.expensesOne, s.expensesFew, s.expensesOther) : s.noneYet,
            },
        ]
        : [
            { label: s.spent, value: amount(stats.total), sub: peopleCount },
            { label: s.expenses, value: String(spending.length), sub: '' },
            { label: s.people, value: String(eventPeople.length), sub: '' },
        ];

    // "4 expenses · ends Tue, 17 Nov"
    const facts = (() => {
        const day = (value: string) => new Intl.DateTimeFormat(getIntlLocale(language), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value));
        const now = Date.now();
        let when = '';
        if (event.startDate && new Date(event.startDate).getTime() > now) when = s.startsOn.replace('{date}', day(event.startDate));
        else if (event.endDate) when = (event.status === 'completed' || new Date(event.endDate).getTime() < now - 86_400_000 ? s.endedOn : s.endsOn).replace('{date}', day(event.endDate));
        else if (event.startDate) when = s.startedOn.replace('{date}', day(event.startDate));
        return [spending.length > 0 ? expenseCount : '', when].filter(Boolean).join(' · ');
    })();

    const viewerLabel = pickedPerson
        ? t.eventYouAre.replace('{name}', pickedPerson.name)
        : viewer.pick === null ? t.eventYouAreNotListed : t.eventWhoAreYou;
    const openAddExpense = () => setIsSharedModalOpen(true);
    const openEdit = (atPeople: boolean) => {
        setEditAtPeople(atPeople);
        setIsEditOpen(true);
    };
    const tone = resolveHomeHeader(state.homeHeader).tone;

    return (
        // A container: beside the Shared list on wide windows the page is narrower than the window.
        <div className="@container mx-auto max-w-[920px] pb-28">
            <EventHeader
                event={event}
                eventPeople={eventPeople}
                tone={tone}
                onBack={onBack}
                inPane={inPane}
                onUpdateEvent={onUpdateEvent}
                onDeleteEvent={onDeleteEvent}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                onEditEvent={() => openEdit(false)}
                onAddPeople={permissions.canEditParticipants ? () => openEdit(true) : undefined}
                isUploadingPhoto={isUploadingPhoto}
                imageVersion={imageVersion}
                fileInputRef={fileInputRef}
                openPicker={openPicker}
                handleFileChange={handleFileChange}
                language={language}
                permissions={permissions}
                currency={summaryCurrency}
                onCurrencyChange={setChosenCurrency}
                balanceLabel={balanceLabel}
                balance={balance}
                facts={facts}
                tiles={tiles}
                s={s}
            />

            <div className="screen-sheet flex flex-col gap-4 pb-4">
                {/* A guest's answer to "Which one are you?", and the way to change it. */}
                {viewer.isGuest && (
                    <div className="flex min-h-[48px] max-w-full items-center gap-2.5 self-start rounded-full bg-chip py-1 pl-1 pr-1">
                        {pickedPerson ? (
                            <Avatar name={pickedPerson.name} color={pickedPerson.color} image={pickedPerson.avatar} size={36} />
                        ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tile text-muted" aria-hidden="true">
                                <UserRound size={18} />
                            </span>
                        )}
                        <span className="min-w-0 truncate text-[14px] font-semibold" data-testid="event-viewer-label">{viewerLabel}</span>
                        <button
                            type="button"
                            onClick={() => setIsPickOpen(true)}
                            aria-label={viewer.pick === undefined ? undefined : t.eventChangeWho}
                            className="h-10 shrink-0 rounded-full px-3.5 text-[14px] font-semibold text-accent hover:bg-accent-soft"
                        >
                            {viewer.pick === undefined ? t.eventChooseWho : t.change}
                        </button>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={openAddExpense}
                        className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-5 text-[16px] font-semibold text-on-accent shadow-[0_10px_24px_-12px_rgb(var(--accent-rgb)/0.7)] active:scale-[0.98]"
                    >
                        <Plus size={20} aria-hidden="true" />
                        {t.addExpense}
                    </button>
                    {event.status !== 'active' && (
                        <button
                            type="button"
                            onClick={() => onUpdateEvent(event.id, event.status === 'completed'
                                ? { endDate: undefined, status: 'active' }
                                : { startDate: new Date().toISOString(), status: 'active' })}
                            className="flex h-[52px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-chip px-4 text-[15px] font-semibold"
                        >
                            {event.status === 'completed' ? <RotateCcw size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                            {event.status === 'completed' ? s.reopen : s.startEvent}
                        </button>
                    )}
                </div>

                {spending.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @xl:items-start">
                        <PaidVsShare
                            people={eventPeople}
                            spending={spending}
                            balances={balances}
                            viewer={viewer}
                            currency={summaryCurrency}
                            rates={rates}
                            language={language}
                            s={s}
                        />
                        <section aria-labelledby="event-settle-title" className="paper-tile px-4 pb-1.5 pt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <h2 id="event-settle-title" className="text-[17px] font-bold tracking-[-0.2px]">{s.settleUp}</h2>
                                {debts.length > 0 && (
                                    <span className="text-[13px] font-medium text-muted">
                                        {countText(debts.length, language, s.paymentsOne, s.paymentsFew, s.paymentsOther)}
                                    </span>
                                )}
                            </div>
                            <div className={debts.length > 0 ? 'mt-0.5' : 'mb-2.5 mt-3'}>
                                <EventDebtSummary
                                    expenses={allExpensesForSummary}
                                    people={eventPeople}
                                    baseCurrency={summaryCurrency}
                                    rates={rates}
                                    viewer={viewer}
                                    onMarkPaid={handleMarkPaid}
                                    hasSpending
                                    requestPurpose={event.name}
                                />
                            </div>
                        </section>
                    </div>
                )}

                <section aria-labelledby="event-expenses-title" className="flex flex-col gap-2.5">
                    <div className="flex items-baseline justify-between gap-3 px-1 pt-1">
                        <h2 id="event-expenses-title" className="text-[20px] font-bold tracking-[-0.3px]">{s.expenses}</h2>
                        {unifiedExpenses.length > 0 && (
                            <span className="text-[13px] font-medium text-muted">{unifiedExpenses.length} · {s.byDay}</span>
                        )}
                    </div>
                    <ExpensesList
                        unifiedExpenses={unifiedExpenses}
                        state={state}
                        eventPeople={eventPeople}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        onEditTransaction={onEditTransaction}
                        onDeleteTransaction={onDeleteTransaction}
                        onEditSharedExpense={handleEditSharedExpense}
                        onDeleteSharedExpense={onDeleteSharedExpense}
                        onOpenSharedModal={openAddExpense}
                        currency={summaryCurrency}
                        viewer={viewer}
                    />
                </section>

                <EventCategories
                    spending={spending}
                    categories={state.categories}
                    currency={summaryCurrency}
                    rates={rates}
                    otherLabel={t.other}
                    language={language}
                    s={s}
                />
            </div>

            <SharedExpenseModal
                isOpen={isSharedModalOpen}
                onClose={closeSharedModal}
                onSave={(expense) => {
                    if (editingExpense) {
                        onUpdateSharedExpense(expense);
                    } else {
                        onAddSharedExpense(expense);
                    }
                    setIsSharedModalOpen(false);
                    setEditingExpense(undefined);
                }}
                people={eventPeople}
                eventId={event.id}
                baseCurrency={state.baseCurrency}
                defaultCurrency={eventCurrency}
                expense={editingExpense}
                onShowToast={onShowToast}
                language={state.language}
                requirePayer={viewer.isGuest}
            />

            <EventCreationModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                event={event}
                onSave={(updates) => onUpdateEvent(event.id, updates)}
                people={state.people}
                userProfile={state.userProfile ?? undefined}
                canEditParticipants={permissions.canEditParticipants}
                focusPeople={editAtPeople}
            />

            <ShareEventModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                onShare={(email: string) => onShareEvent(event.id, email)}
                eventName={event.name}
                sharedEmails={event.sharedEmails ?? []}
                onUnshare={permissions.canShare ? handleUnshare : undefined}
            />

            <ViewerPickSheet
                isOpen={isPickOpen}
                onClose={closePick}
                options={pickOptions}
                current={viewer.pick}
                onPick={handlePick}
                ownInviteId={ownInviteId}
            />

            {/* Image Picker Bottom Sheet */}
            <ImagePickerSheet
                isOpen={isPickerOpen}
                onClose={closePicker}
                onSelectCamera={handleCameraSelect}
                onSelectGallery={handleGallerySelect}
                language={state.language}
                title={t.changePhoto}
            />
        </div>
    );
};
