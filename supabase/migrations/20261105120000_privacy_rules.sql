-- ADR-0012, section 3 (BL-12). Mirror of privacyRules in packages/config/src/limits.ts;
-- `pnpm db:check-permissions` compares both.
insert into public.app_settings (key, value) values
  ('privacy_rules', '{"openDeletionHoldMinutes": 30}');

-- Used by accept_invite only. A missing row would silently change the hold, so it fails loudly.
create function public.privacy_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'privacy_rules';
  if rules is null then
    raise exception 'privacy_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.privacy_rules() from public, anon, authenticated;
