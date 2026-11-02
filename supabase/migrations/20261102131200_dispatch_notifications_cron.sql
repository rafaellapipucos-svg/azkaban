-- ADR-0008, section 6. Calls dispatch-notifications every minute with the cron secret, as
-- call_proof_retention does. URL and secret live in the Vault (dispatch_notifications_url and
-- cron_secret); without them the run fails, and cron.job_run_details shows it as failed, instead of
-- staying silent while the queue grows. See docs/implantacao.md.
create function public.call_dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'dispatch_notifications_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if fn_url is null or secret is null then
    raise exception 'dispatch_notifications_not_configured';
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.call_dispatch_notifications() from public, anon, authenticated;

select cron.schedule('dispatch-notifications', '* * * * *', 'select public.call_dispatch_notifications()');
