-- ADR-0008, section 17. Mirror of notificationRules.renotifyCooldown (SEG4-1) and
-- pushSubscriptionRetentionDays (SEG4-5), with the values already in packages/config.
-- `pnpm db:check-permissions` compares them.
update public.app_settings
set value = value || '{
  "renotifyCooldown": {
    "minutes": 10,
    "types": ["occurrence_missed", "occurrence_resolved", "proof_disputed"]
  },
  "pushSubscriptionRetentionDays": 90
}'::jsonb
where key = 'notification_rules';
