-- Teams: a household, trip group or small business that shares wallets,
-- categories, transactions, events, recurring items and people.
--
-- Membership is by email (like event sharing through shared_emails): a row in
-- team_members grants access as soon as it exists. user_id is filled for the
-- owner; invitees are matched on their signed-in email.
--
-- Roles: owner (one per team, the creator; cannot leave, deletes the team),
-- admin (manages members and deletes team items; granted only by the owner),
-- member (reads and edits team items, may leave).
--
-- Team items keep their user_id (the creator). Any member may read and edit
-- them; only the creator may move them into or out of a team; the creator or a
-- team owner/admin may delete them.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint teams_color_check check (color is null or char_length(color) <= 32)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  user_id uuid references auth.users (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  constraint team_members_pkey primary key (team_id, email),
  constraint team_members_email_check check (
    email = lower(email)
    and char_length(email) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint team_members_role_check check (role in ('owner', 'admin', 'member'))
);

create index if not exists idx_teams_owner_id on public.teams (owner_id);
create index if not exists idx_team_members_email on public.team_members (email);
create index if not exists idx_team_members_user_id on public.team_members (user_id);
create unique index if not exists idx_team_members_one_owner on public.team_members (team_id) where role = 'owner';

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on public.teams, public.team_members from anon;
grant select, insert, update, delete on public.teams, public.team_members to authenticated;

drop trigger if exists set_updated_at on public.teams;
create trigger set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies can consult team_members
-- without recursing through its own RLS.
-- ---------------------------------------------------------------------------

create or replace function public.team_role(p_team uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.team_members m
  where m.team_id = p_team
    and (
      m.user_id = auth.uid()
      or m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
$$;

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_team is not null and exists (
    select 1
    from public.team_members m
    where m.team_id = p_team
      and (
        m.user_id = auth.uid()
        or m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

revoke execute on function public.team_role(uuid) from public, anon;
revoke execute on function public.is_team_member(uuid) from public, anon;
grant execute on function public.team_role(uuid) to authenticated, service_role;
grant execute on function public.is_team_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers on teams and team_members
-- ---------------------------------------------------------------------------

-- The creator becomes the owner member.
create or replace function public.add_team_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = new.owner_id;
  if v_email is null or v_email = '' then
    v_email := lower(auth.jwt() ->> 'email');
  end if;
  if v_email is null or v_email = '' then
    raise exception 'A team owner needs an email address' using errcode = '22023';
  end if;

  insert into public.team_members (team_id, email, user_id, role)
  values (new.id, v_email, new.owner_id, 'owner')
  on conflict (team_id, email) do update set role = 'owner', user_id = excluded.user_id;
  return new;
end;
$$;

drop trigger if exists add_team_owner_member on public.teams;
create trigger add_team_owner_member after insert on public.teams
  for each row execute function public.add_team_owner_member();

create or replace function public.protect_team_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.owner_id is distinct from old.owner_id then
    raise exception 'The team owner cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_team_owner on public.teams;
create trigger protect_team_owner before update on public.teams
  for each row execute function public.protect_team_owner();

-- Role and identity rules for member rows. auth.uid() is null for service-role
-- and SQL-editor sessions, which may change anything.
create or replace function public.protect_team_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_team_exists boolean;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.email := lower(btrim(new.email));
  end if;

  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      -- Only the add_team_owner_member trigger creates the owner row.
      if exists (select 1 from public.team_members m where m.team_id = new.team_id and m.role = 'owner')
        or not exists (select 1 from public.teams t where t.id = new.team_id and t.owner_id = auth.uid()) then
        raise exception 'A team has exactly one owner' using errcode = '42501';
      end if;
      return new;
    end if;
    v_caller_role := public.team_role(new.team_id);
    if new.role = 'admin' and v_caller_role is distinct from 'owner' then
      raise exception 'Only the team owner can add admins' using errcode = '42501';
    end if;
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      -- Invites are by email; user ids are never chosen by the client.
      new.user_id := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id or new.email is distinct from old.email then
      raise exception 'A membership cannot be moved to another team or email' using errcode = '42501';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'A membership cannot be reassigned to another user' using errcode = '42501';
    end if;
    if new.role is distinct from old.role then
      if old.role = 'owner' or new.role = 'owner' then
        raise exception 'The team owner role cannot be granted or removed' using errcode = '42501';
      end if;
      v_caller_role := public.team_role(new.team_id);
      if (old.role = 'admin' or new.role = 'admin') and v_caller_role is distinct from 'owner' then
        raise exception 'Only the team owner can grant or revoke admin' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- DELETE. A cascade from a deleted team has already removed the team row.
  select exists (select 1 from public.teams t where t.id = old.team_id) into v_team_exists;
  if not v_team_exists then
    return old;
  end if;
  if old.role = 'owner' then
    raise exception 'The team owner cannot leave; delete the team instead' using errcode = '42501';
  end if;
  if old.role = 'admin'
    and old.user_id is distinct from auth.uid()
    and old.email is distinct from lower(coalesce(auth.jwt() ->> 'email', ''))
    and public.team_role(old.team_id) is distinct from 'owner' then
    raise exception 'Only the team owner can remove an admin' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_team_members on public.team_members;
create trigger protect_team_members before insert or update or delete on public.team_members
  for each row execute function public.protect_team_members();

revoke execute on function public.add_team_owner_member() from public, anon, authenticated;
revoke execute on function public.protect_team_owner() from public, anon, authenticated;
revoke execute on function public.protect_team_members() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies on teams and team_members
-- ---------------------------------------------------------------------------

drop policy if exists teams_select_member on public.teams;
create policy teams_select_member on public.teams for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_team_member(id));

drop policy if exists teams_insert_own on public.teams;
create policy teams_insert_own on public.teams for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists teams_update_admin on public.teams;
create policy teams_update_admin on public.teams for update to authenticated
  using (public.team_role(id) in ('owner', 'admin'))
  with check (public.team_role(id) in ('owner', 'admin'));

drop policy if exists teams_delete_owner on public.teams;
create policy teams_delete_owner on public.teams for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists team_members_select_member on public.team_members;
create policy team_members_select_member on public.team_members for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists team_members_insert_admin on public.team_members;
create policy team_members_insert_admin on public.team_members for insert to authenticated
  with check (
    public.team_role(team_id) in ('owner', 'admin')
    or (role = 'owner' and exists (
      select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = (select auth.uid())
    ))
  );

drop policy if exists team_members_update_admin on public.team_members;
create policy team_members_update_admin on public.team_members for update to authenticated
  using (public.team_role(team_id) in ('owner', 'admin'))
  with check (public.team_role(team_id) in ('owner', 'admin'));

drop policy if exists team_members_delete_admin_or_self on public.team_members;
create policy team_members_delete_admin_or_self on public.team_members for delete to authenticated
  using (
    public.team_role(team_id) in ('owner', 'admin')
    or user_id = (select auth.uid())
    or email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

-- ---------------------------------------------------------------------------
-- team_id on shared data
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'events', 'recurring_transactions', 'people'] loop
    execute format('alter table public.%I add column if not exists team_id uuid references public.teams (id) on delete set null', t);
    execute format('create index if not exists %I on public.%I (team_id) where team_id is not null', 'idx_' || t || '_team_id', t);
  end loop;
end;
$$;

-- Ownership (user_id) never changes from a client, and only the creator may
-- move an item into or out of a team. Client upserts always send their own
-- user_id, so a teammate's edit keeps the original owner instead of failing.
-- When a team is deleted, ON DELETE SET NULL clears team_id after the team row
-- is gone, which is allowed.
-- SECURITY DEFINER so the team lookup is not hidden by RLS from an
-- email-shared event guest who is not a member of the event's team.
create or replace function public.protect_team_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      new.user_id := old.user_id;
    end if;
    if new.team_id is distinct from old.team_id
      and old.user_id is distinct from auth.uid()
      and (old.team_id is null or exists (select 1 from public.teams t where t.id = old.team_id)) then
      raise exception 'Only the owner can move this item between teams' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_team_row() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'events', 'recurring_transactions', 'people'] loop
    execute format('drop trigger if exists protect_team_row on public.%I', t);
    execute format('create trigger protect_team_row before update on public.%I for each row execute function public.protect_team_row()', t);
  end loop;
end;
$$;

-- Owner-only tables become owner-or-team tables.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'recurring_transactions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own_or_team', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own_or_team', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own_or_team', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own_or_team_admin', t);

    execute format($p$create policy %I on public.%I for select to authenticated
      using (user_id = (select auth.uid()) or (team_id is not null and public.is_team_member(team_id)))$p$,
      t || '_select_own_or_team', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)))$p$,
      t || '_insert_own_or_team', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (user_id = (select auth.uid()) or (team_id is not null and public.is_team_member(team_id)))
      with check ((team_id is null and user_id = (select auth.uid())) or (team_id is not null and public.is_team_member(team_id)))$p$,
      t || '_update_own_or_team', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
      using (user_id = (select auth.uid()) or (team_id is not null and public.team_role(team_id) in ('owner', 'admin')))$p$,
      t || '_delete_own_or_team_admin', t);
  end loop;
