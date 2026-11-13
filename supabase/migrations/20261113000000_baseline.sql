-- Baseline: the production schema as it stood before the 2026-11-13 hardening.
-- Generated from the live catalog (pg_get_*def). Later migrations layer RLS policies,
-- CHECK constraints, ownership triggers and storage policies on top of this.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create table if not exists public.profiles (
  id uuid not null,
  email text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint profiles_pkey PRIMARY KEY (id)
);
alter table public.profiles enable row level security;

create table if not exists public.settings (
  user_id uuid not null,
  base_currency text default 'USD'::text,
  theme text default 'neon'::text,
  language text default 'en'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  user_profile jsonb,
  constraint settings_pkey PRIMARY KEY (user_id)
);
alter table public.settings enable row level security;

create table if not exists public.accounts (
  id text not null,
  user_id uuid not null,
  name text not null,
  type text not null,
  currency text not null,
  color text not null,
  initial_balance numeric default 0,
  icon text,
  order_index integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint accounts_pkey PRIMARY KEY (id)
);
alter table public.accounts enable row level security;

create table if not exists public.categories (
  id text not null,
  user_id uuid not null,
  name text not null,
  type text not null,
  subcategories jsonb default '[]'::jsonb,
  color text not null,
  icon text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint categories_pkey PRIMARY KEY (id)
);
alter table public.categories enable row level security;

create table if not exists public.people (
  id text not null,
  user_id uuid not null,
  name text not null,
  avatar text,
  color text not null,
  default_currency text not null,
  balances jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint people_pkey PRIMARY KEY (id)
);
alter table public.people enable row level security;

create table if not exists public.events (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  description text,
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  person_ids jsonb default '[]'::jsonb,
  icon text,
  color text,
  image_url text,
  status text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  shared_emails text[] default '{}'::text[],
  constraint events_pkey PRIMARY KEY (id)
);
alter table public.events enable row level security;

create table if not exists public.transactions (
  id text not null,
  user_id uuid not null,
  date text not null,
  amount numeric not null,
  currency text not null,
  category_id text not null,
  account_id text not null,
  person_id text,
  subcategory text,
  note text,
  type text not null,
  receipt_data jsonb,
  fees numeric,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  split_details jsonb,
  event_id uuid,
  constraint transactions_pkey PRIMARY KEY (id)
);
alter table public.transactions enable row level security;

create table if not exists public.shared_expenses (
  id uuid default gen_random_uuid() not null,
  event_id uuid not null,
  name text not null,
  amount numeric(15,2) not null,
  currency text not null,
  paid_by text not null,
  shared_with jsonb default '[]'::jsonb,
  date timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  split_type text default 'equal'::text,
  split_details jsonb,
  category text,
  constraint shared_expenses_pkey PRIMARY KEY (id)
);
alter table public.shared_expenses enable row level security;

create table if not exists public.recurring_transactions (
  id uuid not null,
  user_id uuid not null,
  name text not null,
  amount numeric not null,
  currency text not null,
  category_id text not null,
  account_id text not null,
  type text not null,
  note text,
  subcategory text,
  frequency text not null,
  start_date text not null,
  end_date text,
  last_generated text,
  next_due text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now(),
  constraint recurring_transactions_pkey PRIMARY KEY (id)
);
alter table public.recurring_transactions enable row level security;

alter table public.accounts add constraint accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.categories add constraint categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.events add constraint events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.people add constraint people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.recurring_transactions add constraint recurring_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.settings add constraint settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.shared_expenses add constraint shared_expenses_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public.transactions add constraint transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.accounts add constraint accounts_type_check CHECK ((type = ANY (ARRAY['cash'::text, 'bank'::text, 'digital'::text, 'other'::text])));
alter table public.categories add constraint categories_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
alter table public.events add constraint events_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text])));
alter table public.shared_expenses add constraint shared_expenses_split_type_check CHECK ((split_type = ANY (ARRAY['equal'::text, 'exact'::text])));
alter table public.transactions add constraint transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));

create index if not exists idx_accounts_user_id ON public.accounts USING btree (user_id);
create index if not exists idx_categories_user_id ON public.categories USING btree (user_id);
create index if not exists idx_events_status ON public.events USING btree (status);
create index if not exists idx_events_user_id ON public.events USING btree (user_id);
create index if not exists idx_people_user_id ON public.people USING btree (user_id);
create index if not exists idx_shared_expenses_event_id ON public.shared_expenses USING btree (event_id);
create index if not exists idx_transactions_date ON public.transactions USING btree (date);
create index if not exists idx_transactions_user_id ON public.transactions USING btree (user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', true) on conflict (id) do nothing;

