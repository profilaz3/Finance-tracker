-- Official National Bank of Serbia middle rates (srednji kurs), RSD per one unit of currency.
-- One row per calendar day and currency: weekends and holidays carry the last published list,
-- with list_date saying which list that was. Shared reference data, not user data:
-- any signed-in user may read it; only the nbs-rates edge function (service role) writes,
-- and it only stores days before today (Belgrade time), which can no longer change.
create table if not exists public.exchange_rates (
  rate_date date not null,
  currency text not null,
  middle numeric(14, 4) not null,
  list_date date not null,
  list_number integer,
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (rate_date, currency),
  constraint exchange_rates_currency_check check (currency in ('EUR', 'USD')),
  constraint exchange_rates_middle_check check (middle > 0 and middle < 100000),
  constraint exchange_rates_list_date_check check (list_date <= rate_date and list_date >= rate_date - 14),
  constraint exchange_rates_list_number_check check (list_number is null or list_number between 1 and 400),
  constraint exchange_rates_source_check check (source in ('nbs', 'kurs')),
  constraint exchange_rates_date_range_check check (rate_date >= date '2002-05-15')
);

alter table public.exchange_rates enable row level security;

revoke all on public.exchange_rates from anon, authenticated;
grant select on public.exchange_rates to authenticated;
grant select, insert, update on public.exchange_rates to service_role;

drop policy if exists exchange_rates_select_authenticated on public.exchange_rates;
create policy exchange_rates_select_authenticated on public.exchange_rates
  for select to authenticated
  using (true);
