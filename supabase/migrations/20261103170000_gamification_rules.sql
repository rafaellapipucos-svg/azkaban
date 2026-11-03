-- ADR-0010. Mirror of gamificationRules in packages/config/src/gamification.ts; `pnpm db:check-permissions`
-- compares both. The curve of levels has no mirror: no SQL reads the level.
insert into public.app_settings (key, value) values
  ('gamification_rules', '{
    "xp": {"proofBonus": 5, "perfectDayBonus": 20, "dailyCap": 300},
    "goal": {"percent": 80, "countPartial": true},
    "streak": {"emptyDayKeepsStreak": true, "freezeEveryDays": 7, "maxFreezes": 2},
    "ranking": {"defaultEnabledByGroupType": {"family": true, "company": false, "other": false}},
    "closeJob": {"batchSize": 200, "maxCatchUpDays": 30}
  }');

-- Used by triggers and RPCs only. A missing row would silently lift the cap, so it fails loudly.
create function public.gamification_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'gamification_rules';
  if rules is null then
    raise exception 'gamification_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.gamification_rules() from public, anon, authenticated;
