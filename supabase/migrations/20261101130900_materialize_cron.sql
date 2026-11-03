create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Calls the materialize-occurrences Edge Function with an empty body, which covers every recurring
-- task. The URL and the secret live in the Vault (names agreed with the function): without them
-- this does nothing, so a fresh environment never calls out by accident.
create function public.call_materialize_occurrences()
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
    return;
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.call_materialize_occurrences() from public, anon, authenticated;

-- Daily at 06:00 UTC, 03:00 in Brasilia. Same name, same job: running this again replaces it.
select cron.schedule(
  'materialize-occurrences-daily',
  '0 6 * * *',
  'select public.call_materialize_occurrences()'
);
