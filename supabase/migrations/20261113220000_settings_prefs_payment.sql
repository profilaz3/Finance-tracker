-- Payment details for IPS QR payment requests live in settings.prefs.payment:
-- { account: 18 digits, name, address?, city? } or null. Same row, same RLS as the other prefs.
alter table public.settings drop constraint if exists settings_prefs_shape_check;
alter table public.settings add constraint settings_prefs_shape_check check (
  jsonb_typeof(prefs) = 'object'
  and octet_length(prefs::text) <= 32768
  and (prefs -> 'homeLayout' is null or jsonb_typeof(prefs -> 'homeLayout') in ('array', 'null'))
  and (prefs -> 'budget' is null or jsonb_typeof(prefs -> 'budget') in ('object', 'null'))
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
