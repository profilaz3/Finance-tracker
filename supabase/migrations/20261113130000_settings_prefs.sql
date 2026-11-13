-- Appearance (mode, accent, glass), the Home block layout and the monthly budget.
-- One jsonb document per user on the existing settings row, so it inherits the
-- settings RLS policies (select/insert/update own row only).
alter table public.settings
  add column if not exists prefs jsonb not null default '{}'::jsonb;

alter table public.settings drop constraint if exists settings_prefs_shape_check;
alter table public.settings add constraint settings_prefs_shape_check check (
  jsonb_typeof(prefs) = 'object'
  and octet_length(prefs::text) <= 32768
  and (prefs -> 'homeLayout' is null or jsonb_typeof(prefs -> 'homeLayout') in ('array', 'null'))
  and (prefs -> 'budget' is null or jsonb_typeof(prefs -> 'budget') in ('object', 'null'))
  and (prefs -> 'appearance' is null or jsonb_typeof(prefs -> 'appearance') in ('object', 'null'))
);
