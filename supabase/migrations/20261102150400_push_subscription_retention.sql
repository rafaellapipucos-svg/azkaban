-- ADR-0008, section 17, SEG4-5. A browser the push service never refuses kept its row, with its user
-- agent, forever. The daily job now also deletes subscriptions with no delivery (or, never delivered,
-- no creation) within notificationRules.pushSubscriptionRetentionDays. The app registers again the next
-- time it opens with permission. Returns, as before, the bell rows deleted.
-- ponytail: one delete per day, as the bell's; batches if it ever gets slow.
create or replace function public.delete_expired_notifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.notification_rules();
  deleted int;
begin
  delete from public.notifications
  where created_at < now() - make_interval(days => (rules ->> 'inboxRetentionDays')::int);
  get diagnostics deleted = row_count;

  delete from public.push_subscriptions
  where coalesce(last_success_at, created_at)
    < now() - make_interval(days => (rules ->> 'pushSubscriptionRetentionDays')::int);

  return deleted;
end;
$$;
