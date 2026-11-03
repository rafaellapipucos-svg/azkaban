-- ADR-0010, section 14. The keys the security review added to gamificationRules
-- (packages/config/src/gamification.ts), mirrored here; values already tuned stay as they are.
update public.app_settings
set value = jsonb_set(jsonb_set(jsonb_set(value || '{"historyDays": 400}',
  '{xp,capWindowHours}', '24'),
  '{ranking,weekStartsOn}', '1'),
  '{ranking,maxWeeks}', '2')
where key = 'gamification_rules';
