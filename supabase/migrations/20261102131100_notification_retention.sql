-- ADR-0008, section 3. The bell keeps notificationRules.inboxRetentionDays; older rows go, and their
-- outbox rows with them, by cascade. Daily, in SQL: nothing to call outside the database.
-- ponytail: one delete per day; batches if a day's rows ever make it slow.
create function public.delete_expired_notifications()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted int;
begin
  delete from public.notifications
  where created_at < now() - make_interval(
    days => (public.notification_rules() ->> 'inboxRetentionDays')::int
  );
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke execute on function public.delete_expired_notifications() from public, anon, authenticated;

-- 04:30 UTC, 01:30 in Brasilia.
select cron.schedule(
  'delete-expired-notifications',
  '30 4 * * *',
  'select public.delete_expired_notifications()'
);
