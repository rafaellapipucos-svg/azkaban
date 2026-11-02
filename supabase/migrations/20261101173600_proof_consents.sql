-- ADR-0007, section 20 (SEG-5). Append-only: one row per version of the notice accepted, whose text is in
-- git. profiles keeps the latest, which is what issue_proof_challenge reads.
create table public.proof_consents (
  user_id uuid not null references public.profiles (id) on delete cascade,
  version int not null check (version > 0),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.proof_consents enable row level security;

revoke all on public.proof_consents from anon, authenticated;
grant select on public.proof_consents to authenticated;

create policy proof_consents_select on public.proof_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.proof_consents (user_id, version, accepted_at)
select id, proof_consent_version, coalesce(proof_consent_at, now())
from public.profiles
where proof_consent_version is not null;

create or replace function public.record_proof_consent(p_version int)
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

  if p_version is distinct from (public.proof_rules() ->> 'consentVersion')::int then
    raise exception 'invalid_consent_version' using errcode = '22023';
  end if;

  update public.profiles
  set proof_consent_version = p_version, proof_consent_at = now()
  where id = uid;

  insert into public.proof_consents (user_id, version)
  values (uid, p_version)
  on conflict do nothing;
end;
$$;
