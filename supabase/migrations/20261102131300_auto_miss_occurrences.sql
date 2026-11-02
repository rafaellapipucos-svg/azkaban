-- ADR-0008, section 10 (F4-6): red by default. A pending occurrence whose auto_miss_at passed becomes
-- missed, with no user: the triggers do the rest, the system transition pending -> missed, the history
-- with a null author, zero XP and the occurrence_missed notice to the assignee. auto_miss_at, and not
-- overdue_at, so a rescheduled occurrence does not turn red by its old schedule (ADR-0005, section 11);
-- the database already computed it in the task's zone, so there is no zone arithmetic here.
-- Left out: an archived task; a group task whose assignee is no longer a member (ADR-0005, section 9);
-- a status changed in the last taskRules.autoMissJob.reopenGraceMinutes, so whoever reopened can
-- reschedule first. in_review is done, and the filter is pending, so a proof waiting is never touched and
-- running twice changes nothing. Lateness and the 72 h window come from overdue_at and do not move.
-- Only cron and the service role run it, and neither has a user, so the actor is system.
create function public.auto_miss_occurrences()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  job jsonb := public.task_rules() -> 'autoMissJob';
  marked int;
begin
  with batch as (
    select o.id
    from public.task_occurrences o
    join public.tasks t on t.id = o.task_id
    where o.status = 'pending'
      and o.auto_miss_at <= now()
      and t.archived_at is null
      and (
        t.group_id is null
        or exists (
          select 1 from public.group_members m where m.group_id = t.group_id and m.user_id = o.assignee_id
        )
      )
      and (
        o.status_changed_at is null
        or o.status_changed_at <= now() - make_interval(mins => (job ->> 'reopenGraceMinutes')::int)
      )
    order by o.auto_miss_at
    limit (job ->> 'batchSize')::int
    for update of o skip locked
  )
  update public.task_occurrences o
  set status = 'missed'
  from batch
  where o.id = batch.id;

  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke execute on function public.auto_miss_occurrences() from public, anon, authenticated;

select cron.schedule('auto-miss-occurrences', '*/5 * * * *', 'select public.auto_miss_occurrences()');
