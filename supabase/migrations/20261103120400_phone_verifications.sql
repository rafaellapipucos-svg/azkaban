-- ADR-0009, section 3. A one-time code sent through WhatsApp itself. The code is never stored: only the
-- SHA-256 of id:code. The client neither reads nor writes this table: RLS on, no policy, no grant.
create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts int not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);
create index phone_verifications_phone_idx on public.phone_verifications (phone_e164, created_at desc);
-- The retention job.
create index phone_verifications_created_idx on public.phone_verifications (created_at);

alter table public.phone_verifications enable row level security;

revoke all on public.phone_verifications from anon, authenticated;

-- Seconds until the row that holds a limit leaves its window, or null when the limit is not reached.
-- p_times is newest first; the p_max-th of them is the one whose exit frees a slot.
create function public.phone_limit_wait(p_times timestamptz[], p_max int, p_window interval)
returns int
language sql
stable
set search_path = ''
as $$
  select case when cardinality(p_times) >= p_max
    then greatest(1, ceil(extract(epoch from p_times[p_max] + p_window - now()))::int)
  end;
$$;

-- Called by the phone-verification function with the user of the JWT, never by the client. Applies the
-- limits of whatsappRules.verification (resend wait, sends per user and per number in a rolling day),
-- kills the user's live code and makes a new one. Answers instead of raising, so the function maps it:
--   { verificationId, code, expiresAt, resendAt }  or  { error: 'phone_rate_limited', retryAfterSeconds }.
-- A send that fails afterwards still counts: the row is already there.
create function public.start_phone_verification(p_user_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.whatsapp_rules() -> 'verification';
  len int := (rules ->> 'codeLength')::int;
  day interval := interval '24 hours';
  wait int;
  new_id uuid := gen_random_uuid();
  code text;
  created timestamptz := now();
begin
  if p_user_id is null or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  -- One request at a time per user and per number, so two calls cannot both pass a limit.
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phone_verification:' || p_phone, 0));

  select greatest(
    public.phone_limit_wait(array(
      select v.created_at from public.phone_verifications v
      where v.user_id = p_user_id and v.created_at > now() - make_interval(secs => (rules ->> 'resendSeconds')::int)
      order by v.created_at desc
    ), 1, make_interval(secs => (rules ->> 'resendSeconds')::int)),
    public.phone_limit_wait(array(
      select v.created_at from public.phone_verifications v
      where v.user_id = p_user_id and v.created_at > now() - day
      order by v.created_at desc
    ), (rules ->> 'maxSendsPerUserPerDay')::int, day),
    public.phone_limit_wait(array(
      select v.created_at from public.phone_verifications v
      where v.phone_e164 = p_phone and v.created_at > now() - day
      order by v.created_at desc
    ), (rules ->> 'maxSendsPerPhonePerDay')::int, day)
  ) into wait;

  if wait is not null then
    return jsonb_build_object('error', 'phone_rate_limited', 'retryAfterSeconds', wait);
  end if;

  update public.phone_verifications
  set expires_at = now()
  where user_id = p_user_id and consumed_at is null and expires_at > now();

  -- 56 random bits modulo 10^len: the bias is below one in ten billion.
  code := lpad(
    ((('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint) % power(10::numeric, len)::bigint)::text,
    len, '0');

  insert into public.phone_verifications (id, user_id, phone_e164, code_hash, expires_at, created_at)
  values (
    new_id, p_user_id, p_phone,
    encode(extensions.digest(new_id::text || ':' || code, 'sha256'), 'hex'),
    created + make_interval(mins => (rules ->> 'codeTtlMinutes')::int),
    created
  );

  return jsonb_build_object(
    'verificationId', new_id,
    'code', code,
    'expiresAt', created + make_interval(mins => (rules ->> 'codeTtlMinutes')::int),
    'resendAt', created + make_interval(secs => (rules ->> 'resendSeconds')::int)
  );
end;
$$;

-- The user types the code. Every try counts, and a wrong one is an answer, not an exception: an exception
-- would roll back attempts + 1, and the code could be guessed without limit. After maxAttempts the code
-- is dead, right or wrong. A number other than the profile's replaces it and drops the opt-in, which was
-- for the old number. Answers phoneVerificationConfirmResultSchema.
create function public.confirm_phone_verification(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v public.phone_verifications;
  verified timestamptz := now();
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v from public.phone_verifications
  where user_id = uid and consumed_at is null and expires_at > now()
    and attempts < ((public.whatsapp_rules() -> 'verification') ->> 'maxAttempts')::int
  order by created_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('error', 'phone_code_expired');
  end if;

  update public.phone_verifications set attempts = attempts + 1 where id = v.id;

  if p_code is null
    or encode(extensions.digest(v.id::text || ':' || p_code, 'sha256'), 'hex') <> v.code_hash then
    return jsonb_build_object('error', 'phone_code_invalid');
  end if;

  update public.phone_verifications set consumed_at = verified where id = v.id;

  update public.profiles
  set phone_e164 = v.phone_e164,
    phone_verified_at = verified,
    whatsapp_opt_in_at = case when phone_e164 = v.phone_e164 then whatsapp_opt_in_at end,
    whatsapp_opt_in_version = case when phone_e164 = v.phone_e164 then whatsapp_opt_in_version end
  where id = uid;

  return jsonb_build_object('phoneE164', v.phone_e164, 'verifiedAt', verified);
end;
$$;

-- Forgets the phone, its verification and the consent, and kills a live code. The claim cancels what
-- was queued for WhatsApp.
create function public.remove_phone()
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
  set phone_e164 = null, phone_verified_at = null, whatsapp_opt_in_at = null, whatsapp_opt_in_version = null
  where id = uid;

  update public.phone_verifications
  set expires_at = now()
  where user_id = uid and consumed_at is null and expires_at > now();
end;
$$;

revoke execute on function public.phone_limit_wait(timestamptz[], int, interval) from public, anon, authenticated;
revoke execute on function public.start_phone_verification(uuid, text) from public, anon, authenticated;
revoke execute on function public.confirm_phone_verification(text) from public, anon;
revoke execute on function public.remove_phone() from public, anon;
grant execute on function public.start_phone_verification(uuid, text) to service_role;
grant execute on function public.confirm_phone_verification(text) to authenticated;
grant execute on function public.remove_phone() to authenticated;
