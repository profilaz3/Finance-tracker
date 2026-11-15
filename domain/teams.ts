import type { Budget, RecurringTransaction, Team, TeamMember, TeamRole } from '../types';

/**
 * Who is asking. Membership matches on either the user id (always set for the
 * owner) or the signed-in email (invites are by email), like the server does.
 */
export interface TeamIdentity {
  userId?: string | null;
  email?: string | null;
}

export const TEAM_NAME_MAX_LENGTH = 80;
export const TEAM_EMAIL_MAX_LENGTH = 254;

// Same shape the database enforces (team_members_email_check).
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ROLE_RANK: Record<TeamRole, number> = { owner: 0, admin: 1, member: 2 };

/** Trimmed, lower-cased email, or null when it is not a valid invite address. */
export const normalizeInviteEmail = (email: string | null | undefined): string | null => {
  const normalized = (email ?? '').trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > TEAM_EMAIL_MAX_LENGTH) return null;
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
};

/** Trimmed team name with inner whitespace collapsed; throws when empty or too long. */
export const normalizeTeamName = (name: string): string => {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) throw new Error('Enter a team name');
  if (normalized.length > TEAM_NAME_MAX_LENGTH) {
    throw new Error(`Team names can be at most ${TEAM_NAME_MAX_LENGTH} characters`);
  }
  return normalized;
};

const memberMatches = (member: TeamMember, identity: TeamIdentity): boolean => {
  if (identity.userId && member.userId === identity.userId) return true;
  const email = normalizeInviteEmail(identity.email);
  return email !== null && member.email === email;
};

/** The caller's role in the team, or null when they are not a member. */
export const teamRoleOf = (team: Team | null | undefined, identity: TeamIdentity): TeamRole | null => {
  if (!team) return null;
  let best: TeamRole | null = null;
  for (const member of team.members) {
    if (!memberMatches(member, identity)) continue;
    if (best === null || ROLE_RANK[member.role] < ROLE_RANK[best]) best = member.role;
  }
  if (best === null && identity.userId && team.ownerId === identity.userId) return 'owner';
  return best;
};

export const isTeamMember = (team: Team | null | undefined, identity: TeamIdentity): boolean =>
  teamRoleOf(team, identity) !== null;

/** Owner or admin: rename the team, invite and remove members, delete team items. */
export const canManageTeam = (team: Team | null | undefined, identity: TeamIdentity): boolean => {
  const role = teamRoleOf(team, identity);
  return role === 'owner' || role === 'admin';
};

/** Only the owner deletes the team or grants and revokes admin. */
export const isTeamOwner = (team: Team | null | undefined, identity: TeamIdentity): boolean =>
  teamRoleOf(team, identity) === 'owner';

/** Members and admins may leave; the owner deletes the team instead. */
export const canLeaveTeam = (team: Team | null | undefined, identity: TeamIdentity): boolean => {
  const role = teamRoleOf(team, identity);
  return role === 'admin' || role === 'member';
};

/** Mirrors the server rules for removing someone else's membership. */
export const canRemoveTeamMember = (
  team: Team | null | undefined,
  identity: TeamIdentity,
  member: TeamMember
): boolean => {
  if (member.role === 'owner') return false;
  if (memberMatches(member, identity)) return canLeaveTeam(team, identity);
  const role = teamRoleOf(team, identity);
  if (member.role === 'admin') return role === 'owner';
  return role === 'owner' || role === 'admin';
};

/** Roles the caller may give to a non-owner member (empty when they cannot change roles). */
export const assignableTeamRoles = (
  team: Team | null | undefined,
  identity: TeamIdentity
): Exclude<TeamRole, 'owner'>[] => {
  const role = teamRoleOf(team, identity);
  if (role === 'owner') return ['admin', 'member'];
  if (role === 'admin') return ['member'];
  return [];
};

/**
 * Whether an item may be put in (or kept in) the given team. A personal item
 * (no team) is always allowed; a team requires membership. Only the item's
 * creator may move an existing item between teams; the server enforces that.
 */
export const canAssignToTeam = (
  teams: Team[] | undefined,
  teamId: string | null | undefined,
  identity: TeamIdentity
): boolean => {
  if (!teamId) return true;
  return isTeamMember(teams?.find(team => team.id === teamId), identity);
};

/** Teams the identity belongs to, owner's teams first, then by name. */
export const teamsForUser = (teams: Team[] | undefined, identity: TeamIdentity): Team[] =>
  (teams ?? [])
    .map(team => ({ team, role: teamRoleOf(team, identity) }))
    .filter((entry): entry is { team: Team; role: TeamRole } => entry.role !== null)
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.team.name.localeCompare(b.team.name))
    .map(entry => entry.team);

/**
 * Items of one team, or personal items (not shared with any team) when
 * `teamId` is null or undefined.
 */
