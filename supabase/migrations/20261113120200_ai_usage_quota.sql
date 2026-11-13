-- H7: per-user daily quota for the AI edge functions.
begin;

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  fn text not null check (fn in ('scan-receipt', 'parse-transaction', 'generate-insights')),
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, day, fn)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Atomically counts one call and reports whether it fits the daily limit.
create or replace function public.consume_ai_quota(p_fn text, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_calls integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_daily_limit is null or p_daily_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage as u (user_id, day, fn, calls)
  values (v_uid, (now() at time zone 'utc')::date, p_fn, 1)
  on conflict (user_id, day, fn)
  do update set calls = u.calls + 1
  where u.calls < p_daily_limit
  returning u.calls into v_calls;

  return v_calls is not null;
end;
$$;

revoke all on function public.consume_ai_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer) to authenticated;

commit;
