-- ADR-0009, section 4. Ready for WhatsApp: a verified phone and an opt-in newer than the last opt-out.
-- The one definition read by enqueue_notification, the summary job, the claim and the PARAR lookup.
create function public.is_whatsapp_ready(p public.profiles)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.phone_verified_at is not null
    and p.whatsapp_opt_in_at is not null
    and (p.whatsapp_opt_out_at is null or p.whatsapp_opt_out_at < p.whatsapp_opt_in_at);
$$;

-- The user accepts the notice of p_consent_version, whose text is in git (whatsapp.consent.v<n>.*).
create function public.whatsapp_opt_in(p_consent_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_consent_version is distinct from (public.whatsapp_rules() ->> 'consentVersion')::int then
    raise exception 'invalid_consent_version' using errcode = '22023';
  end if;

  update public.profiles
  set whatsapp_opt_in_at = now(), whatsapp_opt_in_version = p_consent_version
  where id = uid and phone_verified_at is not null;
  if not found then
    raise exception 'phone_not_verified' using errcode = '22023';
  end if;
end;
$$;

-- Off from the app. Repeating keeps the first date. Coming back is only by whatsapp_opt_in, with the notice.
create function public.whatsapp_opt_out()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set whatsapp_opt_out_at = now(), whatsapp_opt_out_source = 'app'
  where id = uid
    and (whatsapp_opt_out_at is null or whatsapp_opt_out_at < whatsapp_opt_in_at);
end;
$$;

revoke execute on function public.is_whatsapp_ready(public.profiles) from public, anon, authenticated;
revoke execute on function public.whatsapp_opt_in(int) from public, anon;
revoke execute on function public.whatsapp_opt_out() from public, anon;
grant execute on function public.whatsapp_opt_in(int) to authenticated;
grant execute on function public.whatsapp_opt_out() to authenticated;
