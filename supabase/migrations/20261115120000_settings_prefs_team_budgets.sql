-- Each team workspace has the user's own budget in settings.prefs.teamBudgets: { "<team id>": Budget }.
-- Same row and RLS as the Personal budget (prefs.budget); only the shape is checked here.
alter table public.settings drop constraint if exists settings_prefs_shape_check;
alter table public.settings add constraint settings_prefs_shape_check check (
  jsonb_typeof(prefs) = 'object'
  and octet_length(prefs::text) <= 32768
  and (prefs -> 'homeLayout' is null or jsonb_typeof(prefs -> 'homeLayout') in ('array', 'null'))
  and (prefs -> 'budget' is null or jsonb_typeof(prefs -> 'budget') in ('object', 'null'))
  and (prefs -> 'teamBudgets' is null or jsonb_typeof(prefs -> 'teamBudgets') in ('object', 'null'))
  and (prefs -> 'appearance' is null or jsonb_typeof(prefs -> 'appearance') in ('object', 'null'))
  and (
    prefs -> 'payment' is null
    or jsonb_typeof(prefs -> 'payment') = 'null'
    or (
      jsonb_typeof(prefs -> 'payment') = 'object'
      and (prefs #>> '{payment,account}') ~ '^[0-9]{18}$'
      and char_length(coalesce(prefs #>> '{payment,name}', '')) between 1 and 70
      and char_length(coalesce(prefs #>> '{payment,address}', '')) <= 70
      and char_length(coalesce(prefs #>> '{payment,city}', '')) <= 70
    )
  )
);
