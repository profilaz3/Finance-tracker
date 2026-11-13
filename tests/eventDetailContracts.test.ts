import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../constants';

describe('event detail contracts', () => {
  it('renders shared tab content as a single AnimatePresence child', () => {
    const eventDetailView = readFileSync('components/event-detail/EventDetailView.tsx', 'utf8');
    const sharedBranchCount = (eventDetailView.match(/activeTab === 'shared' && \(/g) || []).length;

    expect(sharedBranchCount).toBe(1);
    expect(eventDetailView).toContain('<ExpensesList');
    expect(eventDetailView).toContain('<ExpensesFab');
  });

  it('resolves event participants through the shared resolver before rendering event detail', () => {
    const eventDetailView = readFileSync('components/event-detail/EventDetailView.tsx', 'utf8');
    const eventCard = readFileSync('components/EventCard.tsx', 'utf8');

    expect(eventDetailView).toContain("import { useEventDetailViewModel } from './useEventDetailViewModel'");
    expect(eventDetailView).toContain('const {');
    expect(eventDetailView).toContain('eventPeople,');
    expect(eventDetailView).toContain('unifiedExpenses,');
    expect(eventDetailView).toContain('allExpensesForSummary,');
    expect(eventDetailView).not.toContain('const eventSharedExpenses =');
    expect(eventDetailView).not.toContain('const linkedTransactions =');
    expect(eventDetailView).not.toContain('const transactionsAsSharedExpenses');
    expect(eventDetailView).not.toContain('const unifiedExpenses: UnifiedExpense[] =');
    expect(eventCard).toContain("from '../utils/eventParticipants'");
    expect(eventCard).toContain('resolveEventParticipants');
    expect(eventCard).toContain('const eventPeople = resolveEventParticipants({');
  });

  it('resolves shared expense payers from eventPeople before falling back to global people', () => {
    const expensesList = readFileSync('components/event-detail/ExpensesList.tsx', 'utf8');

    expect(expensesList).toContain('const payer =');
    expect(expensesList).toContain('eventPeople.find(p => p.id === expense.paidBy)');
    expect(expensesList).toContain('state.people.find(p => p.id === expense.paidBy)');
  });

  it('uses the shared participant initials helper instead of raw first-character avatars', () => {
    const eventHeader = readFileSync('components/event-detail/EventHeader.tsx', 'utf8');
    const expensesList = readFileSync('components/event-detail/ExpensesList.tsx', 'utf8');
    const eventCard = readFileSync('components/EventCard.tsx', 'utf8');

    expect(eventHeader).toContain('getParticipantInitials');
    expect(expensesList).toContain('getParticipantInitials');
    expect(eventCard).toContain('getParticipantInitials');
  });

  it('routes event sharing through the event handler instead of calling Supabase directly from the detail view', () => {
    const eventDetailView = readFileSync('components/event-detail/EventDetailView.tsx', 'utf8');
    const appViewRouter = readFileSync('components/app/AppViewRouter.tsx', 'utf8');
    const eventHandlers = readFileSync('hooks/useEventHandlers.ts', 'utf8');

    expect(eventDetailView).toContain('onShareEvent');
    expect(eventDetailView).toContain('onShare={(email: string) => onShareEvent(event.id, email)}');
    expect(appViewRouter).toContain('handleShareEvent');
    expect(appViewRouter).toContain('onShareEvent={handleShareEvent}');
    expect(eventHandlers).toContain('const handleShareEvent = useCallback(async (id: string, email: string) => {');
    expect(eventHandlers).toContain('await supabaseService.shareEventByEmail(id, normalizedEmail);');
  });

  it('uses participant tooltip labels for invited guest placeholders', () => {
    const eventHeader = readFileSync('components/event-detail/EventHeader.tsx', 'utf8');
    const expensesList = readFileSync('components/event-detail/ExpensesList.tsx', 'utf8');
    const eventCard = readFileSync('components/EventCard.tsx', 'utf8');

    expect(eventHeader).toContain('getParticipantTooltipLabel');
    expect(expensesList).toContain('getParticipantTooltipLabel');
    expect(eventCard).toContain('getParticipantTooltipLabel');
  });

  it('labels the event header icon buttons for accessibility and automation', () => {
    const eventHeader = readFileSync('components/event-detail/EventHeader.tsx', 'utf8');

    expect(eventHeader).toContain('aria-label={t.backToEvents}');
    expect(eventHeader).toContain('title={t.backToEvents}');
    expect(eventHeader).toContain('aria-label={t.eventActions}');
    expect(eventHeader).toContain('title={t.eventActions}');
    expect(TRANSLATIONS.en.backToEvents).toBe('Back to events');
    expect(TRANSLATIONS.en.eventActions).toBe('Event actions');
    expect(TRANSLATIONS.sr.backToEvents).toBe('Nazad na događaje');
    expect(TRANSLATIONS.sr.eventActions).toBe('Akcije događaja');
  });
});
