-- The barrier of ADR-0007, section 8. Green on a task with photo proof needs a current proof, for any
-- writer: RPC, trigger, job or service role. A direct insert is closed as well, because the status
-- trigger only looks at updates.

-- 1. A new occurrence of a task with photo proof is born pending. Pending is also the only state the
-- Edge Function and edit_task ever insert; the clean way to resolve a row is an update, which the
-- trigger below checks. The two proof columns are born null: no proof exists for a row that does not.
create function public.occurrences_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending'
    and exists (select 1 from public.tasks t where t.id = new.task_id and t.requires_photo_proof) then
    raise exception 'proof_required' using errcode = 'P0001';
  end if;
  new.current_proof_id := null;
  new.proof_review_status := null;
  return new;
end;
$$;

revoke execute on function public.occurrences_before_insert() from public, anon, authenticated;

create trigger task_occurrences_before_insert
  before insert on public.task_occurrences
  for each row execute function public.occurrences_before_insert();

-- 2. XP, as the trigger of the status did it before: revert the balance of the occurrence where it was
-- earned, then grant the value of the state it is in. The review calls it too when it approves a proof
-- that was waiting, so there is one account of XP and not two. A bonus for the photo (Phase 6) goes
-- here, as one more event with the same occurrence_id.
create function public.occurrence_award_xp(p_occ public.task_occurrences)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  rules jsonb;
  base int := 0;
  earned int;
  group_for_xp uuid;
begin
  select * into t from public.tasks where id = p_occ.task_id;
  rules := public.task_rules();
  group_for_xp := case when t.visibility = 'private' then null else t.group_id end;

  -- Each balance is reverted where it was earned, per user and per group. Using the task's group at
  -- reopen time instead let someone complete a group task, make it private, reopen it, and make it a
  -- group task again, leaving a surplus in the group's ranking every turn.
  insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
  select e.user_id, e.group_id, e.occurrence_id, -sum(e.amount), 'occurrence_reverted'
  from public.xp_events e
  where e.occurrence_id = p_occ.id
  group by e.user_id, e.group_id, e.occurrence_id
  having sum(e.amount) <> 0;

  if p_occ.status = 'done' then
    base := (rules -> 'xp' -> 'status' ->> (case when p_occ.late then 'done_late' else 'done' end))::int;
  elsif p_occ.status = 'partial' then
    base := (rules -> 'xp' -> 'status' ->> 'partial')::int;
  end if;

  earned := base * (rules -> 'xp' -> 'difficultyWeight' ->> t.difficulty::text)::int;
  if earned > 0 then
    insert into public.xp_events (user_id, group_id, occurrence_id, amount, reason)
    values (
      p_occ.assignee_id, group_for_xp, p_occ.id, earned,
      case
        when p_occ.status = 'partial' then 'occurrence_partial'
        when p_occ.late then 'occurrence_done_late'
        else 'occurrence_done'
      end
    );
  end if;
end;
$$;

revoke execute on function public.occurrence_award_xp(public.task_occurrences) from public, anon, authenticated;

-- 3. Valid for every path, service role included. Who may make the change is the RPC's job.
-- The reason belongs to one transition, so reopening clears it; direct updates pass it themselves.
create or replace function public.occurrences_before_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tasks;
  received timestamptz;
  counted_at timestamptz := now();
begin
  if new.status = old.status then
    return new;
  end if;

  if not exists (
    select 1 from public.occurrence_transitions
    where from_status = old.status and to_status = new.status
  ) then
    raise exception 'invalid_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;

  select * into t from public.tasks where id = new.task_id;

  -- The reviewer's pairs only exist as a decision on a proof: contesting, and undoing the contest.
  -- Any other writer reaching them does not get through, whatever the table of transitions says.
  if old.status = 'done' and new.status in ('partial', 'missed')
    and new.proof_review_status is distinct from 'disputed' then
    raise exception 'invalid_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;
  if old.status = 'partial' and new.status = 'done'
    and new.proof_review_status is distinct from 'approved' then
    raise exception 'invalid_transition' using errcode = '23514',
      detail = format('%s -> %s', old.status, new.status);
  end if;

  -- Green on a task with photo proof needs the proof of this occurrence, the current one, and not
  -- contested. The foreign key already ties current_proof_id to the occurrence.
  if new.status = 'done' and t.requires_photo_proof and (
    new.proof_review_status is null
    or new.proof_review_status = 'disputed'
    or not exists (
      select 1 from public.task_proofs p
      where p.id = new.current_proof_id and p.occurrence_id = new.id and p.superseded_at is null
    )
  ) then
    raise exception 'proof_required' using errcode = 'P0001';
  end if;

  -- The clock decides, not the previous status, so it does not depend on the missed job. A proof
  -- counts from the moment the server received it, and not from when the commit finished.
  if new.status = 'done' and new.current_proof_id is not null then
    select p.received_at into received from public.task_proofs p
    where p.id = new.current_proof_id and p.occurrence_id = new.id;
    counted_at := coalesce(received, counted_at);
  end if;
  new.late := new.status in ('done', 'partial') and counted_at > new.overdue_at;

  -- A dispute is a review, not a delay: it keeps the lateness the proof had, instead of reading the
  -- clock of a review done a week later.
  if old.status = 'done' and new.status in ('partial', 'missed') then
    new.late := new.status = 'partial' and old.late;
  end if;

  if new.status = 'pending' then
    new.status_reason := null;
    new.current_proof_id := null;
    new.proof_review_status := null;
  end if;
  new.status_changed_at := now();
  new.status_changed_by := auth.uid();
  return new;
end;
$$;

-- Writes history and XP. Leaving done or partial adds a compensating event for the whole balance of
-- the occurrence, so a complete-and-reopen cycle sums to zero and events are never edited.
create or replace function public.occurrences_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  insert into public.task_status_history
    (occurrence_id, from_status, to_status, changed_by, reason, proof_review_status)
  values (new.id, old.status, new.status, new.status_changed_by, new.status_reason, new.proof_review_status);

  -- Reopening discards the photo as evidence. It stays until retention, and the next green needs a
  -- new challenge and a new photo.
  if new.status = 'pending' then
    update public.task_proofs set superseded_at = now()
    where occurrence_id = new.id and superseded_at is null;
  end if;

  -- A proof waiting for an admin grants nothing yet: review_proof does it when approving, and the
  -- retention job does it when the time runs out.
  if not (new.status = 'done' and new.proof_review_status is not distinct from 'in_review') then
    perform public.occurrence_award_xp(new);
  end if;

  return new;
end;
$$;
