-- ADR-0008, section 14. Two mirrors in one migration, with the values already in packages/config:
-- notification_rules is new (notificationRules), and task_rules gains autoMissJob (taskRules).
-- `pnpm db:check-permissions` compares both.
update public.app_settings
set value = value || '{"autoMissJob": {"batchSize": 500, "reopenGraceMinutes": 60}}'
where key = 'task_rules';

insert into public.app_settings (key, value) values
  ('notification_rules', '{
    "activeChannels": ["web_push"],
    "defaultChannels": {
      "task_reminder": {"web_push": true, "whatsapp": false},
      "occurrence_missed": {"web_push": false, "whatsapp": false},
      "occurrence_resolved": {"web_push": false, "whatsapp": false},
      "proof_in_review": {"web_push": true, "whatsapp": false},
      "proof_disputed": {"web_push": true, "whatsapp": false}
    },
    "defaultQuietHours": {"start": "22:00", "end": "07:00"},
    "reminderCatchUpMinutes": 60,
    "maxPushSubscriptionsPerUser": 10,
    "pushEndpointHosts": [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
      "notify.windows.com"
    ],
    "inboxRetentionDays": 30
  }');

-- Used by triggers and RPCs only. A missing row would silently turn notifications off, so it fails loudly.
create function public.notification_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'notification_rules';
  if rules is null then
    raise exception 'notification_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.notification_rules() from public, anon, authenticated;
