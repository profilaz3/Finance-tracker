import React, { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, LogOut, Pencil, Plus, Trash2, UserRound, UsersRound, X } from 'lucide-react';
import { AppState, Team, TeamMember, TeamRole } from '../../types';
import { TRANSLATIONS } from '../../constants';
import { getSupabaseService } from '../../services/runtimeServices';
import {
    TeamIdentity,
    assignableTeamRoles,
    canLeaveTeam,
    canManageTeam,
    canRemoveTeamMember,
    isTeamOwner,
    normalizeInviteEmail,
    roleLabelKey,
    teamRoleOf,
    teamsForUser,
} from '../../domain/teams';
import { ConfirmDialog } from '../ConfirmDialog';
import { Avatar } from '../home/parts';
import { Segmented } from '../ui/Segmented';
import { pluralText } from '../../utils/plural';
import { teamErrorText } from './teamErrors';

interface TeamSettingsProps {
    state: AppState;
    setState: React.Dispatch<React.SetStateAction<AppState>>;
    workspaceId: string | null;
    onWorkspaceChange?: (teamId: string | null) => void;
}

type MemberRole = Exclude<TeamRole, 'owner'>;
type TeamService = Awaited<ReturnType<typeof getSupabaseService>>;

type PendingConfirm =
    | { kind: 'leave'; team: Team }
    | { kind: 'delete'; team: Team }
    | { kind: 'remove'; team: Team; member: TeamMember };

const TEAM_COLORS = ['#0891B2', '#7C3AED', '#EA580C', '#16A34A', '#DB2777', '#2563EB'];

const field = 'h-11 min-w-0 flex-1 rounded-[14px] border-none bg-chip px-4 text-[16px] placeholder:text-faint';

