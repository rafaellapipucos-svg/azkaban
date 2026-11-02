-- ADR-0008, section 3. One row per browser that accepted push. The endpoint and the two keys are a
-- capability: with them anyone pushes to that browser. The client reads only what pushDeviceSchema
-- shows, deletes its own rows, and writes only through register_push_subscription.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1024),
  -- base64url of 65 and 16 bytes, padding tolerated, as pushSubscriptionInputSchema.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=*$' and char_length(p256dh) <= 128),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}=*$' and char_length(auth) <= 64),
  user_agent text check (char_length(user_agent) <= 256),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
-- Not endpoint, p256dh nor auth, not even the user's own: they never come back to a client.
grant select (id, user_agent, created_at, last_success_at) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

-- The host of a push endpoint, or null when it is not a plain https URL. Parsed, not matched as text:
-- no user info (https://fcm.googleapis.com@evil.example), no backslash, no port other than 443, no IP
-- literal, no trailing dot. Lower case, as hosts compare.
create function public.push_endpoint_host(p_endpoint text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(m[1])
  from regexp_match(
    p_endpoint,
    '^https://([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?::443)?(?:[/?#][^\s\\]*)?$'
  ) m;
$$;

-- Inside notificationRules.pushEndpointHosts: the host itself, or a subdomain of it.
create function public.is_allowed_push_endpoint(p_endpoint text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select bool_or(h = allowed or right(h, char_length(allowed) + 1) = '.' || allowed)
      from (select public.push_endpoint_host(p_endpoint) as h) parsed,
        jsonb_array_elements_text(public.notification_rules() -> 'pushEndpointHosts') allowed
    ),
    false
  );
$$;

revoke execute on function public.push_endpoint_host(text) from public, anon, authenticated;
revoke execute on function public.is_allowed_push_endpoint(text) from public, anon, authenticated;

-- The browser's PushSubscription.toJSON(), each time the app opens with permission granted. Upsert by
-- endpoint: the same browser on another account becomes that account's, because it is the same device.
-- Past maxPushSubscriptionsPerUser, the oldest go. Errors carry the code in the message:
-- forbidden, push_endpoint_not_allowed, invalid_push_subscription.
create function public.register_push_subscription(
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
  returning id into sub_id;

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

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
