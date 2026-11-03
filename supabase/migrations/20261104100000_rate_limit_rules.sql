-- ADR-0012, section 4. Mirror of rateLimitRules in packages/config/src/limits.ts;
-- `pnpm db:check-permissions` compares both.
insert into public.app_settings (key, value) values
  ('rate_limit_rules', '{
    "actions": {
      "task_create": {"limit": 200, "windowSeconds": 3600},
      "occurrence_status": {"limit": 600, "windowSeconds": 3600},
      "shopping_list_create": {"limit": 30, "windowSeconds": 3600},
      "invite_create": {"limit": 30, "windowSeconds": 86400},
      "invite_lookup": {"limit": 30, "windowSeconds": 3600},
      "data_export": {"limit": 3, "windowSeconds": 86400}
    },
    "counterRetentionHours": 48,
    "idempotencyRetentionHours": 48
  }');
