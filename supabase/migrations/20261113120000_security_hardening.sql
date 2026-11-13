-- Security and integrity hardening from the November 2026 audit.
-- Covers: C1 (photo storage), C2 (event takeover), H6 (people exposure),
-- H8 (account deletion FKs), H16 (event_id FK), M17 (shared expense deletes),
-- M18 (avatars bucket), M19 (constraints, updated_at), M23 (initplan + duplicate
-- policies, FK indexes), L2 (grants, search_path), L4 (image URL validation).
--
-- Every policy is recreated from scratch so there is exactly one permissive
-- policy per table and command, and auth calls are wrapped in (select ...) so
-- Postgres evaluates them once per statement instead of once per row.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Drop every existing policy on the given table.
create or replace function pg_temp.drop_policies(p_schema text, p_table text)
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies where schemaname = p_schema and tablename = p_table
  loop
    execute format('drop policy %I on %I.%I', r.policyname, p_schema, p_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner-only tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'recurring_transactions'] loop
    perform pg_temp.drop_policies('public', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t || '_select_own', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t || '_insert_own', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t || '_update_own', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t || '_delete_own', t);
  end loop;
end;
$$;

select pg_temp.drop_policies('public', 'settings');
create policy settings_select_own on public.settings for select to authenticated using (user_id = (select auth.uid()));
create policy settings_insert_own on public.settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy settings_update_own on public.settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

select pg_temp.drop_policies('public', 'profiles');
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Events (C2): owners and invited emails can edit, but only the owner can
-- change ownership or the share list.
-- ---------------------------------------------------------------------------

select pg_temp.drop_policies('public', 'events');
create policy events_select_member on public.events for select to authenticated
  using (user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (shared_emails));
create policy events_insert_own on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy events_update_member on public.events for update to authenticated
  using (user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (shared_emails))
  with check (user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (shared_emails));
create policy events_delete_own on public.events for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.protect_event_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() is null for service-role and SQL-editor sessions; admins may change anything.
  if auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      raise exception 'The event owner cannot be changed' using errcode = '42501';
    end if;
    if new.shared_emails is distinct from old.shared_emails and auth.uid() is distinct from old.user_id then
      raise exception 'Only the event owner can change who the event is shared with' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_event_ownership on public.events;
create trigger protect_event_ownership before update on public.events
  for each row execute function public.protect_event_ownership();

-- ---------------------------------------------------------------------------
-- People (H6): participants see only the people that belong to an event
-- shared with them, not the owner's whole list.
-- ---------------------------------------------------------------------------

select pg_temp.drop_policies('public', 'people');
create policy people_select_own_or_event on public.people for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.user_id = people.user_id
        and (select auth.jwt() ->> 'email') = any (e.shared_emails)
        and e.person_ids ? people.id
    )
  );
create policy people_insert_own on public.people for insert to authenticated with check (user_id = (select auth.uid()));
create policy people_update_own on public.people for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy people_delete_own on public.people for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Shared expenses (M17): members can add and edit; only the creator or the
-- event owner can delete. created_by is immutable.
-- ---------------------------------------------------------------------------

alter table public.shared_expenses
  add column if not exists created_by uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz default now();

update public.shared_expenses se
set created_by = e.user_id
from public.events e
where e.id = se.event_id and se.created_by is null;

create index if not exists idx_shared_expenses_created_by on public.shared_expenses (created_by);

select pg_temp.drop_policies('public', 'shared_expenses');
create policy shared_expenses_select_member on public.shared_expenses for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (e.user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (e.shared_emails))
  ));
create policy shared_expenses_insert_member on public.shared_expenses for insert to authenticated
  with check (
    (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.events e
      where e.id = shared_expenses.event_id
        and (e.user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (e.shared_emails))
    )
  );
create policy shared_expenses_update_member on public.shared_expenses for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (e.user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (e.shared_emails))
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (e.user_id = (select auth.uid()) or (select auth.jwt() ->> 'email') = any (e.shared_emails))
  ));
create policy shared_expenses_delete_creator_or_owner on public.shared_expenses for delete to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = shared_expenses.event_id and e.user_id = (select auth.uid())
    )
  );

create or replace function public.protect_shared_expense_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.created_by is distinct from old.created_by then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_shared_expense_creator on public.shared_expenses;
create trigger protect_shared_expense_creator before update on public.shared_expenses
  for each row execute function public.protect_shared_expense_creator();

-- ---------------------------------------------------------------------------
-- Foreign keys (H8, H16) and indexes (M23)
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

alter table public.transactions drop constraint if exists transactions_event_id_fkey;
alter table public.transactions add constraint transactions_event_id_fkey
  foreign key (event_id) references public.events (id) on delete set null;

create index if not exists idx_transactions_event_id on public.transactions (event_id);
create index if not exists idx_recurring_transactions_user_id on public.recurring_transactions (user_id);

-- ---------------------------------------------------------------------------
-- Constraints (M19). Dates stay TEXT because the client compares ISO strings;
-- the checks guarantee they are ISO formatted.
-- ---------------------------------------------------------------------------

alter table public.transactions
  add constraint transactions_currency_check check (currency in ('EUR', 'USD', 'RSD')),
  add constraint transactions_amount_check check (amount >= 0),
  add constraint transactions_fees_check check (fees is null or fees >= 0),
  add constraint transactions_date_check check (date ~ '^\d{4}-\d{2}-\d{2}');

alter table public.accounts
  add constraint accounts_currency_check check (currency in ('EUR', 'USD', 'RSD'));

alter table public.people
  add constraint people_currency_check check (default_currency in ('EUR', 'USD', 'RSD'));

alter table public.settings
  add constraint settings_currency_check check (base_currency is null or base_currency in ('EUR', 'USD', 'RSD')),
  add constraint settings_language_check check (language is null or language in ('en', 'sr'));

alter table public.shared_expenses
  add constraint shared_expenses_currency_check check (currency in ('EUR', 'USD', 'RSD')),
  add constraint shared_expenses_amount_check check (amount >= 0);

alter table public.recurring_transactions
  add column if not exists updated_at timestamptz default now(),
  add constraint recurring_currency_check check (currency in ('EUR', 'USD', 'RSD')),
  add constraint recurring_amount_check check (amount >= 0),
  add constraint recurring_type_check check (type in ('income', 'expense')),
  add constraint recurring_frequency_check check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'yearly')),
  add constraint recurring_start_date_check check (start_date ~ '^\d{4}-\d{2}-\d{2}'),
  add constraint recurring_next_due_check check (next_due ~ '^\d{4}-\d{2}-\d{2}'),
  add constraint recurring_end_date_check check (end_date is null or end_date ~ '^\d{4}-\d{2}-\d{2}');

-- L4: only images from this project's own buckets.
alter table public.events
  add constraint events_image_url_check check (
    image_url is null
    or image_url = ''
    or image_url like 'https://ccgmzhffcnjcxivetgzv.supabase.co/storage/v1/object/public/event-photos/%'
  );

-- updated_at maintenance
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'events', 'people', 'profiles', 'settings', 'transactions', 'shared_expenses', 'recurring_transactions'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and functions (L2)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage (C1, M18)
-- ---------------------------------------------------------------------------

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'event-photos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

select pg_temp.drop_policies('storage', 'objects');

create policy event_photos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-photos');
create policy event_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy event_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy event_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
