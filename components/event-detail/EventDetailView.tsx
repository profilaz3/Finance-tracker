import React, { useState, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { Handshake, Play, Plus, RotateCcw, Share2 } from 'lucide-react';
import { SharedExpense, Currency, Person, EventDebt } from '../../types';
import { SharedExpenseModal } from '../SharedExpenseModal';
import { ShareEventModal } from '../ShareEventModal';
import { ImagePickerSheet } from '../ImagePickerSheet';
import { calculateEventPersonTotals } from '../../utils/eventSummarySelectors';
import { convertCurrency } from '../../utils/currencyUtils';
import { Big, compactMoney } from '../home/parts';
import { useImagePicker, base64ToFile, ImageResult } from '../../hooks/useImagePicker';
import { getSupabaseService } from '../../services/runtimeServices';
import { useEventDetailViewModel } from './useEventDetailViewModel';

import { EventDetailViewProps, ActiveTab } from './types';
import { EventHeader } from './EventHeader';
import { EventTabs } from './EventTabs';
import { ExpensesList } from './ExpensesList';
import { SummaryTab } from './SummaryTab';
import { TRANSLATIONS } from '../../constants';
import { GlassSheet } from '../ui/GlassSheet';
import { EventDebtSummary } from '../EventDebtSummary';
import { buildSettlementExpense, planSettlement, settleUnitCents, spendingExpenses } from '../../domain/settle';
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
    const t = TRANSLATIONS[state.language];

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
    const {
        eventPeople,
        unifiedExpenses,
        allExpensesForSummary,
    } = useEventDetailViewModel({ event, state });

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

    const selfId = state.userProfile?.id || 'self';
    const spending = useMemo(() => spendingExpenses(allExpensesForSummary), [allExpensesForSummary]);
    const stats = useMemo(() => {
        const rates = state.rates.rates;
        const total = spending.reduce(
            (sum, expense) => sum + convertCurrency(expense.amount, expense.currency, summaryCurrency, rates),
            0,
        );
        // Only the id is read; the current user may not be in eventPeople before a profile loads.
        // Spending gives the share; everything (settlements too) gives what is still owed.
        const self = [{ id: selfId } as Person];
        const [mine] = calculateEventPersonTotals({ people: self, expenses: spending, summaryCurrency, rates });
        const [net] = calculateEventPersonTotals({ people: self, expenses: allExpensesForSummary, summaryCurrency, rates });
        const balance = Math.round((net.totalPaid - net.totalOwed) * 100) / 100;
        return { total, share: mine.totalOwed, balance: Math.abs(balance) * 100 < settleUnitCents(summaryCurrency) ? 0 : balance };
    }, [allExpensesForSummary, spending, summaryCurrency, state.rates.rates, selfId]);

    const settlementOptions = useMemo(
        () => ({ currency: summaryCurrency, rates: state.rates }),
        [summaryCurrency, state.rates],
    );
    const debts = useMemo(
        () => planSettlement(allExpensesForSummary, settlementOptions),
        [allExpensesForSummary, settlementOptions],
    );

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

    const balanceLabel = stats.balance > 0 ? t.eventYouAreOwed : stats.balance < 0 ? t.youOwe : t.settledUp;
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
            />

            <section className="paper-tile grid grid-cols-3 divide-x divide-[var(--paper-line)] py-3.5">
                {[
                    { label: t.totalSpent, value: compactMoney(stats.total, summaryCurrency, state.language), tone: '' },
                    { label: t.yourShare, value: compactMoney(stats.share, summaryCurrency, state.language), tone: '' },
                    {
                        label: balanceLabel,
                        value: compactMoney(Math.abs(stats.balance), summaryCurrency, state.language),
                        tone: stats.balance > 0 ? 'text-pos' : stats.balance < 0 ? 'text-neg' : 'text-muted',
                    },
                ].map(stat => (
                    <div key={stat.label} className="flex min-w-0 flex-col gap-0.5 px-3.5">
                        <span className="truncate text-[12px] font-semibold text-muted">{stat.label}</span>
                        <Big size={19} className={stat.tone}>{stat.value}</Big>
                    </div>
                ))}
            </section>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={openAddExpense}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-on-accent"
                >
                    <Plus size={19} aria-hidden="true" />
                    {t.addExpense}
                </button>
                {debts.length > 0 ? (
                    <button
                        type="button"
                        onClick={() => setIsSettleOpen(true)}
                        className="flex h-12 items-center justify-center gap-2 rounded-full bg-chip px-4 text-[15px] font-semibold text-accent"
                    >
                        <Handshake size={18} aria-hidden="true" />
                        {t.settleUp}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="flex h-12 items-center justify-center gap-2 rounded-full bg-chip px-4 text-[15px] font-semibold"
                    >
                        <Share2 size={18} aria-hidden="true" />
                        {t.share}
                    </button>
                )}
                {event.status === 'archived' && (
                    <button
                        type="button"
                        onClick={() => onUpdateEvent(event.id, { startDate: new Date().toISOString(), status: 'active' })}
                        className="flex h-12 items-center justify-center gap-2 rounded-full bg-chip px-4 text-[15px] font-semibold"
                    >
                        <Play size={17} aria-hidden="true" />
                        {t.startEvent}
                    </button>
                )}
                {event.status === 'completed' && (
                    <button
                        type="button"
                        onClick={() => onUpdateEvent(event.id, { endDate: undefined, status: 'active' })}
                        className="flex h-12 items-center justify-center gap-2 rounded-full bg-chip px-4 text-[15px] font-semibold"
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
                    />
                )}
            </div>

            <SharedExpenseModal
                isOpen={isSharedModalOpen}
                onClose={() => {
                    setIsSharedModalOpen(false);
                    setEditingExpense(undefined);
                }}
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
                expense={editingExpense}
                onShowToast={onShowToast}
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
                        selfId={selfId}
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
