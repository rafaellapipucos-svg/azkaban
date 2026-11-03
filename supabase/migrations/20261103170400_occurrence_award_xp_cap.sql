-- ADR-0010, sections 1 and 2. As before (20261101171400), plus:
--   - proof_bonus: gamificationRules.xp.proofBonus, flat, on done with a current proof that counts
--     (unreviewed or approved). in_review never reaches here: the status trigger skips it, and the review
--     and the retention call this after approving;
--   - the daily cap: after the compensation, under a lock per user, the room is
--     least(cap, greatest(0, cap - balance)), the balance being the capped reasons written today in the
--     profile's day, each occurrence counted at no less than zero (see below). The base takes what fits,
--     the bonus what is left. Zero writes nothing. capRoom in core sums without the floor per occurrence;
--     see the handoff to gamificacao of 2026-11-03.
create or replace function public.occurrence_award_xp(p_occ public.task_occurrences)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  rules jsonb;
  xp jsonb := public.gamification_rules() -> 'xp';
  cap int := (xp ->> 'dailyCap')::int;
  base int := 0;
  earned int;
  bonus int := 0;
  balance int;
  room int;
  tz text;
  group_for_xp uuid;
begin
  select * into t from public.tasks where id = p_occ.task_id;
  rules := public.task_rules();
  group_for_xp := case when t.visibility = 'private' then null else t.group_id end;

  -- Each balance is reverted where it was earned, per user and per group.
  insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
  select e.user_id, e.group_id, e.occurrence_id, -sum(e.amount), 'occurrence_reverted'
  from public.xp_events e
  where e.occurrence_id = p_occ.id
  group by e.user_id, e.group_id, e.occurrence_id
  having sum(e.amount) <> 0;

  if p_occ.status = 'done' then
    base := (rules -> 'xp' -> 'status' ->> (case when p_occ.late then 'done_late' else 'done' end))::int;
    if p_occ.current_proof_id is not null and p_occ.proof_review_status in ('unreviewed', 'approved') then
      bonus := (xp ->> 'proofBonus')::int;
    end if;
  elsif p_occ.status = 'partial' then
    base := (rules -> 'xp' -> 'status' ->> 'partial')::int;
  end if;
  earned := base * (rules -> 'xp' -> 'difficultyWeight' ->> t.difficulty::text)::int;

  if earned + bonus <= 0 then
    return;
  end if;

  -- Two transitions of the same user at once would both read the same balance and pass the cap together.
  perform pg_advisory_xact_lock(hashtextextended('xp_cap:' || p_occ.assignee_id::text, 0));

  -- The balance of today counts each occurrence at no less than zero. A plain sum let a compensation of
  -- another day's XP be credit across many transitions: with yesterday's 300 reopened today the sum starts
  -- at -300, and each award, though never above the cap alone, adds up to 600 by the end of the day.
  -- Undoing XP earned today still frees room, because its occurrence nets zero.
  select public.profile_timezone(p.timezone) into tz from public.profiles p where p.id = p_occ.assignee_id;
  select coalesce(sum(greatest(0, x.net)), 0) into balance
  from (
    select sum(e.amount) as net
    from public.xp_events e
    where e.user_id = p_occ.assignee_id
      and e.created_at >= ((now() at time zone tz)::date)::timestamp at time zone tz
      and e.reason in ('occurrence_done', 'occurrence_done_late', 'occurrence_partial', 'occurrence_reverted',
        'proof_bonus', 'shopping_completed')
    group by coalesce(e.occurrence_id, e.id)
  ) x;

  room := least(cap, greatest(0, cap - balance));
  earned := least(earned, room);
  bonus := least(bonus, room - earned);

  if earned > 0 then
    insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
    values (
      p_occ.assignee_id, group_for_xp, p_occ.id, earned,
      case
        when p_occ.status = 'partial' then 'occurrence_partial'
        when p_occ.late then 'occurrence_done_late'
        else 'occurrence_done'
      end
    );
  end if;
  if bonus > 0 then
    insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
    values (p_occ.assignee_id, group_for_xp, p_occ.id, bonus, 'proof_bonus');
  end if;
end;
$$;
