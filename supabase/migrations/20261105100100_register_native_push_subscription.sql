-- ADR-0012, section 11 (BL-5). The sibling of register_push_subscription for the native app, with
-- nativePushSubscriptionInputSchema as argument. Upsert by token: the same device on another account
-- becomes that account's, as a browser does. Past maxPushSubscriptionsPerUser the oldest go, of either
-- kind (register_push_subscription already counts every row of the user). No host list: the dispatcher
-- only talks to the Expo push API. Errors carry the code in the message: forbidden,
-- invalid_push_subscription.
-- Risk accepted in the ADR: whoever has the token has the device, as with an endpoint and its keys.
create function public.register_native_push_subscription(p_token text, p_user_agent text)
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

  if p_token is null or char_length(p_token) > 256
    or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'
    or char_length(agent) > 256 then
    raise exception 'invalid_push_subscription' using errcode = '22023';
  end if;

  insert into public.push_subscriptions as s (user_id, kind, expo_token, user_agent)
  values (uid, 'expo', p_token, agent)
  on conflict (expo_token) do update
    set user_id = excluded.user_id,
        user_agent = excluded.user_agent,
        -- A new owner starts a new device: its age and its last delivery are not the old account's.
        created_at = case when s.user_id = excluded.user_id then s.created_at else now() end,
        last_success_at = case when s.user_id = excluded.user_id then s.last_success_at end
  returning id into sub_id;

  -- The one just registered stays, whatever its age: it is the device in use.
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

revoke execute on function public.register_native_push_subscription(text, text) from public, anon;
grant execute on function public.register_native_push_subscription(text, text) to authenticated;
