import React, { useState, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { MapPin } from 'lucide-react';
import { AppState, Event, Transaction, SharedExpense, Person, Currency } from '../../types';
import { SharedExpenseModal } from '../SharedExpenseModal';
import { ShareEventModal } from '../ShareEventModal';
import { ImagePickerSheet } from '../ImagePickerSheet';
import { Breadcrumb } from '../Breadcrumb';
import { useImagePicker, base64ToFile, ImageResult } from '../../hooks/useImagePicker';
import { getSupabaseService } from '../../services/runtimeServices';
import { useEventDetailViewModel } from './useEventDetailViewModel';

import { EventDetailViewProps, ActiveTab } from './types';
import { EventHeader } from './EventHeader';
import { EventTabs } from './EventTabs';
import { ExpensesList, ExpensesFab } from './ExpensesList';
import { SummaryTab } from './SummaryTab';
import { TRANSLATIONS } from '../../constants';

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
    const [summaryCurrency, setSummaryCurrency] = useState<Currency>('EUR');
    const [imageVersion, setImageVersion] = useState(0);
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

    return (
        <div className="pb-24 space-y-6">
            {/* Header */}
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
            />

            {/* Breadcrumb Navigation */}
            <Breadcrumb
                items={[
                    { label: t.events, onClick: onBack, icon: <MapPin size={14} /> },
                    { label: event.name }
                ]}
            />

            {/* Tabs */}
            <EventTabs activeTab={activeTab} setActiveTab={setActiveTab} />

            {/* Content */}
            < div className="min-h-[300px]" >
                <AnimatePresence mode="wait">
                    {activeTab === 'shared' && (
                        <div key="shared" className="space-y-6">
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
                                onOpenSharedModal={() => setIsSharedModalOpen(true)}
                            />
                            <ExpensesFab onClick={() => setIsSharedModalOpen(true)} />
                        </div>
                    )}

                    {activeTab === 'summary' && (
                        <SummaryTab
                            eventPeople={eventPeople}
                            allExpensesForSummary={allExpensesForSummary}
                            summaryCurrency={summaryCurrency}
                            setSummaryCurrency={setSummaryCurrency}
                            state={state}
                        />
                    )}
                </AnimatePresence>
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
