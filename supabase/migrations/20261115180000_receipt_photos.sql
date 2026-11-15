-- Receipt photos: a private `receipts` bucket. An entry points at its photo with
-- transactions.receipt_data->>'photo' (`<uploader id>/<uuid>.webp|jpg`).
--
-- Upload and delete: only into and from your own folder.
-- Read: you uploaded it, or it is the photo of an entry you can see (yours, or a
-- team entry of a team you are in), so team members see photos on team entries.
-- Paths are random UUIDs that only ever appear on entries the reader can already
-- see, so pointing an entry at someone else's photo needs a path you were shown.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The read policy looks entries up by photo path.
create index if not exists transactions_receipt_photo_idx
  on public.transactions ((receipt_data ->> 'photo'))
  where receipt_data ? 'photo';

drop policy if exists receipts_read on storage.objects;
drop policy if exists receipts_insert_own on storage.objects;
drop policy if exists receipts_delete_own on storage.objects;

create policy receipts_read on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.transactions t
        where t.receipt_data ? 'photo'
          and t.receipt_data ->> 'photo' = storage.objects.name
          and (t.user_id = (select auth.uid()) or public.is_team_member(t.team_id))
      )
    )
  );

create policy receipts_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
  );

create policy receipts_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A photo reference is a path in that bucket, nothing else (team entries come from other people).
alter table public.transactions drop constraint if exists transactions_receipt_photo_check;
alter table public.transactions add constraint transactions_receipt_photo_check check (
  receipt_data is null
  or not (receipt_data ? 'photo')
  or (receipt_data ->> 'photo') ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
);

commit;
