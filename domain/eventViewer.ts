import type { Event, Person } from '../types';
import { CONFIG } from '../config';

/**
 * Who is looking at an event, and which participant ids mean "you" or the organizer.
 *
 * Participants are the organizer's own people, so every id in an event is from the organizer's
 * point of view. The organizer refers to themselves as the literal 'self' (or the legacy
 * 'user-profile'), their profile person id, or their sign-in id (`event.userId`). The profile id is
 * normally the sign-in id; when it is not (older or seeded profiles), the event form still puts it
 * first in `personIds`, which is why `personIds[0]` counts as the organizer in a guest's view.
 *
 * A guest (the event was shared with them by email, or a teammate created it) has no id of their
 * own in the event, so they say which participant they are. The answer is kept per device and per
 * sign-in user. Until they answer, or when they are not listed, nothing is "you".
 */

/** The organizer's own id in their data when no profile is loaded. */
export const SELF_ID = 'self';
const LEGACY_PROFILE_ID = 'user-profile';
/** Invited emails that are not linked to a person yet appear as `shared-email:<email>` participants. */
export const EMAIL_PLACEHOLDER_ID_PREFIX = 'shared-email:';

/** A guest's answer to "Which one are you?": a participant id, or null for "I'm not listed". */
export type ViewerPick = string | null;

export interface EventViewer {
  /** The signed-in user did not create the event. */
  isGuest: boolean;
  /** Ids that mean the organizer. In the organizer's own view these are also `selfIds`. */
  ownerIds: ReadonlySet<string>;
  /** Ids shown as "You". Empty for a guest who has not answered or is not listed. */
  selfIds: ReadonlySet<string>;
  /** The id that stands for the viewer in shares and balances, or null when unknown (guest). */
  viewerId: string | null;
  /** The organizer's name for a guest, when their data has a usable one; null otherwise. */
  ownerName: string | null;
  /** Guest only: the valid stored answer (undefined: not answered, or the person left the event). */
  pick: ViewerPick | undefined;
}

/**
 * A guest view needs a known sign-in id and a recorded owner. An event this device created and has
 * not synced back has no owner yet and is the viewer's own.
 */
export const isEventGuestView = (
  event: Pick<Event, 'userId'>,
  sessionUserId: string | null | undefined,
): boolean => !!sessionUserId && !!event.userId && sessionUserId !== event.userId;

const unique = (ids: Array<string | null | undefined>): string[] =>
  [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];

/** The ids the organizer uses for themselves, as seen by a guest. */
export const getEventOwnerIds = (event: Pick<Event, 'userId' | 'personIds'>): string[] =>
  unique([SELF_ID, LEGACY_PROFILE_ID, event.userId, event.personIds[0]]);

/** Names that only make sense to their author ("Me" is the organizer, not the guest reading it). */
const RELATIVE_NAMES = new Set(['me', 'myself', 'self', 'i', 'you', 'ja', 'ti', 'vi', 'mene', 'meni', 'sebe']);

export const isUsableOwnerName = (name: string | null | undefined): name is string => {
  const trimmed = name?.trim();
  return !!trimmed && !RELATIVE_NAMES.has(trimmed.toLowerCase());
};

/**
 * The organizer's name from what a guest can read: RLS shares the organizer's people rows that are
 * in the event, which include the profile person when it is stored as one. Null means "Organizer".
 */
export const resolveOwnerName = (
  event: Pick<Event, 'userId' | 'personIds'>,
  people: ReadonlyArray<Pick<Person, 'id' | 'name'>>,
): string | null => {
  for (const id of unique([event.personIds[0], event.userId])) {
    const name = people.find(person => person.id === id)?.name;
    if (isUsableOwnerName(name)) return name.trim();
  }
  return null;
};

interface BuildEventViewerInput {
  event: Pick<Event, 'userId' | 'personIds'>;
  /** The signed-in user's auth id (useSessionIdentity), never `userProfile.id`. */
  sessionUserId: string | null | undefined;
  /** `state.userProfile?.id`: the organizer's own profile id in their view. */
  userProfileId?: string | null;
  /** The guest's stored answer (readViewerPick); ignored in the organizer's view. */
  pick?: ViewerPick;
  /** The event's participant ids; a pick that is no longer among them counts as unanswered. */
  participantIds?: readonly string[];
  /** People the viewer can read, to name the organizer for a guest. */
  people?: ReadonlyArray<Pick<Person, 'id' | 'name'>>;
}

