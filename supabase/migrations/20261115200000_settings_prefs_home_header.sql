-- The Home header (main number, three numbers under it, trip, colour) syncs in settings.prefs.homeHeader.
-- Same row and RLS as the Home layout; only the shape is checked here (the client repairs unknown values).
alter table public.settings drop constraint if exists settings_prefs_shape_check;
alter table public.settings add constraint settings_prefs_shape_check check (
  jsonb_typeof(prefs) = 'object'
  and octet_length(prefs::text) <= 32768
  and (prefs -> 'homeLayout' is null or jsonb_typeof(prefs -> 'homeLayout') in ('array', 'null'))
  and (
    prefs -> 'homeHeader' is null
    or jsonb_typeof(prefs -> 'homeHeader') = 'null'
    or (
      jsonb_typeof(prefs -> 'homeHeader') = 'object'
      and (prefs #> '{homeHeader,stats}' is null or jsonb_typeof(prefs #> '{homeHeader,stats}') = 'array')
      and coalesce(jsonb_array_length(case when jsonb_typeof(prefs #> '{homeHeader,stats}') = 'array' then prefs #> '{homeHeader,stats}' end), 0) <= 3
      and octet_length((prefs -> 'homeHeader')::text) <= 1024
    )
  )
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