end;
$$;

-- Events: owner, invited emails (unchanged) and team members.
drop policy if exists events_select_member on public.events;
create policy events_select_member on public.events for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select auth.jwt()) ->> 'email') = any (shared_emails)
    or (team_id is not null and public.is_team_member(team_id))
  );

drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events for insert to authenticated
  with check (user_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)));

drop policy if exists events_update_member on public.events;
create policy events_update_member on public.events for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select auth.jwt()) ->> 'email') = any (shared_emails)
    or (team_id is not null and public.is_team_member(team_id))
  )
  with check (
    (
      user_id = (select auth.uid())
      or ((select auth.jwt()) ->> 'email') = any (shared_emails)
      or (team_id is not null and public.is_team_member(team_id))
    )
    and (team_id is null or public.is_team_member(team_id))
  );

drop policy if exists events_delete_own on public.events;
create policy events_delete_own on public.events for delete to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and public.team_role(team_id) in ('owner', 'admin')));

-- People: own, people of an event shared with you (by email or team), and team people.
drop policy if exists people_select_own_or_event on public.people;
create policy people_select_own_or_event on public.people for select to authenticated
  using (
    user_id = (select auth.uid())
    or (team_id is not null and public.is_team_member(team_id))
    or exists (
      select 1 from public.events e
      where e.user_id = people.user_id
        and e.person_ids ? people.id
        and (
          ((select auth.jwt()) ->> 'email') = any (e.shared_emails)
          or (e.team_id is not null and public.is_team_member(e.team_id))
        )
    )
  );

