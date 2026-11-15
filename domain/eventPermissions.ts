import type { Event, Team } from '../types';
import { teamRoleOf } from './teams';

/**
 * What the signed-in user may do with an event, mirroring the RLS policies and triggers in
 * supabase/migrations (security_hardening + teams):
 * - update: the owner, anyone the event is shared with by email, and members of its team;
 * - delete: the owner, or an owner/admin of the event's team (events_delete_own);
 * - share / unshare by email: the owner only (protect_event_ownership raises for anyone else);
 * - participants are the owner's own people, so only the owner edits that list.
 * Guests may edit but not take over or reshare. The server stays the authority; this only keeps
 * the UI from offering actions it would refuse.
 */
export interface EventPermissions {
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canEditParticipants: boolean;
}

export interface EventViewer {
  /** The signed-in user's auth id (not `userProfile.id`, which is a person id). */
  userId?: string | null;
  teams?: Team[];
}

export const getEventPermissions = (
  event: Pick<Event, 'userId' | 'teamId'>,
  viewer: EventViewer,
): EventPermissions => {
  // No owner recorded yet: an event this device created and has not synced back.
  const isOwner = !event.userId || (!!viewer.userId && event.userId === viewer.userId);
  const team = event.teamId ? viewer.teams?.find(entry => entry.id === event.teamId) : undefined;
  const teamRole = team ? teamRoleOf(team, { userId: viewer.userId }) : null;
  const teamAdmin = teamRole === 'owner' || teamRole === 'admin';

  return {
    isOwner,
    canEdit: true,
    canDelete: isOwner || teamAdmin,
    canShare: isOwner,
    canEditParticipants: isOwner,
  };
};
