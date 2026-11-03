-- ADR-0012, sections 5 and 8. The daily job also deletes the request ids past
-- rateLimitRules.idempotencyRetentionHours, longer than the offline queue keeps a change. The rest is
-- 20261104100800_rate_limit_retention as it was.
create or replace function public.delete_expired_notifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.notification_rules();
  wa jsonb := public.whatsapp_rules();
  limits jsonb := (select value from public.app_settings where key = 'rate_limit_rules');
  deleted int;
begin
  delete from public.notifications
  where created_at < now() - make_interval(days => (rules ->> 'inboxRetentionDays')::int);
  get diagnostics deleted = row_count;

  delete from public.push_subscriptions
  where coalesce(last_success_at, created_at)
    < now() - make_interval(days => (rules ->> 'pushSubscriptionRetentionDays')::int);

  delete from public.phone_verifications
  where created_at < now() - make_interval(hours => (wa -> 'verification' ->> 'retentionHours')::int);

  delete from public.whatsapp_messages
  where created_at < now() - make_interval(days => (wa ->> 'messageRetentionDays')::int);

  delete from public.whatsapp_console_messages
  where created_at < now() - make_interval(days => (wa ->> 'consoleRetentionDays')::int);

  delete from public.rate_limit_counters
  where window_start < now() - make_interval(hours => (limits ->> 'counterRetentionHours')::int);

  delete from public.processed_requests
  where created_at < now() - make_interval(hours => (limits ->> 'idempotencyRetentionHours')::int);

  return deleted;
end;
$$;
