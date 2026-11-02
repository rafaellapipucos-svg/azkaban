-- ADR-0008, section 4. Reminders are not written ahead of time: every minute this scan looks for the
-- leads of tasks.reminders whose moment (anchor minus lead) fell in (now - reminderCatchUpMinutes, now],
-- and writes them as any other notice. It reads the state of the moment, so editing, rescheduling,
-- cancelling or completing needs no cleanup, a cron that missed up to an hour loses nothing, and the
-- key keeps a reminder from being written twice. The anchor is the due moment of a deadline and the
-- start of the others.
--
-- Range of the scan: the anchor is never after auto_miss_at (tolerance >= 0), so the lower bound reads
-- the index of pending occurrences by auto_miss_at. That is every open pending row, up to the
-- materialization window ahead (60 days). The upper bound, a start at most 30 days ahead, is the
-- largest lead (43,200 minutes). ponytail: fine for today's volume; if it weighs, a partial index on
-- the anchor, or a lower cap on the lead, narrows it.
create function public.enqueue_due_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  catch_up interval := make_interval(
    mins => (public.notification_rules() ->> 'reminderCatchUpMinutes')::int
  );
  r record;
  written int := 0;
begin
  for r in
    select o.id, o.assignee_id, t.group_id, a.anchor, l.lead, a.anchor - make_interval(mins => l.lead) as due,
      o.id || ':' || extract(epoch from a.anchor)::bigint || ':' || l.lead as event
    from public.task_occurrences o
    join public.tasks t on t.id = o.task_id
    cross join lateral (
      select case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end as anchor
    ) a
    cross join lateral (
      select x::numeric::int as lead from jsonb_array_elements_text(t.reminders) x
    ) l
    where o.status = 'pending'
      and o.auto_miss_at > now() - catch_up
      and o.scheduled_start <= now() + interval '30 days'
      and t.archived_at is null
      and a.anchor - make_interval(mins => l.lead) > now() - catch_up
      and a.anchor - make_interval(mins => l.lead) <= now()
      and (
        t.group_id is null
        or exists (
          select 1 from public.group_members m where m.group_id = t.group_id and m.user_id = o.assignee_id
        )
      )
  loop
    -- Cheap skip of what an earlier minute wrote; the unique key is what guarantees it.
    if not exists (
      select 1 from public.notifications n
      where n.user_id = r.assignee_id and n.dedupe_key = 'task_reminder:' || r.event
    ) and public.enqueue_notification(
      r.assignee_id, 'task_reminder', r.id, r.group_id,
      jsonb_build_object('leadMinutes', r.lead, 'anchorAt', r.anchor),
      r.event,
      r.due
    ) is not null then
      written := written + 1;
    end if;
  end loop;

  return written;
end;
$$;

revoke execute on function public.enqueue_due_reminders() from public, anon, authenticated;

select cron.schedule('enqueue-due-reminders', '* * * * *', 'select public.enqueue_due_reminders()');