/** Square initial tile in the team colour. */
export const TeamGlyph: React.FC<{ team: Pick<Team, 'name' | 'color'>; size?: number }> = ({ team, size = 40 }) => (
    <span
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-[12px] font-bold text-white"
        style={{ width: size, height: size, background: team.color || TEAM_COLORS[0], fontSize: Math.round(size * 0.42) }}
    >
        {team.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
);

export const TeamSettings: React.FC<TeamSettingsProps> = ({ state, setState, workspaceId, onWorkspaceChange }) => {
    const t = TRANSLATIONS[state.language];
    const [identity, setIdentity] = useState<TeamIdentity>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [invites, setInvites] = useState<Record<string, { email: string; role: MemberRole }>>({});
    const [pending, setPending] = useState<PendingConfirm | null>(null);

    const refresh = useCallback(async () => {
        const teams = await (await getSupabaseService()).fetchTeams();
        setState(prev => ({ ...prev, teams }));
    }, [setState]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const user = await (await getSupabaseService()).getUser();
                if (!cancelled) setIdentity({ userId: user?.id ?? null, email: user?.email ?? null });
                await refresh();
            } catch (err) {
                if (!cancelled) setError(teamErrorText(err, t));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refresh]);

    const run = async (action: (service: TeamService) => Promise<unknown>, after?: () => void) => {
        setBusy(true);
        setError(null);
        try {
            await action(await getSupabaseService());
            await refresh();
            after?.();
        } catch (err) {
            setError(teamErrorText(err, t));
        } finally {
            setBusy(false);
        }
    };

    const teams = teamsForUser(state.teams, identity);
    const knownEmail = normalizeInviteEmail(identity.email);

    const createTeam = () => {
        if (!newName.trim()) return;
        const color = TEAM_COLORS[(state.teams?.length ?? 0) % TEAM_COLORS.length];
        void run(service => service.createTeam(newName, color), () => {
            setNewName('');
            setShowCreate(false);
        });
    };

    const confirmPending = () => {
        if (!pending) return;
        const current = pending;
        setPending(null);
        if (current.kind === 'leave') {
            void run(service => service.leaveTeam(current.team.id), () => {
                if (workspaceId === current.team.id) onWorkspaceChange?.(null);
            });
        } else if (current.kind === 'delete') {
            void run(service => service.deleteTeam(current.team.id), () => {
                if (workspaceId === current.team.id) onWorkspaceChange?.(null);
            });
        } else {
            void run(service => service.removeTeamMember(current.team.id, current.member.email));
        }
    };

    const createForm = (
        <div className="flex gap-2">
            <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createTeam()}
                placeholder={t.teamNamePlaceholder}
                aria-label={t.teamNamePlaceholder}
                maxLength={80}
                className={field}
            />
            <button
                type="button"
                onClick={createTeam}
                disabled={busy || !newName.trim()}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent disabled:opacity-40"
            >
                <Plus size={17} aria-hidden="true" /> {t.createTeam}
            </button>
        </div>
    );

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <p role="alert" className="paper-tile flex items-center gap-2 py-1 pl-4 pr-1 text-[14px] text-neg">
                    <span className="min-w-0 flex-1 py-2">{error}</span>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        aria-label={t.close}
                        title={t.close}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chip"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </p>
            )}

            {onWorkspaceChange && teams.length > 0 && (
                <section className="flex flex-col gap-1.5" aria-labelledby="workspace-heading">
                    <h3 id="workspace-heading" className="px-4 text-[12px] font-semibold uppercase tracking-wide text-faint">
                        {t.workspace}
                    </h3>
                    <div className="paper-tile px-4 py-1" role="radiogroup" aria-labelledby="workspace-heading">
                        {[null, ...teams].map((team, index, list) => {
                            const id = team?.id ?? null;
                            const selected = workspaceId === id;
                            return (
                                <button
                                    key={id ?? 'personal'}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => onWorkspaceChange(id)}
                                    className={clsx(
                                        'flex min-h-[56px] w-full items-center gap-3 text-left',
                                        index < list.length - 1 && 'border-b border-hair',
                                    )}
                                >
                                    {team ? (
                                        <TeamGlyph team={team} size={34} />
                                    ) : (
                                        <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[12px] bg-chip text-muted">
                                            <UserRound size={18} />
                                        </span>
                                    )}
                                    <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{team?.name ?? t.workspacePersonal}</span>
                                    <span
                                        aria-hidden="true"
                                        className={clsx(
                                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                                            selected ? 'bg-accent text-on-accent' : 'border-2 border-hair',
                                        )}
                                    >
                                        {selected && <Check size={14} strokeWidth={3} />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="px-4 text-[13px] text-muted">{t.workspaceHint}</p>
                </section>
            )}

            {loading && teams.length === 0 ? (
                <p className="paper-tile px-4 py-8 text-center text-[14px] text-muted" aria-live="polite">{t.teamLoading}</p>
            ) : teams.length === 0 ? (
                <section className="accent-card flex flex-col gap-4 p-5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/20" aria-hidden="true">
                        <UsersRound size={26} />
                    </span>
                    <div>
                        <h3 className="text-[20px] font-bold tracking-[-0.3px]">{t.teamsTitle}</h3>
                        <p className="mt-1 text-[14px] opacity-85">{t.teamsIntro}</p>
                    </div>
                    <div className="rounded-[18px] bg-[var(--paper-tile)] p-2 text-[var(--paper-text)]">{createForm}</div>
                </section>
            ) : (
                <>
                    {teams.map(team => {
                        const role = teamRoleOf(team, identity);
                        const manage = canManageTeam(team, identity);
                        const roles = assignableTeamRoles(team, identity);
                        const invite = invites[team.id] ?? { email: '', role: 'member' as MemberRole };
                        const inviteEmail = normalizeInviteEmail(invite.email);
                        // Say why Invite is off while the address is incomplete ("bob@").
                        const inviteIncomplete = invite.email.trim().length > 0 && !inviteEmail;
                        const inviteHintId = `team-invite-hint-${team.id}`;
                        const members = [...team.members].sort((a, b) =>
                            (a.role === 'owner' ? 0 : a.role === 'admin' ? 1 : 2) - (b.role === 'owner' ? 0 : b.role === 'admin' ? 1 : 2)
                            || a.email.localeCompare(b.email));
                        const setInvite = (next: Partial<{ email: string; role: MemberRole }>) =>
                            setInvites(prev => ({ ...prev, [team.id]: { ...invite, ...next } }));
                        const sendInvite = () => {
                            if (!inviteEmail) return;
                            void run(service => service.inviteTeamMember(team.id, inviteEmail, invite.role), () =>
                                setInvites(prev => ({ ...prev, [team.id]: { email: '', role: invite.role } })));
                        };

                        return (
                            <section key={team.id} className="paper-tile flex flex-col gap-4 p-4" aria-label={team.name}>
                                <div className="flex items-center gap-3">
                                    <TeamGlyph team={team} size={48} />
                                    {renamingId === team.id ? (
                                        <div className="flex min-w-0 flex-1 gap-2">
                                            <input
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && renameValue.trim()) {
                                                        void run(service => service.renameTeam(team.id, renameValue), () => setRenamingId(null));
                                                    }
                                                    if (e.key === 'Escape') setRenamingId(null);
                                                }}
                                                aria-label={t.teamRename}
                                                maxLength={80}
                                                autoFocus
                                                className={field}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void run(service => service.renameTeam(team.id, renameValue), () => setRenamingId(null))}
                                                disabled={busy || !renameValue.trim()}
                                                aria-label={t.save}
                                                title={t.save}
                                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
                                            >
                                                <Check size={18} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRenamingId(null)}
                                                aria-label={t.cancel}
                                                title={t.cancel}
                                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                                            >
                                                <X size={18} aria-hidden="true" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="truncate text-[18px] font-bold tracking-[-0.2px]">{team.name}</h3>
                                                <p className="text-[13px] text-muted">
                                                    {role ? `${t[roleLabelKey(role)]} · ` : ''}
                                                    {pluralText(team.members.length, state.language, {
                                                        one: t.teamMemberCountOne,
                                                        few: t.teamMemberCountFew,
                                                        other: t.teamMemberCountOther,
                                                    })}
                                                </p>
                                            </div>
                                            {manage && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRenamingId(team.id);
                                                        setRenameValue(team.name);
                                                    }}
                                                    aria-label={`${t.teamRename}: ${team.name}`}
                                                    title={t.teamRename}
                                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted"
                                                >
                                                    <Pencil size={16} aria-hidden="true" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="flex flex-col">
                                    <h4 className="pb-1 text-[12px] font-semibold uppercase tracking-wide text-faint">{t.teamMembers}</h4>
                                    {members.map((member, index) => {
                                        const isMe = (identity.userId && member.userId === identity.userId) || (knownEmail && member.email === knownEmail);
                                        const canChangeRole = !isMe && member.role !== 'owner' && roles.includes(member.role as MemberRole) && roles.length > 1;
                                        const removable = !isMe && canRemoveTeamMember(team, identity, member);
                                        return (
                                            <div
                                                key={member.email}
                                                className={clsx('flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 py-2', index < members.length - 1 && 'border-b border-hair')}
                                            >
                                                <Avatar name={member.email} color={team.color || TEAM_COLORS[0]} size={36} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[15px] font-medium">
                                                        {member.email}
                                                        {isMe && <span className="text-muted"> · {t.teamYou}</span>}
                                                    </p>
                                                    <p className="text-[13px] text-muted">
                                                        {t[roleLabelKey(member.role)]}
                                                        {!member.userId && <> · {t.teamPending}</>}
                                                    </p>
                                                </div>
                                                {removable && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPending({ kind: 'remove', team, member })}
                                                        aria-label={`${t.teamRemoveMember}: ${member.email}`}
                                                        title={t.teamRemoveMember}
                                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-chip hover:text-neg sm:order-last"
                                                    >
                                                        <X size={17} aria-hidden="true" />
                                                    </button>
                                                )}
                                                {canChangeRole && (
                                                    // Phones: on its own line under the email; wider screens: beside it.
                                                    <div className="flex basis-full items-center gap-2 pl-12 sm:basis-auto sm:pl-0">
                                                        <span className="text-[13px] text-muted sm:sr-only">{t.teamRoleLabel}</span>
                                                        <Segmented<MemberRole>
                                                            size="sm"
                                                            ariaLabel={`${t.teamRoleLabel}: ${member.email}`}
                                                            value={member.role as MemberRole}
                                                            onChange={next => {
                                                                if (next !== member.role) void run(service => service.updateTeamMemberRole(team.id, member.email, next));
                                                            }}
                                                            options={roles.map(r => ({ value: r, label: t[roleLabelKey(r)] }))}
                                                            className="shrink-0"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {manage && (
                                    <div className="flex flex-col gap-2 rounded-[18px] bg-chip/60 p-3">
                                        <div className="flex gap-2">
                                            <input
                                                type="email"
                                                inputMode="email"
                                                autoComplete="off"
                                                value={invite.email}
                                                onChange={e => setInvite({ email: e.target.value })}
                                                onKeyDown={e => e.key === 'Enter' && sendInvite()}
                                                placeholder={t.teamInvitePlaceholder}
                                                aria-label={t.teamInvitePlaceholder}
                                                aria-describedby={inviteHintId}
                                                className={clsx(field, 'bg-[var(--paper-tile)]')}
                                            />
                                            <button
                                                type="button"
                                                onClick={sendInvite}
                                                disabled={busy || !inviteEmail}
                                                className="flex h-11 shrink-0 items-center rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent disabled:opacity-40"
                                            >
                                                {t.teamInvite}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p id={inviteHintId} aria-live="polite" className={clsx('min-w-0 flex-1 text-[13px] text-muted', inviteIncomplete && 'font-medium')}>
                                                {inviteIncomplete ? t.teamErrInvalidEmail : t.teamInviteHint}
                                            </p>
                                            {roles.length > 1 && (
                                                <Segmented<MemberRole>
                                                    size="sm"
                                                    ariaLabel={t.teamRoleLabel}
                                                    value={invite.role}
                                                    onChange={next => setInvite({ role: next })}
                                                    options={roles.map(r => ({ value: r, label: t[roleLabelKey(r)] }))}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-wrap justify-end gap-2 border-t border-hair pt-3">
                                    {canLeaveTeam(team, identity) && (
                                        <button
                                            type="button"
                                            onClick={() => setPending({ kind: 'leave', team })}
                                            className="flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-neg hover:bg-chip"
                                        >
                                            <LogOut size={16} aria-hidden="true" /> {t.teamLeave}
                                        </button>
                                    )}
                                    {isTeamOwner(team, identity) && (
                                        <button
                                            type="button"
                                            onClick={() => setPending({ kind: 'delete', team })}
                                            className="flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-neg hover:bg-chip"
                                        >
                                            <Trash2 size={16} aria-hidden="true" /> {t.teamDelete}
                                        </button>
                                    )}
                                </div>
                            </section>
                        );
                    })}

                    {showCreate ? (
                        <section className="paper-tile flex flex-col gap-2 p-3" aria-label={t.newTeam}>
                            {createForm}
                            <button type="button" onClick={() => setShowCreate(false)} className="h-10 self-end rounded-full px-4 text-[14px] font-semibold text-muted hover:bg-chip">
                                {t.cancel}
                            </button>
                        </section>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowCreate(true)}
                            className="paper-tile flex min-h-[56px] items-center justify-center gap-2 text-[15px] font-semibold text-accent"
                        >
                            <Plus size={18} aria-hidden="true" /> {t.newTeam}
                        </button>
                    )}
                </>
            )}

            <ConfirmDialog
                isOpen={pending !== null}
                onCancel={() => setPending(null)}
                onConfirm={confirmPending}
                type={pending?.kind === 'leave' ? 'warning' : 'danger'}
                title={
                    pending?.kind === 'leave' ? t.teamLeaveTitle
                        : pending?.kind === 'delete' ? t.teamDeleteTitle
                            : pending ? t.teamRemoveTitle.replace('{email}', pending.member.email) : ''
                }
                message={
                    pending?.kind === 'leave' ? t.teamLeaveMessage
                        : pending?.kind === 'delete' ? t.teamDeleteMessage
                            : t.teamRemoveMessage
                }
                confirmLabel={pending?.kind === 'leave' ? t.teamLeave : pending?.kind === 'delete' ? t.teamDelete : t.teamRemoveMember}
            />
        </div>
    );
};
