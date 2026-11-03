-- ADR-0012, section 4. Fixed window per user and action, from app_settings.rate_limit_rules. Over the
-- limit it raises rate_limited with errcode PT429 (PostgREST answers 429) and the seconds left in the
-- window as the hint. The exception undoes this call's + 1, so the counter stops at the limit and
-- only counts what went through. A null user (service role, jobs, seeds) does not count. An unknown
-- action is a programming error and fails even then.
-- ponytail: a fixed window lets up to twice the limit through around the turn; a sliding window
-- costs a row per hit.
create function public.consume_rate_limit(p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule jsonb;
  w int;
  start timestamptz;
  n int;
begin
  select value -> 'actions' -> p_action into rule
  from public.app_settings where key = 'rate_limit_rules';
  if rule is null then
    raise exception 'rate_limit_action_unknown' using errcode = '22023', detail = p_action;
  end if;
  if p_user is null then
    return;
  end if;

  w := (rule ->> 'windowSeconds')::int;
  start := to_timestamp(floor(extract(epoch from now()) / w) * w);

  insert into public.rate_limit_counters as c (user_id, action, window_start, hits)
  values (p_user, p_action, start, 1)
  on conflict (user_id, action, window_start) do update set hits = c.hits + 1
  returning c.hits into n;

  if n > (rule ->> 'limit')::int then
    raise exception 'rate_limited' using errcode = 'PT429',
      hint = ceil(extract(epoch from start + make_interval(secs => w) - now()))::int::text;
  end if;
end;
$$;

-- A client that could call it would spend someone else's limit.
revoke execute on function public.consume_rate_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text) to service_role;

-- For the before insert triggers: the action is the trigger argument, the user is the caller.
create function public.consume_rate_limit_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit(auth.uid(), tg_argv[0]);
  return new;
end;
$$;

revoke execute on function public.consume_rate_limit_on_insert() from public, anon, authenticated;
