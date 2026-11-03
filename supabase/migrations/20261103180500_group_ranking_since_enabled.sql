-- ADR-0010, section 14, SEG6-4. The ranking answers only aligned weeks, the current one and the
-- maxWeeks - 1 before it, in the zone of whoever calls, and nothing from before the ranking was turned on
-- or before the caller joined.

-- When the effective ranking (the key or the type's default) last went from off to on. Written only by
-- the trigger below: outside the client's grants, and not in settings, which group.update writes.
alter table public.groups add column ranking_enabled_at timestamptz;

create function public.groups_set_ranking_enabled_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.group_ranking_enabled(new) then
    new.ranking_enabled_at := null;
  elsif tg_op = 'INSERT' or not public.group_ranking_enabled(old) then
    new.ranking_enabled_at := now();
  else
    new.ranking_enabled_at := coalesce(old.ranking_enabled_at, now());
  end if;
  return new;
end;
$$;

revoke execute on function public.groups_set_ranking_enabled_at() from public, anon, authenticated;

create trigger groups_set_ranking_enabled_at
  before insert or update on public.groups
  for each row execute function public.groups_set_ranking_enabled_at();

-- Groups already on lose only the ranking of the week in course.
update public.groups set ranking_enabled_at = now() where public.group_ranking_enabled(groups);

drop function public.group_ranking(uuid, date, text);

-- The week is [p_week_start, + 7 days) in the caller's zone, summed from
-- greatest(week start, ranking_enabled_at, caller's joined_at). An enabled group without the column (the
-- default of its type changed in app_settings) counts from now, never from the start of the week.
create function public.group_ranking(p_group_id uuid, p_week_start date)
returns table (user_id uuid, display_name text, xp int, rank int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ranking jsonb := public.gamification_rules() -> 'ranking';
  starts_on int := (ranking ->> 'weekStartsOn')::int;
  g public.groups;
  tz text;
  today date;
  current_week date;
  since timestamptz;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select public.profile_timezone(p.timezone) into tz from public.profiles p where p.id = auth.uid();
  today := (now() at time zone tz)::date;
  current_week := today - (extract(dow from today)::int - starts_on + 7) % 7;
  if p_week_start is null
    or extract(dow from p_week_start)::int <> starts_on
    or p_week_start > current_week
    or p_week_start < current_week - 7 * ((ranking ->> 'maxWeeks')::int - 1) then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  select * into g from public.groups where id = p_group_id;
  if not public.group_ranking_enabled(g) then
    raise exception 'ranking_disabled' using errcode = 'P0001';
  end if;

  select greatest(p_week_start::timestamp at time zone tz, coalesce(g.ranking_enabled_at, now()), m.joined_at)
  into since
  from public.group_members m where m.group_id = p_group_id and m.user_id = auth.uid();

  return query
  select x.uid, p.display_name, x.total, (rank() over (order by x.total desc))::int
  from (
    select e.user_id as uid, sum(e.amount)::int as total
    from public.xp_events e
    join public.group_members m on m.group_id = p_group_id and m.user_id = e.user_id
    where e.group_id = p_group_id
      and e.created_at >= since
      and e.created_at < (p_week_start + 7)::timestamp at time zone tz
    group by e.user_id
    having sum(e.amount) > 0
  ) x
  join public.profiles p on p.id = x.uid
  order by x.total desc, p.display_name, x.uid;
end;
$$;

revoke execute on function public.group_ranking(uuid, date) from public, anon;
grant execute on function public.group_ranking(uuid, date) to authenticated;
