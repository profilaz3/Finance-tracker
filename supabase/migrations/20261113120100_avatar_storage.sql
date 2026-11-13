-- M18: avatars live in the public `avatars` bucket (created in 20261113120000).
-- Rows may hold: nothing, a short emoji/initial, a public URL in this project's
-- avatars bucket, or (legacy clients only) a bounded data:image URI.
begin;

alter table public.people drop constraint if exists people_avatar_check;
alter table public.people add constraint people_avatar_check check (
  avatar is null
  or char_length(avatar) <= 16
  or avatar like 'https://ccgmzhffcnjcxivetgzv.supabase.co/storage/v1/object/public/avatars/%'
  or (avatar like 'data:image/%' and octet_length(avatar) <= 350000)
);

alter table public.settings drop constraint if exists settings_user_profile_size_check;
alter table public.settings add constraint settings_user_profile_size_check check (
  user_profile is null or octet_length(user_profile::text) <= 360000
);

commit;
