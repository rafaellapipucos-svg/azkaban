-- ADR-0011, section 13. Mirror of shoppingRules in packages/config/src/shopping.ts;
-- `pnpm db:check-permissions` compares both. xp is read only after Phase 6 (F7-5).
insert into public.app_settings (key, value) values
  ('shopping_rules', '{
    "maxItemsPerList": 200,
    "maxCatalogItemsPerScope": 500,
    "xp": {"amount": 10, "minCheckedItems": 3, "maxRewardedPerDay": 2}
  }');

-- Used by triggers only. A missing row would silently lift the limits, so it fails loudly.
create function public.shopping_rules()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  rules jsonb;
begin
  select value into rules from public.app_settings where key = 'shopping_rules';
  if rules is null then
    raise exception 'shopping_rules_missing';
  end if;
  return rules;
end;
$$;

revoke execute on function public.shopping_rules() from public, anon, authenticated;
