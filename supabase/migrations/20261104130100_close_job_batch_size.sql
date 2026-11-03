-- ADR-0012, section 13, item 4 (SEG6-7). close_gamification_days runs each profile in its own
-- subtransaction; 64 per run stays inside the subtransaction cache. Mirrors gamificationRules.closeJob.
update public.app_settings
set value = jsonb_set(value, '{closeJob,batchSize}', '64')
where key = 'gamification_rules';
