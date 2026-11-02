-- SEG-4. The retention was silent when it could not run, and the notice promises the photo goes in 90
-- days. A missing Vault secret now fails the cron run, which cron.job_run_details shows as `failed`,
-- and still calls nothing out. The call itself is asynchronous, so a wrong secret or a function that was
-- never deployed only shows up as photos that stayed: a day late, each run warns in the Postgres log.
-- That one is a warning because raising would roll the queued call back. See docs/implantacao.md.
create or replace function public.call_proof_retention()
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
    raise exception 'proof_retention_not_configured';
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );

  if exists (
    select 1
    from public.task_proofs p
    where p.photo_deleted_at is null
      and p.received_at < now() - make_interval(days => (public.proof_rules() ->> 'retentionDays')::int + 1)
  ) then
    raise warning 'proof_retention_overdue';
  end if;
end;
$$;
