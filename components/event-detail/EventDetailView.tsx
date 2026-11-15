import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Handshake, Play, Plus, RotateCcw, Share2, UserRound } from 'lucide-react';
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
import { Avatar, Big, compactMoney } from '../home/parts';
import { useImagePicker, base64ToFile, ImageResult } from '../../hooks/useImagePicker';
import { getSupabaseService } from '../../services/runtimeServices';
import { useEventDetailViewModel } from './useEventDetailViewModel';

import { EventDetailViewProps, ActiveTab } from './types';
import { EventHeader } from './EventHeader';
import { EventTabs } from './EventTabs';
import { ExpensesList } from './ExpensesList';
import { SummaryTab } from './SummaryTab';
import { ViewerPickSheet } from './ViewerPickSheet';
import { TRANSLATIONS } from '../../constants';
import { GlassSheet } from '../ui/GlassSheet';
import { EventDebtSummary } from '../EventDebtSummary';
import { buildSettlementExpense, planBalances, planSettlement, spendingExpenses } from '../../domain/settle';
import { vibrate, HAPTIC_PATTERNS } from '../../utils/haptics';

export const EventDetailView: React.FC<EventDetailViewProps> = ({
    event,
    state,
    onBack,
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
    const [activeTab, setActiveTab] = useState<ActiveTab>('shared');
    const [isSharedModalOpen, setIsSharedModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<SharedExpense | undefined>(undefined);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [summaryCurrency, setSummaryCurrency] = useState<Currency>(state.baseCurrency);
    const [imageVersion, setImageVersion] = useState(0);
    const [isSettleOpen, setIsSettleOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const t = TRANSLATIONS[state.language];

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
    useBackLayer('event-settle', isSettleOpen, () => setIsSettleOpen(false));
    useBackLayer('event-edit', isEditOpen, () => setIsEditOpen(false));
    useBackLayer('event-menu', isMenuOpen, () => setIsMenuOpen(false));

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

    // The owner's profile id (or 'self'), the participant a guest picked, or null (guest not listed).
    const selfId = viewer.viewerId;
    const spending = useMemo(() => spendingExpenses(allExpensesForSummary), [allExpensesForSummary]);
    const stats = useMemo(() => {
        const rates = state.rates.rates;
        const total = spending.reduce(
            (sum, expense) => sum + convertCurrency(expense.amount, expense.currency, summaryCurrency, rates),
            0,
        );
        if (!selfId) return { total, share: 0 };
        // Only the id is read; the current user may not be in eventPeople before a profile loads.
        // Spending gives the share; everything (settlements too) gives what is still owed.
        const self = [{ id: selfId } as Person];
        const [mine] = calculateEventPersonTotals({ people: self, expenses: spending, summaryCurrency, rates });
        return { total, share: mine.totalOwed };
    }, [spending, summaryCurrency, state.rates.rates, selfId]);

    const settlementOptions = useMemo(
        () => ({ currency: summaryCurrency, rates: state.rates }),
        [summaryCurrency, state.rates],
    );
    const debts = useMemo(
        () => planSettlement(allExpensesForSummary, settlementOptions),
        [allExpensesForSummary, settlementOptions],
    );
    // My balance is what the settle-up plan says I pay or get (rounded once), so this card,
    // the Summary tab and the suggested payments never differ by a dinar.
    const myBalance = useMemo(() => (selfId ? planBalances(debts).get(selfId) ?? 0 : 0), [debts, selfId]);
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

    const balanceLabel = myBalance > 0 ? t.eventYouAreOwed : myBalance < 0 ? t.youOwe : t.settledUp;
    const statCells = selfId
        ? [
            { label: t.totalSpent, value: compactMoney(stats.total, summaryCurrency, state.language), tone: '' },
            { label: t.yourShare, value: compactMoney(stats.share, summaryCurrency, state.language), tone: '' },
            {
                label: balanceLabel,
                value: compactMoney(Math.abs(myBalance), summaryCurrency, state.language),
                tone: myBalance > 0 ? 'text-pos' : myBalance < 0 ? 'text-neg' : 'text-muted',
            },
        ]
        : [
            { label: t.totalSpent, value: compactMoney(stats.total, summaryCurrency, state.language), tone: '' },
            { label: t.eventExpensesTab, value: String(spending.length), tone: '' },
            {
                label: leftToSettle > 0 ? t.eventLeftToSettle : t.settledUp,
                value: compactMoney(leftToSettle, summaryCurrency, state.language),
                tone: leftToSettle > 0 ? '' : 'text-muted',
            },
        ];
    const viewerLabel = pickedPerson
        ? t.eventYouAre.replace('{name}', pickedPerson.name)
        : viewer.pick === null ? t.eventYouAreNotListed : t.eventWhoAreYou;
    const openAddExpense = () => {
        setActiveTab('shared');
        setIsSharedModalOpen(true);
    };

    return (
        <div className="mx-auto flex max-w-[860px] flex-col gap-4 px-1 pb-8">
            <EventHeader
                event={event}
                eventPeople={eventPeople}
                onBack={onBack}
                onUpdateEvent={onUpdateEvent}
                onDeleteEvent={onDeleteEvent}
                onShowToast={onShowToast}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                isUploadingPhoto={isUploadingPhoto}
                setIsUploadingPhoto={setIsUploadingPhoto}
                imageVersion={imageVersion}
                setImageVersion={setImageVersion}
                fileInputRef={fileInputRef}
                openPicker={openPicker}
                handleFileChange={handleFileChange}
                language={state.language}
                permissions={permissions}
                onEditEvent={() => setIsEditOpen(true)}
            />

            {/* A guest's answer to "Which one are you?", and the way to change it. */}
            {viewer.isGuest && (
                <div className="flex min-h-[48px] items-center gap-2.5 self-start rounded-full bg-chip py-1 pl-1 pr-1 max-w-full">
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

            <section className="paper-tile grid grid-cols-3 divide-x divide-[var(--paper-line)] py-3.5">
                {statCells.map(stat => (
                    <div key={stat.label} className="flex min-w-0 flex-col justify-between gap-0.5 px-3">
                        {/* Labels wrap to two lines rather than cutting off ("Ukupno potrošeno"). */}
                        <span className="text-[12px] font-semibold leading-tight text-muted [overflow-wrap:anywhere]">{stat.label}</span>
                        <Big size={19} className={stat.tone}>{stat.value}</Big>
                    </div>
                ))}
            </section>

            {/* Wraps instead of squeezing: each label stays on one line at 390px. */}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={openAddExpense}
                    className="flex h-12 min-w-[150px] flex-[2_1_auto] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent"
                >
                    <Plus size={19} aria-hidden="true" />
                    {t.addExpense}
                </button>
                {debts.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => setIsSettleOpen(true)}
                        className="flex h-12 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-full bg-chip px-4 text-[15px] font-semibold text-accent sm:flex-none"
                    >
                        <Handshake size={18} aria-hidden="true" />
                        {t.settleUp}
                    </button>
                ) : permissions.canShare && (
                    <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="flex h-12 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-full bg-chip px-4 text-[15px] font-semibold sm:flex-none"
                    >
                        <Share2 size={18} aria-hidden="true" />
                        {t.share}
                    </button>
                )}
                {event.status === 'archived' && (
                    <button
                        type="button"
                        onClick={() => onUpdateEvent(event.id, { startDate: new Date().toISOString(), status: 'active' })}
                        className="flex h-12 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-full bg-chip px-4 text-[15px] font-semibold sm:flex-none"
                    >
                        <Play size={17} aria-hidden="true" />
                        {t.startEvent}
                    </button>
                )}
                {event.status === 'completed' && (
                    <button
                        type="button"
                        onClick={() => onUpdateEvent(event.id, { endDate: undefined, status: 'active' })}
                        className="flex h-12 flex-auto items-center justify-center gap-2 whitespace-nowrap rounded-full bg-chip px-4 text-[15px] font-semibold sm:flex-none"
                    >
                        <RotateCcw size={17} aria-hidden="true" />
                        {t.reopenEvent}
                    </button>
                )}
            </div>

            <EventTabs activeTab={activeTab} setActiveTab={setActiveTab} />

            <div className="min-h-[240px]">
                {activeTab === 'shared' && (
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
                )}

                {activeTab === 'summary' && (
                    <SummaryTab
                        eventPeople={eventPeople}
                        allExpensesForSummary={allExpensesForSummary}
                        summaryCurrency={summaryCurrency}
                        setSummaryCurrency={setSummaryCurrency}
                        state={state}
                        onMarkPaid={handleMarkPaid}
                        eventName={event.name}
                        viewer={viewer}
                    />
                )}
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
            />

            <GlassSheet
                isOpen={isSettleOpen}
                onClose={() => setIsSettleOpen(false)}
                title={t.settleUp}
                closeLabel={t.close}
            >
                <div className="px-1 pb-2">
                    <EventDebtSummary
                        expenses={allExpensesForSummary}
                        people={eventPeople}
                        baseCurrency={summaryCurrency}
                        rates={state.rates}
                        viewer={viewer}
                        onMarkPaid={handleMarkPaid}
                        hasSpending={spending.length > 0}
                        requestPurpose={event.name}
                    />
                </div>
            </GlassSheet>

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
