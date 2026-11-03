-- ADR-0008, sections 2 and 4: the notices of a status change or a proof decision, for any writer (RPC,
-- commit_proof, review_proof, the job, the service role). The trigger sits on task_status_history and
-- not on task_occurrences: every status change writes one line there, from the trigger of the status,
-- and the id of that line is the key of the event. From task_occurrences the line of a given transition
-- cannot be told apart from an equal one earlier in the same transaction (done, pending, done).
-- Every notice of section 2 except the reminder comes with a status change: entering review is
-- commit_proof's pending or missed to done, and a dispute leaves done. Approving changes no status,
-- writes from_status = to_status and tells nobody. The actor is changed_by, null for a job.
create function public.notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := new.changed_by;
  occ public.task_occurrences;
  t public.tasks;
  author uuid;
  reviewer uuid;
begin
  if new.from_status = new.to_status then
    return new;
  end if;

  select * into occ from public.task_occurrences where id = new.occurrence_id;
  select * into t from public.tasks where id = occ.task_id;
  select p.user_id into author from public.task_proofs p where p.id = occ.current_proof_id;

  -- A dispute, to the author of the photo. Its red or yellow is told by this notice alone, and it is a
  -- review, not a resolution.
  if new.from_status = 'done' and new.proof_review_status = 'disputed' then
    if author is distinct from actor then
      perform public.enqueue_notification(
        author, 'proof_disputed', occ.id, t.group_id,
        jsonb_build_object('proofId', occ.current_proof_id, 'toStatus', new.to_status),
        new.id::text
      );
    end if;
    return new;
  end if;

  -- A photo waiting for review, to whoever may review it, except the author. The review notice stands
  -- for the resolution while it waits.
  if new.to_status = 'done' and new.proof_review_status = 'in_review' then
    for reviewer in
      select m.user_id
      from public.group_members m
      join public.role_permissions rp on rp.role = m.role and rp.permission_key = 'proof.review'
      where m.group_id = t.group_id
        and m.user_id is distinct from author
        and m.user_id is distinct from actor
    loop
      perform public.enqueue_notification(
        reviewer, 'proof_in_review', occ.id, t.group_id,
        jsonb_build_object('proofId', occ.current_proof_id, 'groupId', t.group_id),
        occ.current_proof_id::text
      );
    end loop;
    return new;
  end if;

  -- Undoing a dispute is an approval: nobody is told.
  if new.proof_review_status = 'approved' then
    return new;
  end if;

  if new.to_status = 'missed' and occ.assignee_id is distinct from actor then
    perform public.enqueue_notification(
      occ.assignee_id, 'occurrence_missed', occ.id, t.group_id,
      jsonb_build_object('byUserId', actor),
      new.id::text
    );
  end if;

  -- To the creator, only for a change made by someone else. A creator who is also the assignee already
  -- got the red above.
  if actor is not null
    and t.created_by is not null
    and t.created_by <> actor
    and new.from_status in ('pending', 'missed')
    and new.to_status in ('done', 'partial', 'missed')
    and not (new.to_status = 'missed' and t.created_by = occ.assignee_id) then
    perform public.enqueue_notification(
      t.created_by, 'occurrence_resolved', occ.id, t.group_id,
      jsonb_build_object('status', new.to_status, 'byUserId', actor),
      new.id::text
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.notify_status_change() from public, anon, authenticated;

create trigger task_status_history_notify
  after insert on public.task_status_history
  for each row execute function public.notify_status_change();
