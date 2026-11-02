-- ADR-0008, section 12. call_materialize_occurrences returned in silence without its Vault secrets, so
-- an environment with no materialization looked healthy. It now fails the cron run, which
-- cron.job_run_details shows as `failed`, and still calls nothing out, like call_proof_retention and
-- call_dispatch_notifications. See docs/implantacao.md.
create or replace function public.call_materialize_occurrences()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'materialize_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if fn_url is null or secret is null then
    raise exception 'materialize_not_configured';
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
