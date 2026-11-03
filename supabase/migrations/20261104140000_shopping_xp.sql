-- ADR-0011, section 9 (F7-5). Completing a list gives XP to whoever completed it, as shopping_completed,
-- the reason ADR-0010 reserved. The event carries the list's group (null on a personal list), so a group
-- list counts for the group ranking like any group XP and a personal one never does.
--
-- Barriers against farming:
--   - fewer than shoppingRules.xp.minCheckedItems checked items: completes, no XP;
--   - at most shoppingRules.xp.maxRewardedPerDay rewarded lists per person per local day of the profile;
--   - once per list: the partial unique index below, beside the guard that refuses any update of a
--     completed list (no reopening, section 6);
--   - the daily cap of ADR-0010, section 2, which already lists shopping_completed among the capped
--     reasons (cappedXpEventReasons, occurrence_award_xp). The balance groups by
--     coalesce(occurrence_id, id): a shopping event is its own pair, always positive and never
--     compensated, so the zero floor drops nothing and the pair adds exactly its amount.
--
-- The trigger writes only xp_events (and, through it, user_stats), never a shopping table, so the
-- foreign key bypass of the shopping guards (SEG7-4) is not on its path.

alter table public.xp_events
  add column shopping_list_id uuid references public.shopping_lists (id) on delete set null;

-- Null again once the list is deleted: the event stays, as history (section 6).
alter table public.xp_events add constraint xp_events_shopping_list_check
  check ((shopping_list_id is null or reason = 'shopping_completed')
    and (reason <> 'shopping_completed' or occurrence_id is null));

create unique index xp_events_shopping_list_once_idx on public.xp_events (shopping_list_id)
  where reason = 'shopping_completed';

create function public.shopping_list_award_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.shopping_rules() -> 'xp';
  xp jsonb := public.gamification_rules() -> 'xp';
  cap int := (xp ->> 'dailyCap')::int;
  tz text;
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

  -- ponytail: local day of the profile, as ADR-0011 asks; switching zones can move the day and reward a
  -- few more lists, which the rolling cap below still bounds. A rolling 24 h window closes that if it matters.
  select public.profile_timezone(p.timezone) into tz from public.profiles p where p.id = new.completed_by;
  if (
    select count(*) from public.xp_events e
    where e.user_id = new.completed_by
      and e.reason = 'shopping_completed'
      and e.created_at >= (now() at time zone tz)::date::timestamp at time zone tz
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

revoke execute on function public.shopping_list_award_xp() from public, anon, authenticated;

create trigger shopping_lists_award_xp
  after update of status on public.shopping_lists
  for each row
  when (old.status = 'open' and new.status = 'completed')
  execute function public.shopping_list_award_xp();