drop policy if exists people_insert_own on public.people;
create policy people_insert_own on public.people for insert to authenticated
  with check (user_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)));

drop policy if exists people_update_own on public.people;
create policy people_update_own on public.people for update to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and public.is_team_member(team_id)))
  with check ((team_id is null and user_id = (select auth.uid())) or (team_id is not null and public.is_team_member(team_id)));

drop policy if exists people_delete_own on public.people;
create policy people_delete_own on public.people for delete to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and public.team_role(team_id) in ('owner', 'admin')));

-- Shared expenses follow their event: team members of a team event join the
-- people it is shared with; team owners/admins may delete like the event owner.
drop policy if exists shared_expenses_select_member on public.shared_expenses;
create policy shared_expenses_select_member on public.shared_expenses for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (
        e.user_id = (select auth.uid())
        or ((select auth.jwt()) ->> 'email') = any (e.shared_emails)
        or (e.team_id is not null and public.is_team_member(e.team_id))
      )
  ));

drop policy if exists shared_expenses_insert_member on public.shared_expenses;
create policy shared_expenses_insert_member on public.shared_expenses for insert to authenticated
  with check (
    (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.events e
      where e.id = shared_expenses.event_id
        and (
          e.user_id = (select auth.uid())
          or ((select auth.jwt()) ->> 'email') = any (e.shared_emails)
          or (e.team_id is not null and public.is_team_member(e.team_id))
        )
    )
  );

drop policy if exists shared_expenses_update_member on public.shared_expenses;
create policy shared_expenses_update_member on public.shared_expenses for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (
        e.user_id = (select auth.uid())
        or ((select auth.jwt()) ->> 'email') = any (e.shared_emails)
        or (e.team_id is not null and public.is_team_member(e.team_id))
      )
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (
        e.user_id = (select auth.uid())
        or ((select auth.jwt()) ->> 'email') = any (e.shared_emails)
        or (e.team_id is not null and public.is_team_member(e.team_id))
      )
  ));

drop policy if exists shared_expenses_delete_creator_or_owner on public.shared_expenses;
create policy shared_expenses_delete_creator_or_owner on public.shared_expenses for delete to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = shared_expenses.event_id
        and (
          e.user_id = (select auth.uid())
          or (e.team_id is not null and public.team_role(e.team_id) in ('owner', 'admin'))
        )
    )
  );

commit;
