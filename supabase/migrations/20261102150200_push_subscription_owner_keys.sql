-- ADR-0008, section 17, SEG4-2. Knowing an endpoint was enough to move another account's subscription
-- to the caller, with the caller's keys. Now the owner changes only when p256dh and auth are the stored
-- ones: the same browser on another account is the same subscription, and comes with the same keys.
-- The owner still updates keys and agent. Anything else is `forbidden`, and the row stays as it was.
-- Risk accepted in the ADR: whoever has the endpoint and both keys has the whole subscription.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  agent text := nullif(btrim(p_user_agent), '');
  sub_id uuid;
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The dispatcher POSTs to this address. Any other host would be a request from our server to
  -- wherever the client chose.
  if p_endpoint is null or char_length(p_endpoint) > 1024 or not public.is_allowed_push_endpoint(p_endpoint) then
    raise exception 'push_endpoint_not_allowed' using errcode = '22023';
  end if;

  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}=*$' or char_length(p_p256dh) > 128
    or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}=*$' or char_length(p_auth) > 64
    or char_length(agent) > 256 then
    raise exception 'invalid_push_subscription' using errcode = '22023';
  end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, agent)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        -- A new owner starts a new device: its age and its last delivery are not the old account's.
        created_at = case when s.user_id = excluded.user_id then s.created_at else now() end,
        last_success_at = case when s.user_id = excluded.user_id then s.last_success_at end
    where s.user_id = excluded.user_id
      or (s.p256dh = excluded.p256dh and s.auth = excluded.auth)
  returning id into sub_id;

  -- Someone else's endpoint with other keys: nothing was written.
  if sub_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The one just registered stays, whatever its age: it is the browser in use.
  delete from public.push_subscriptions
  where id in (
    select id from public.push_subscriptions
    where user_id = uid and id <> sub_id
    order by created_at desc, id desc
    offset (public.notification_rules() ->> 'maxPushSubscriptionsPerUser')::int - 1
  );

  return sub_id;
end;
$$;
