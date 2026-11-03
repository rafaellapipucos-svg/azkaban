-- ADR-0009, sections 2 and 12. Two mirrors with the values already in packages/config: whatsapp_rules is
-- new (whatsappRules), and notification_rules gains whatsapp in activeChannels, whatsappTypes and the
-- default of daily_summary (notificationRules). `pnpm db:check-permissions` compares both.
insert into public.app_settings (key, value) values
  ('whatsapp_rules', '{
    "consentVersion": 1,
    "verification": {
      "codeLength": 6,
      "codeTtlMinutes": 10,
      "maxAttempts": 5,
      "resendSeconds": 60,
      "maxSendsPerUserPerDay": 5,
      "maxSendsPerPhonePerDay": 5,
      "retentionHours": 48
    },
    "dailySummary": {
      "defaultTime": "08:00",
      "defaultDeadlineDays": 7,
      "maxDeadlineDays": 30,
      "catchUpMinutes": 120,
      "batchSize": 500,
      "maxItems": {"today": 30, "overdue": 10, "deadlines": 10}
    },
    "messageRetentionDays": 30,
    "consoleRetentionDays": 1
  }');

update public.app_settings
set value = jsonb_set(value, '{defaultChannels,daily_summary}', '{"web_push": false, "whatsapp": true}')
  || '{"activeChannels": ["web_push", "whatsapp"], "whatsappTypes": ["daily_summary"]}'::jsonb
where key = 'notification_rules';

-- Used by triggers and RPCs only. A missing row would silently lift the limits, so it fails loudly.
create function public.whatsapp_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'whatsapp_rules';
  if rules is null then
    raise exception 'whatsapp_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.whatsapp_rules() from public, anon, authenticated;
