-- L6: link the two legs of a transfer so edits and deletes act on both.
alter table public.transactions
  add column if not exists transfer_id text;

alter table public.transactions
  drop constraint if exists transactions_transfer_id_check;
alter table public.transactions
  add constraint transactions_transfer_id_check check (transfer_id is null or char_length(transfer_id) <= 64);

create index if not exists idx_transactions_user_transfer_id
  on public.transactions (user_id, transfer_id)
  where transfer_id is not null;
