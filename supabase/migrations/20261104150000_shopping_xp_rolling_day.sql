-- SEG8-1. maxRewardedPerDay counted from the local midnight of the profile's current zone, and the user
-- can change that zone: switching to one whose midnight just passed reset the count, two more lists an
-- hour. It now counts the rewarded lists of the last 24 hours, as the daily cap does (SEG6-1). The rest
-- is 20261104140000_shopping_xp as it was.
create or replace function public.shopping_list_award_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.shopping_rules() -> 'xp';
  xp jsonb := public.gamification_rules() -> 'xp';
  cap int := (xp ->> 'dailyCap')::int;
  balance int;
  award int;
begin
  -- A completion outside the RPC (service role) has nobody to reward.
  if new.completed_by is null then
    return null;
  end if;

  if (select count(*) from public.shopping_list_items i where i.list_id = new.id and i.checked_at is not null)
    < (rules ->> 'minCheckedItems')::int
  then
    return null;
  end if;

  -- The same lock as occurrence_award_xp: two completions, or a completion and a task, of one person at
  -- once would both read the same count and the same balance.
  perform pg_advisory_xact_lock(hashtextextended('xp_cap:' || new.completed_by::text, 0));

  -- The last 24 hours, not the local day: the profile's zone is the user's to change (SEG8-1).
  if (
    select count(*) from public.xp_events e
    where e.user_id = new.completed_by
      and e.reason = 'shopping_completed'
      and e.created_at >= now() - interval '24 hours'
  ) >= (rules ->> 'maxRewardedPerDay')::int then
    return null;
  end if;

  -- The balance of the cap, exactly as in occurrence_award_xp (20261103180200).
  select coalesce(sum(greatest(0, x.net)), 0) into balance
  from (
    select sum(e.amount) as net
    from public.xp_events e
    where e.user_id = new.completed_by
      and e.created_at >= now() - make_interval(hours => (xp ->> 'capWindowHours')::int)
      and e.reason in ('occurrence_done', 'occurrence_done_late', 'occurrence_partial', 'occurrence_reverted',
        'proof_bonus', 'shopping_completed')
    group by coalesce(e.occurrence_id, e.id), e.group_id
  ) x;

  award := least((rules ->> 'amount')::int, greatest(0, cap - balance));
  if award > 0 then
    insert into public.xp_events (user_id, group_id, shopping_list_id, amount, reason)
    values (new.completed_by, new.group_id, new.id, award, 'shopping_completed');
  end if;

  return null;
end;
$$;
