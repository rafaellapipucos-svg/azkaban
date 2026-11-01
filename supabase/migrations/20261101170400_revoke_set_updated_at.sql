-- The only function in public that PUBLIC and anon could execute. It is a trigger function, so a
-- direct call fails anyway, but a guard that says "no function in public is open to anon" needs the
-- exception gone. A trigger does not need the privilege to fire.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