export const buildEventViewer = ({
  event,
  sessionUserId,
  userProfileId,
  pick,
  participantIds,
  people = [],
}: BuildEventViewerInput): EventViewer => {
  if (!isEventGuestView(event, sessionUserId)) {
    // The organizer's view is unchanged: 'self' and the profile id are "You".
    const selfIds = new Set(unique([SELF_ID, userProfileId]));
    return {
      isGuest: false,
      ownerIds: selfIds,
      selfIds,
      viewerId: userProfileId || SELF_ID,
      ownerName: null,
      pick: undefined,
    };
  }

  const ownerIds = new Set(getEventOwnerIds(event));
  const validPick = pick === null
    ? null
    : typeof pick === 'string' && !ownerIds.has(pick) && (!participantIds || participantIds.includes(pick))
      ? pick
      : undefined;

  return {
    isGuest: true,
    ownerIds,
    selfIds: new Set(validPick ? [validPick] : []),
    viewerId: validPick ?? null,
    ownerName: resolveOwnerName(event, people),
    pick: validPick,
  };
};

/** The participants a guest can say they are: everyone except the organizer. */
export const getPickableParticipants = <T extends Pick<Person, 'id'>>(
  participants: readonly T[],
  viewer: Pick<EventViewer, 'ownerIds'>,
): T[] => participants.filter(person => !viewer.ownerIds.has(person.id));

/** A guest's own invite placeholder (`shared-email:<their email>`), the likely answer if present. */
export const isOwnEmailPlaceholder = (personId: string, sessionEmail: string | null | undefined): boolean =>
  !!sessionEmail && personId === `${EMAIL_PLACEHOLDER_ID_PREFIX}${sessionEmail.trim().toLowerCase()}`;

export interface ParticipantLabels {
  you: string;
  organizer: string;
  unknown: string;
}

/**
 * Display name for a participant id: "You" for the viewer, the person's name, the organizer's name
 * (or "Organizer") for an organizer id nobody can resolve, otherwise `labels.unknown`.
 */
export const participantName = (
  id: string,
  viewer: Pick<EventViewer, 'selfIds' | 'ownerIds' | 'ownerName'>,
  people: ReadonlyArray<Pick<Person, 'id' | 'name'>>,
  labels: ParticipantLabels,
): string => {
  if (viewer.selfIds.has(id)) return labels.you;
  const person = people.find(entry => entry.id === id);
  if (person) return person.name;
  if (viewer.ownerIds.has(id)) return viewer.ownerName ?? labels.organizer;
  return labels.unknown;
};

// --- Per-device answer store ---------------------------------------------------------------------

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const viewerPickKey = (userId: string, eventId: string): string =>
  `${CONFIG.STORAGE_KEY}:event-viewer:${userId}:${eventId}`;

/** The stored answer: a participant id, null for "not listed", undefined when never answered. */
export const readViewerPick = (
  userId: string | null | undefined,
  eventId: string,
  storage: StorageLike | null = defaultStorage(),
): ViewerPick | undefined => {
  if (!userId || !storage) return undefined;
  try {
    const raw = storage.getItem(viewerPickKey(userId, eventId));
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('personId' in parsed)) return undefined;
    const { personId } = parsed as { personId: unknown };
    if (personId === null) return null;
    return typeof personId === 'string' && personId.length > 0 ? personId : undefined;
  } catch {
    return undefined;
  }
};

/** Saves the answer (null: "I'm not listed"); undefined forgets it. Returns false if storage failed. */
export const writeViewerPick = (
  userId: string | null | undefined,
  eventId: string,
  pick: ViewerPick | undefined,
  storage: StorageLike | null = defaultStorage(),
): boolean => {
  if (!userId || !storage) return false;
  try {
    const key = viewerPickKey(userId, eventId);
    if (pick === undefined) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ personId: pick }));
    return true;
  } catch {
    return false;
  }
};
