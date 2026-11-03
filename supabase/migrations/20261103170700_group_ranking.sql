-- ADR-0010, section 6. The weekly ranking of one group, on or off per group in settings.rankingEnabled,
-- which whoever has group.update already edits. Absent, the default of the type decides; an unknown type
-- is off. Only current members, only positive XP of group tasks of that group (private tasks and the
-- perfect day carry a null group_id), and nothing else about a member.
alter table public.groups add constraint groups_settings_ranking_enabled_check
  check (not settings ? 'rankingEnabled' or jsonb_typeof(settings -> 'rankingEnabled') = 'boolean');

create function public.group_ranking_enabled(p_group public.groups)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (p_group.settings ->> 'rankingEnabled')::boolean,
    (public.gamification_rules() -> 'ranking' -> 'defaultEnabledByGroupType' ->> p_group.type)::boolean,
    false
  );
$$;

-- The week is [p_week_start, + 7 days) in p_timezone, as team_overview reads its days. An unknown zone
-- fails with Postgres' own 22023.
create function public.group_ranking(p_group_id uuid, p_week_start date, p_timezone text)
returns table (user_id uuid, display_name text, xp int, rank int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_week_start is null or p_timezone is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  select * into g from public.groups where id = p_group_id;
  if not public.group_ranking_enabled(g) then
    raise exception 'ranking_disabled' using errcode = 'P0001';
  end if;

  return query
  select x.uid, p.display_name, x.total, (rank() over (order by x.total desc))::int
  from (
    select e.user_id as uid, sum(e.amount)::int as total
    from public.xp_events e
    join public.group_members m on m.group_id = p_group_id and m.user_id = e.user_id
    where e.group_id = p_group_id
      and e.created_at >= p_week_start::timestamp at time zone p_timezone
      and e.created_at < (p_week_start + 7)::timestamp at time zone p_timezone
    group by e.user_id
    having sum(e.amount) > 0
  ) x
  join public.profiles p on p.id = x.uid
  order by x.total desc, p.display_name, x.uid;
end;
$$;

revoke execute on function public.group_ranking_enabled(public.groups) from public, anon, authenticated;
revoke execute on function public.group_ranking(uuid, date, text) from public, anon;
grant execute on function public.group_ranking(uuid, date, text) to authenticated;
