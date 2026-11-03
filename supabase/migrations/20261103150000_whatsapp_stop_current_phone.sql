-- SEG5-1. PARAR matched any recipient_wa_id ever seen for a user: the owner of a mistyped number (its
-- phone_code line), of an old one or of a recycled one could turn off someone else's WhatsApp. Now only
-- the current phone of a ready profile counts: the same digits, or the deterministic Brazilian ninth
-- digit variant (55 + DDD + 8 digits <-> 55 + DDD + 9 + 8 digits), both sides folded to the 8-digit form.
-- Other countries: digits only. Every ready account of the number still stops together (ADR-0009, 10).
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
    and regexp_replace(substr(p.phone_e164, 2), '^(55[0-9]{2})9([0-9]{8})$', '\1\2')
      = regexp_replace(p_wa_id, '^(55[0-9]{2})9([0-9]{8})$', '\1\2');
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Its only reader was the lookup above.
drop index public.whatsapp_messages_wa_id_idx;
