-- ADR-0007, section 14. The acceptance of the notice before the first photo, and again whenever
-- proofRules.consentVersion goes up. Only record_proof_consent writes it: the profile grant is by
-- column and does not include these two.
alter table public.profiles
  add column proof_consent_version int check (proof_consent_version > 0),
  add column proof_consent_at timestamptz;
