-- ADR-0007, section 20 (SEG-5). The second version of the notice, and how long a proof row outlives its
-- photo. Mirrored in packages/config/src/proof.ts. The composite key clears current_proof_id, and
-- occurrences_before_status does not react, because the status does not change.
update public.app_settings
set value = value || '{"consentVersion": 2, "recordRetentionDays": 365}'
where key = 'proof_rules';

create index task_proofs_record_retention_idx on public.task_proofs (received_at)
  where photo_deleted_at is not null;

create function public.delete_expired_proof_records(p_limit int)
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.task_proofs d
    where d.id in (
      select p.id
      from public.task_proofs p
      where p.photo_deleted_at is not null
        and p.received_at < now() - make_interval(days => (public.proof_rules() ->> 'recordRetentionDays')::int)
      order by p.received_at
      limit least(greatest(coalesce(p_limit, 1), 1), 1000)
    )
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke execute on function public.delete_expired_proof_records(int) from public, anon, authenticated;
grant execute on function public.delete_expired_proof_records(int) to service_role;
