import type { TRANSLATIONS } from '../../constants';

type Strings = (typeof TRANSLATIONS)['en'];

/**
 * The team service throws English messages (the Supabase service layer and domain/teams.ts).
 * Known ones are shown in the app language; anything else keeps the generic wrapper.
 */
const KNOWN: Array<[RegExp, keyof Strings]> = [
  [/^This email is already a member of the team$/i, 'teamErrAlreadyMember'],
  [/^You are already a member of this team$/i, 'teamErrSelfInvite'],
  [/^Enter a valid email address$/i, 'teamErrInvalidEmail'],
  [/^Enter a team name$/i, 'teamErrNameRequired'],
  [/^Team names can be at most \d+ characters$/i, 'teamErrNameTooLong'],
  [/^Only the team owner or an admin can rename this team$/i, 'teamErrRenameDenied'],
  [/^Only the team owner can delete this team$/i, 'teamErrDeleteDenied'],
  [/^Only the team owner or an admin can change roles$/i, 'teamErrRoleDenied'],
  [/^This member could not be removed$/i, 'teamErrRemoveFailed'],
  [/^User not authenticated$/i, 'teamErrSignedOut'],
  [/^The new team could not be loaded$/i, 'teamErrNotLoaded'],
  [/^(Failed to fetch|NetworkError|Network request failed|Load failed)/i, 'teamErrOffline'],
];

export const teamErrorText = (error: unknown, t: Strings): string => {
  const message = (error instanceof Error ? error.message : String(error ?? '')).trim();
  for (const [pattern, key] of KNOWN) {
    if (pattern.test(message)) return String(t[key]);
  }
  return t.teamActionFailed.replace('{error}', message || t.teamErrUnknown);
};
