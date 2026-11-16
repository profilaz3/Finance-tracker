import { describe, expect, it } from 'vitest';
import { getEventPermissions } from '../domain/eventPermissions';
import type { Team } from '../types';

const team: Team = {
  id: 'team-1',
  name: 'Trip crew',
  ownerId: 'owner',
  members: [
    { email: 'owner@example.test', userId: 'owner', role: 'owner' },
    { email: 'admin@example.test', userId: 'admin', role: 'admin' },
    { email: 'member@example.test', userId: 'member', role: 'member' },
  ],
};

describe('getEventPermissions', () => {
  it('gives the owner every action', () => {
    expect(getEventPermissions({ userId: 'owner' }, { userId: 'owner' })).toEqual({
      isOwner: true,
      canEdit: true,
      canDelete: true,
      canShare: true,
      canEditParticipants: true,
    });
  });

  it('treats an event without a recorded owner as the local user’s own', () => {
    expect(getEventPermissions({}, { userId: 'me' }).isOwner).toBe(true);
    expect(getEventPermissions({ userId: undefined }, {}).canDelete).toBe(true);
  });

  it('lets an email guest edit but not delete, reshare or change participants', () => {
    const guest = getEventPermissions({ userId: 'owner' }, { userId: 'guest' });
    expect(guest).toEqual({
      isOwner: false,
      canEdit: true,
      canDelete: false,
      canShare: false,
      canEditParticipants: false,
    });
  });

  it('lets team owners and admins delete a team event, but only the creator shares it', () => {
    const event = { userId: 'member', teamId: 'team-1' };
    expect(getEventPermissions(event, { userId: 'admin', teams: [team] })).toMatchObject({ canDelete: true, canShare: false });
    expect(getEventPermissions(event, { userId: 'owner', teams: [team] })).toMatchObject({ canDelete: true, canShare: false });
    expect(getEventPermissions({ userId: 'owner', teamId: 'team-1' }, { userId: 'member', teams: [team] }))
      .toMatchObject({ canDelete: false, canShare: false });
  });

  it('does not grant team rights for a team the viewer cannot see', () => {
    expect(getEventPermissions({ userId: 'owner', teamId: 'other' }, { userId: 'admin', teams: [team] }).canDelete).toBe(false);
  });
});
