-- SEG5-5 (ADR-0009, section 18). Two bounds on the bill: a code goes only to a number of an allowed
-- country, and every code of every user in a rolling day counts against maxSendsPerDay, rows of deleted
-- accounts included. The mirror gains both values of packages/config.
update public.app_settings
set value = jsonb_set(value, '{verification}',
  (value -> 'verification') || '{"maxSendsPerDay": 200, "allowedCountryCodes": ["55"]}')
where key = 'whatsapp_rules';

-- As before, plus the country check, which writes nothing and so counts in no limit, and the global
-- cap. The global lock replaces the per-number one, so two calls cannot both pass any limit.
-- ponytail: one lock for every verification; fine at maxSendsPerDay, per-number locks if it grows.
create or replace function public.start_phone_verification(p_user_id uuid, p_phone text)
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

  -- E.164 country codes are not prefixes of one another, so the start of the number is enough.
  if not exists (
    select 1 from jsonb_array_elements_text(rules -> 'allowedCountryCodes') c where starts_with(p_phone, '+' || c)
  ) then
    return jsonb_build_object('error', 'phone_country_not_allowed');
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phone_verification', 0));

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
    ), (rules ->> 'maxSendsPerPhonePerDay')::int, day),
    public.phone_limit_wait(array(
      select v.created_at from public.phone_verifications v
      where v.created_at > now() - day
      order by v.created_at desc
      limit (rules ->> 'maxSendsPerDay')::int
    ), (rules ->> 'maxSendsPerDay')::int, day)
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
