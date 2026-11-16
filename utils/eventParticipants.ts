import type { Currency, Event, Person } from '../types';
import { getTranslations } from './i18n';
import { EMAIL_PLACEHOLDER_ID_PREFIX, getEventOwnerIds, isEventGuestView, resolveOwnerName } from '../domain/eventViewer';

const PLACEHOLDER_COLOR = '#9E9E9E';

export const normalizeParticipantEmail = (email: string): string =>
  email.trim().toLowerCase();

export const isInvitedEmailPlaceholder = (personId: string): boolean =>
  personId.startsWith(EMAIL_PLACEHOLDER_ID_PREFIX);

export const getParticipantTooltipLabel = (person: Person): string =>
  isInvitedEmailPlaceholder(person.id) ? getTranslations().invitedGuest.replace('{name}', person.name) : person.name;

export const addSharedEmailToEvent = (event: Event, email: string): Event => {
  const normalizedEmail = normalizeParticipantEmail(email);
  if (!normalizedEmail) {
    return event;
  }

  const existingEmails = (event.sharedEmails || []).map(normalizeParticipantEmail);
  if (existingEmails.includes(normalizedEmail)) {
    return {
      ...event,
      sharedEmails: existingEmails,
    };
  }

  return {
    ...event,
    sharedEmails: [...existingEmails, normalizedEmail],
  };
};

export const getParticipantInitials = (name: string): string => {
  const words = name
    .trim()
    .split(/\s+/)
    .map(word => word.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return '?';
};

const formatEmailLocalPart = (email: string): string => {
  const [localPart] = email.split('@');
  const cleaned = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return 'Guest';
  }

  return cleaned
    .split(' ')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const buildPlaceholderName = (
  index: number,
  sharedEmails: string[] | undefined,
  missingCount: number
): string => {
  if (sharedEmails?.[index]) {
    return formatEmailLocalPart(sharedEmails[index]);
  }

  return `Guest ${index + 1}`;
};

export const resolveEventParticipants = ({
  event,
  people,
  userProfile,
  fallbackCurrency,
  viewerUserId,
}: {
  event: Event;
  people: Person[];
  userProfile?: Person;
  fallbackCurrency: Currency;
  /**
   * The signed-in user's auth id (useSessionIdentity), never `userProfile.id`. When it is not the
   * event's owner, the owner's own ids are shown under the owner's name, not as the viewer.
   */
  viewerUserId?: string | null;
}): Person[] => {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const sharedEmails = Array.from(new Set((event.sharedEmails || []).map(normalizeParticipantEmail).filter(Boolean)));
  // In a collaborator's view the ids are all the organizer's: their own ids are the organizer, the
  // rest are the organizer's people. The collaborator's own profile is never one of them.
  const isCollaboratorView = isEventGuestView(event, viewerUserId);
  const ownerIds = new Set(isCollaboratorView ? getEventOwnerIds(event) : []);
  const ownerLabel = isCollaboratorView ? resolveOwnerName(event, people) ?? getTranslations().organizer : '';
  const isViewerProfile = (personId: string) => !isCollaboratorView && userProfile?.id === personId;

  const linkedSharedParticipantCount = event.personIds.filter(personId =>
    !isViewerProfile(personId) && personId !== event.userId && !ownerIds.has(personId)
  ).length;

  const resolvedKnownParticipants = event.personIds.flatMap(personId => {
    if (isViewerProfile(personId) && userProfile) {
      return [userProfile];
    }

    const matchingPerson = peopleById.get(personId);
    if (!matchingPerson) return [];
    // "Me" in the organizer's people is the organizer, not the person reading it.
    return [ownerIds.has(personId) ? { ...matchingPerson, name: ownerLabel } : matchingPerson];
  });

  const missingIds = event.personIds.filter(personId =>
    !isViewerProfile(personId) && !peopleById.has(personId)
  );

  // In a collaborator's view the missing ids are the organizer and the organizer's local people,
  // not the invited emails, so naming them by email position would mislabel them (e.g. the
  // organizer shown as the viewer).
  const isOwnerId = (personId: string) => personId === event.userId || ownerIds.has(personId);
  const guestIds = missingIds.filter(personId => !isOwnerId(personId));

  const placeholderParticipants = missingIds.map(personId => ({
    id: personId,
    name: isOwnerId(personId)
      ? ownerLabel || getTranslations().organizer
      : buildPlaceholderName(guestIds.indexOf(personId), isCollaboratorView ? undefined : sharedEmails, guestIds.length),
    color: PLACEHOLDER_COLOR,
    defaultCurrency: userProfile?.defaultCurrency ?? fallbackCurrency,
    balances: { EUR: 0, USD: 0, RSD: 0 },
  })) satisfies Person[];

  const emailOnlyInviteCount = Math.max(sharedEmails.length - linkedSharedParticipantCount, 0);
  const invitedEmailPlaceholders = sharedEmails
    .slice(sharedEmails.length - emailOnlyInviteCount)
    .map((email) => ({
      id: `${EMAIL_PLACEHOLDER_ID_PREFIX}${email}`,
      name: formatEmailLocalPart(email),
      color: PLACEHOLDER_COLOR,
      defaultCurrency: userProfile?.defaultCurrency ?? fallbackCurrency,
      balances: { EUR: 0, USD: 0, RSD: 0 },
    })) satisfies Person[];

  return [...resolvedKnownParticipants, ...placeholderParticipants, ...invitedEmailPlaceholders];
};
