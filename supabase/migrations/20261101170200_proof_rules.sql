-- Mirrored in packages/config/src/proof.ts (proofRules); `pnpm db:check-permissions` compares both,
-- and also the limits of the task-proofs bucket. ADR-0007, section 17.
insert into public.app_settings (key, value) values
  ('proof_rules', '{
    "challengeTtlSeconds": 300,
    "challengeMaxPerUserPerHour": 30,
    "challengeMaxPerOccurrencePerHour": 10,
    "maxProofsPerUserPerDay": 30,
    "maxBytes": 2097152,
    "contentType": "image/jpeg",
    "minEdgePx": 320,
    "maxEdgePx": 2048,
    "clockToleranceSeconds": 120,
    "outOfRadius": "flag",
    "maxLocationAccuracyM": 200,
    "retentionDays": 90,
    "signedUrlTtlSeconds": 60,
    "consentVersion": 1
  }');

-- Used by triggers and RPCs only. A missing row would silently disable the limits, so it fails loudly.
create function public.proof_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'proof_rules';
  if rules is null then
    raise exception 'proof_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.proof_rules() from public, anon, authenticated;
