import type { Currency, Event, Person } from '../types';

const PLACEHOLDER_COLOR = '#9E9E9E';
const EMAIL_PLACEHOLDER_ID_PREFIX = 'shared-email:';

export const normalizeParticipantEmail = (email: string): string =>
  email.trim().toLowerCase();

export const isInvitedEmailPlaceholder = (personId: string): boolean =>
  personId.startsWith(EMAIL_PLACEHOLDER_ID_PREFIX);

export const getParticipantTooltipLabel = (person: Person): string =>
  isInvitedEmailPlaceholder(person.id) ? `Invited guest: ${person.name}` : person.name;

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
}: {
  event: Event;
  people: Person[];
  userProfile?: Person;
  fallbackCurrency: Currency;
}): Person[] => {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const sharedEmails = Array.from(new Set((event.sharedEmails || []).map(normalizeParticipantEmail).filter(Boolean)));
  const linkedSharedParticipantCount = event.personIds.filter(personId =>
    personId !== userProfile?.id && personId !== event.userId
  ).length;

  const resolvedKnownParticipants = event.personIds.flatMap(personId => {
    if (userProfile?.id === personId) {
      return [userProfile];
    }

    const matchingPerson = peopleById.get(personId);
    return matchingPerson ? [matchingPerson] : [];
  });

  const missingIds = event.personIds.filter(personId =>
    personId !== userProfile?.id && !peopleById.has(personId)
  );

  const placeholderParticipants = missingIds.map((personId, index) => ({
    id: personId,
    name: buildPlaceholderName(index, sharedEmails, missingIds.length),
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
