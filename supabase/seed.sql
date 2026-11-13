-- Local/CI seed data for the Playwright regression scripts (M22).
-- Applied by `supabase db reset` / `supabase start` against the local stack only.
-- Users: ci-owner@example.test and ci-guest@example.test, password: CiPassword123

do $$
declare
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_guest uuid := '22222222-2222-4222-8222-222222222222';
  v_event uuid := '33333333-3333-4333-8333-333333333333';
  u record;
begin
  for u in select * from (values (v_owner, 'ci-owner@example.test'), (v_guest, 'ci-guest@example.test')) as t(id, email) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('CiPassword123', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
    on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now())
    on conflict do nothing;
  end loop;

  update public.settings set base_currency = 'RSD', language = 'en' where user_id = v_owner;

  insert into public.accounts (id, user_id, name, type, currency, color, initial_balance, order_index) values
    ('ci-acc-cash', v_owner, 'Cash', 'cash', 'RSD', '#22c55e', 15000, 0),
    ('ci-acc-bank', v_owner, 'Bank', 'bank', 'EUR', '#3b82f6', 820, 1),
    ('ci-acc-card', v_owner, 'Card', 'digital', 'USD', '#a855f7', 120, 2);

  insert into public.categories (id, user_id, name, type, subcategories, color, icon) values
    ('ci-cat-food', v_owner, 'Food', 'expense', '["Groceries","Restaurants"]', '#f97316', 'utensils'),
    ('ci-cat-travel', v_owner, 'Travel', 'expense', '["Transport","Lodging"]', '#06b6d4', 'plane'),
    ('ci-cat-salary', v_owner, 'Salary', 'income', '[]', '#22c55e', 'briefcase');

  insert into public.people (id, user_id, name, avatar, color, default_currency, balances) values
    ('ci-person-me', v_owner, 'Me', null, '#6366f1', 'EUR', '{}'),
    ('ci-person-alex', v_owner, 'Alex', null, '#ec4899', 'EUR', '{"EUR": 42.5}'),
    ('ci-person-sam', v_owner, 'Sam', null, '#14b8a6', 'RSD', '{"RSD": -1200}');

  insert into public.transactions (id, user_id, date, amount, currency, category_id, account_id, note, type) values
    ('ci-tx-1', v_owner, to_char(now() - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 1450, 'RSD', 'ci-cat-food', 'ci-acc-cash', 'Groceries', 'expense'),
    ('ci-tx-2', v_owner, to_char(now() - interval '3 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 32.4, 'EUR', 'ci-cat-food', 'ci-acc-bank', 'Dinner', 'expense'),
    ('ci-tx-3', v_owner, to_char(now() - interval '10 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 2100, 'EUR', 'ci-cat-salary', 'ci-acc-bank', 'Salary', 'income');

  insert into public.events (id, user_id, name, description, start_date, end_date, person_ids, color, status, shared_emails)
  values (v_event, v_owner, 'Bergamo', 'Seeded trip', now() - interval '20 days', now() - interval '15 days',
          '["ci-person-me","ci-person-alex"]', 'bg-fuchsia-500', 'completed', array['ci-guest@example.test']);

  insert into public.shared_expenses (event_id, name, amount, currency, paid_by, shared_with, date, split_type, category, created_by) values
    (v_event, 'Train tickets', 48.00, 'EUR', 'ci-person-me', '["ci-person-me","ci-person-alex"]', now() - interval '20 days', 'equal', 'Transport', v_owner),
    (v_event, 'Hotel', 180.00, 'EUR', 'ci-person-alex', '["ci-person-me","ci-person-alex"]', now() - interval '19 days', 'equal', 'Lodging', v_owner),
    (v_event, 'Pizza', 36.50, 'EUR', 'ci-person-me', '["ci-person-me","ci-person-alex"]', now() - interval '18 days', 'equal', 'Food', v_owner),
    (v_event, 'Museum', 24.00, 'EUR', 'ci-person-alex', '["ci-person-me","ci-person-alex"]', now() - interval '17 days', 'equal', 'Entertainment', v_owner);
end;
$$;