export const itemsForTeam = <T extends { teamId?: string | null }>(
  items: readonly T[],
  teamId: string | null | undefined
): T[] => (teamId ? items.filter(item => item.teamId === teamId) : items.filter(item => !item.teamId));

/**
 * Recurring rules this device should generate occurrences for. Personal rules
 * always; a team rule only on its creator's devices, so members do not each
 * generate the same occurrence. Without a known user id team rules are skipped.
 */
export const shouldGenerateRecurring = (
  recurring: Pick<RecurringTransaction, 'teamId' | 'userId'>,
  currentUserId: string | null | undefined
): boolean => {
  if (!recurring.teamId) return true;
  return !!currentUserId && recurring.userId === currentUserId;
};

export type TeamRoleLabelKey = 'teamRoleOwner' | 'teamRoleAdmin' | 'teamRoleMember';

const ROLE_LABEL_KEYS: Record<TeamRole, TeamRoleLabelKey> = {
  owner: 'teamRoleOwner',
  admin: 'teamRoleAdmin',
  member: 'teamRoleMember',
};

/** Translation key for a role label (strings live in constants.ts). */
export const roleLabelKey = (role: TeamRole): TeamRoleLabelKey => ROLE_LABEL_KEYS[role];

/**
 * A transaction recorded in a team wallet belongs to that team. Leaves an
 * explicit teamId (including null) alone.
 */
export const withAccountTeam = <T extends { accountId: string; teamId?: string | null }>(
  transaction: T,
  accounts: readonly { id: string; teamId?: string | null }[]
): T => {
  if (transaction.teamId !== undefined) return transaction;
  const teamId = accounts.find(account => account.id === transaction.accountId)?.teamId;
  return teamId ? { ...transaction, teamId } : transaction;
};

/** Puts a new item in the active workspace unless it already names a team. */
export const withWorkspaceTeam = <T extends { teamId?: string | null }>(item: T, workspaceId: string | null | undefined): T =>
  workspaceId && item.teamId === undefined ? { ...item, teamId: workspaceId } : item;

/** The workspace to show: a stored team id only while the user still belongs to it. */
export const resolveWorkspaceId = (
  storedId: string | null | undefined,
  teams: readonly Pick<Team, 'id'>[] | undefined
): string | null => {
  if (!storedId) return null;
  // Teams not loaded yet: keep the choice instead of flashing personal data.
  if (teams === undefined) return storedId;
  return teams.some(team => team.id === storedId) ? storedId : null;
};

interface WorkspaceScopedSlices {
  accounts: { teamId?: string | null }[];
  transactions: { teamId?: string | null }[];
  events: { teamId?: string | null }[];
  recurringTransactions: { teamId?: string | null }[];
  categories: { teamId?: string | null }[];
  people: { teamId?: string | null }[];
  budget?: Budget | null;
  teamBudgets?: Record<string, Budget>;
}

type BudgetSlices = { budget?: Budget | null; teamBudgets?: Record<string, Budget> };

/**
 * The user's budget for a workspace. Budgets are personal in every workspace: the Personal one is
 * `budget`, and each team workspace has the user's own budget in `teamBudgets[teamId]`.
 */
export const budgetForWorkspace = (state: BudgetSlices, workspaceId: string | null): Budget | null =>
  (workspaceId ? state.teamBudgets?.[workspaceId] : state.budget) ?? null;

/** Stores the budget of a workspace (null removes it) in the full, unscoped state. */
export const withWorkspaceBudget = <S extends BudgetSlices>(state: S, workspaceId: string | null, budget: Budget | null): S => {
  if (!workspaceId) return { ...state, budget };
  const others = Object.fromEntries(Object.entries(state.teamBudgets ?? {}).filter(([teamId]) => teamId !== workspaceId));
  return { ...state, teamBudgets: budget ? { ...others, [workspaceId]: budget } : others };
};

/**
 * What one workspace sees. Wallets, transactions, events and recurring items
 * belong to exactly one workspace. Categories and people are shared upward:
 * a team workspace also offers your personal categories and contacts, so
 * existing setups keep working when a team starts.
 */
export const scopeStateToWorkspace = <S extends WorkspaceScopedSlices>(state: S, workspaceId: string | null): S => {
  const inclusive = <T extends { teamId?: string | null }>(items: T[]): T[] =>
    workspaceId ? items.filter(item => !item.teamId || item.teamId === workspaceId) : itemsForTeam(items, null);
  return {
    ...state,
    accounts: itemsForTeam(state.accounts, workspaceId),
    transactions: itemsForTeam(state.transactions, workspaceId),
    events: itemsForTeam(state.events, workspaceId),
    recurringTransactions: itemsForTeam(state.recurringTransactions, workspaceId),
    categories: inclusive(state.categories),
    people: inclusive(state.people),
    // A team workspace shows the user's budget for that team; Personal keeps `budget` as stored.
    ...(workspaceId ? { budget: budgetForWorkspace(state, workspaceId) } : {}),
  };
};
