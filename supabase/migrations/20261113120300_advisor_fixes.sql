-- M23: clear the database advisor warnings raised after the hardening migrations.
begin;

-- auth_rls_initplan: evaluate auth.jwt() once per statement, not once per row.
drop policy if exists events_select_member on public.events;
create policy events_select_member on public.events
  for select to authenticated
  using (user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (shared_emails));

drop policy if exists events_update_member on public.events;
create policy events_update_member on public.events
  for update to authenticated
  using (user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (shared_emails))
  with check (user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (shared_emails));

drop policy if exists people_select_own_or_event on public.people;
create policy people_select_own_or_event on public.people
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.user_id = people.user_id
        and ((select auth.jwt()) ->> 'email') = any (e.shared_emails)
        and e.person_ids ? people.id
    )
  );

drop policy if exists shared_expenses_select_member on public.shared_expenses;
create policy shared_expenses_select_member on public.shared_expenses
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (e.user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (e.shared_emails))
  ));

drop policy if exists shared_expenses_insert_member on public.shared_expenses;
create policy shared_expenses_insert_member on public.shared_expenses
  for insert to authenticated
  with check (
    (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.events e
      where e.id = shared_expenses.event_id
        and (e.user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (e.shared_emails))
    )
  );

drop policy if exists shared_expenses_update_member on public.shared_expenses;
create policy shared_expenses_update_member on public.shared_expenses
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (e.user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (e.shared_emails))
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = shared_expenses.event_id
      and (e.user_id = (select auth.uid()) or ((select auth.jwt()) ->> 'email') = any (e.shared_emails))
  ));

-- *_security_definer_function_executable: trigger functions are not RPC endpoints.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- The quota counter is only called by edge functions with the service role,
-- which pass the already-verified user id.
drop function if exists public.consume_ai_quota(text, integer);
create or replace function public.consume_ai_quota(p_user_id uuid, p_fn text, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calls integer;
begin
  if p_user_id is null or p_daily_limit is null or p_daily_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage as u (user_id, day, fn, calls)
  values (p_user_id, (now() at time zone 'utc')::date, p_fn, 1)
  on conflict (user_id, day, fn)
  do update set calls = u.calls + 1
  where u.calls < p_daily_limit
  returning u.calls into v_calls;

  return v_calls is not null;
end;
$$;
revoke execute on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

-- pg_graphql_*_table_exposed: the app talks to PostgREST only; drop the unused GraphQL API.
drop extension if exists pg_graphql;

commit;
