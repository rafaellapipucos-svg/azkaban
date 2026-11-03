-- ADR-0009, sections 3, 8 and 11. The daily job also deletes the codes past
-- whatsappRules.verification.retentionHours, the delivery lines past messageRetentionDays and the
-- console outbox past consoleRetentionDays. Returns, as before, the bell rows deleted.
-- ponytail: one delete per table per day, as the bell's; batches if it ever gets slow.
create or replace function public.delete_expired_notifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.notification_rules();
  wa jsonb := public.whatsapp_rules();
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

  return deleted;
end;
$$;
