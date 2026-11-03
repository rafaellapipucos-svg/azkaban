-- ADR-0012, section 6. The photo notice changed (revocation in Privacy), so proofRules.consentVersion is 3.
-- Acceptances of version 2 stay in proof_consents and on the profile: issue_proof_challenge and
-- claim_proof_challenge compare against this value, so everyone accepts again before the next proof.
update public.app_settings
set value = jsonb_set(value, '{consentVersion}', '3')
where key = 'proof_rules';
