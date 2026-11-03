-- SEG5-9. The ninth digit fold dropped the 9 from any 13-digit Brazilian number, so the mobile
-- 55 11 9 3333-4444 and the landline 55 11 3333-4444 matched each other. A wa_id without the ninth digit
-- only exists for old 8-digit mobiles, which started with 6 to 9; landlines start with 2 to 5. Fold only
-- when the digit after the 9 is 6 to 9, on both sides.
create or replace function public.whatsapp_stop_by_wa_id(p_wa_id text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed int;
begin
  if p_wa_id is null or p_wa_id !~ '^[0-9]{6,15}$' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  update public.profiles p
  set whatsapp_opt_out_at = now(), whatsapp_opt_out_source = 'webhook'
  where public.is_whatsapp_ready(p)
    and regexp_replace(substr(p.phone_e164, 2), '^(55[0-9]{2})9([6-9][0-9]{7})$', '\1\2')
      = regexp_replace(p_wa_id, '^(55[0-9]{2})9([6-9][0-9]{7})$', '\1\2');
  get diagnostics changed = row_count;
  return changed;
end;
$$;
