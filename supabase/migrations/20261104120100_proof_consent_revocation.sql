-- ADR-0012, section 6. Revoking the photo notice has its own mark and keeps the acceptance: the key moves
-- from (user_id, version) to id, and only one live row per version. Accepting again after a revocation
-- writes a new row, so the history stays whole. record_proof_consent needs no change: its
-- `on conflict do nothing` takes the partial unique index as the arbiter.
alter table public.proof_consents
  add column id uuid not null default gen_random_uuid(),
  add column revoked_at timestamptz,
  add constraint proof_consents_revoked_after_check check (revoked_at >= accepted_at);

alter table public.proof_consents drop constraint proof_consents_pkey;
alter table public.proof_consents add primary key (id);

create unique index proof_consents_live_idx on public.proof_consents (user_id, version)
  where revoked_at is null;
create index proof_consents_user_idx on public.proof_consents (user_id);

-- Marks every live acceptance and clears the profile, which is what issue_proof_challenge and
-- claim_proof_challenge read. Revoking with nothing to revoke is a no-op. The photos already sent follow
-- the retention (ADR-0012, section 6).
create function public.revoke_proof_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.proof_consents
  set revoked_at = now()
  where user_id = uid and revoked_at is null;

  update public.profiles
  set proof_consent_version = null, proof_consent_at = null
  where id = uid;
end;
$$;

revoke execute on function public.revoke_proof_consent() from public, anon;
grant execute on function public.revoke_proof_consent() to authenticated;
