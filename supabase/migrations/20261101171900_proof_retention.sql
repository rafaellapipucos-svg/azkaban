-- ADR-0007, section 14. What the proof-retention Edge Function (service role) calls every hour. The
-- function removes the objects through the Storage API, never by SQL, and then marks the rows; running
-- it again is safe at every step. The photo goes after proofRules.retentionDays, the record stays.

-- The oldest proofs whose photo is past retention, with the path to remove.
create function public.proofs_due_for_retention(p_limit int)
returns table (proof_id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.storage_path
  from public.task_proofs p
  where p.photo_deleted_at is null
    and p.received_at < now() - make_interval(days => (public.proof_rules() ->> 'retentionDays')::int)
  order by p.received_at
  limit least(greatest(coalesce(p_limit, 1), 1), 1000);
$$;

-- Called after the object is gone. A proof still waiting for an admin is approved by the system, with
-- the XP granted, so the user does not lose it to the admin's delay and the photo does not stay forever.
-- A superseded proof is not touched beyond the photo: it counts for nothing. The row loses the path and
-- the device and distance fields, and keeps hash, times, size, flags, decision, author and history.
create function public.mark_proof_photo_deleted(p_proof_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  proof public.task_proofs;
  occ public.task_occurrences;
begin
  select * into proof from public.task_proofs where id = p_proof_id for update;
  if not found or proof.photo_deleted_at is not null then
    return;
  end if;

  if proof.review_status = 'in_review' and proof.superseded_at is null then
    select * into occ from public.task_occurrences
    where id = proof.occurrence_id and current_proof_id = proof.id
    for update;

    if found and occ.status = 'done' then
      update public.task_occurrences
      set proof_review_status = 'approved'
      where id = occ.id
      returning * into occ;

      insert into public.task_status_history
        (occurrence_id, from_status, to_status, changed_by, reason, proof_review_status)
      values (occ.id, occ.status, occ.status, null, null, 'approved');

      perform public.occurrence_award_xp(occ);
    end if;

    update public.task_proofs
    set review_status = 'approved', reviewed_by = null, reviewed_at = now(),
        review_note = 'retention_auto_approved'
    where id = proof.id;
  end if;

  update public.task_proofs
  set photo_deleted_at = now(), storage_path = null, user_agent = null, distance_m = null, accuracy_m = null
  where id = proof.id;
end;
$$;

-- Objects of the bucket that no row points to, more than 24 hours old: a function that died between the
-- upload and the commit, or a group deleted in cascade. The 24 hours keep an upload in flight out.
create function public.orphan_proof_objects(p_limit int)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'task-proofs'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.task_proofs p where p.storage_path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 1), 1), 1000);
$$;

-- Challenges nobody turned into a proof, after 24 hours. The limits only count the last hour and the
-- last day of proofs, so deleting them frees no one.
create function public.delete_stale_proof_challenges()
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.proof_challenges c
    where c.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.task_proofs p where p.challenge_id = c.id)
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke execute on function public.proofs_due_for_retention(int) from public, anon, authenticated;
revoke execute on function public.mark_proof_photo_deleted(uuid) from public, anon, authenticated;
revoke execute on function public.orphan_proof_objects(int) from public, anon, authenticated;
revoke execute on function public.delete_stale_proof_challenges() from public, anon, authenticated;
grant execute on function public.proofs_due_for_retention(int) to service_role;
grant execute on function public.mark_proof_photo_deleted(uuid) to service_role;
grant execute on function public.orphan_proof_objects(int) to service_role;
grant execute on function public.delete_stale_proof_challenges() to service_role;

-- Calls the proof-retention Edge Function with an empty body, the way call_materialize_occurrences does.
-- The URL and the secret live in the Vault (names agreed with the function): without them this does
-- nothing, so a fresh environment never calls out by accident.
create function public.call_proof_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'proof_retention_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if fn_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.call_proof_retention() from public, anon, authenticated;

-- Every hour, on the hour. Same name, same job: running this again replaces it.
select cron.schedule('proof-retention', '0 * * * *', 'select public.call_proof_retention()');
