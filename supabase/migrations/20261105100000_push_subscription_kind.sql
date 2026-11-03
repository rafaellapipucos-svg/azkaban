-- ADR-0012, section 11 (BL-5). A subscription is a browser (web: endpoint and keys) or a device of the
-- native app (expo: the token of getExpoPushTokenAsync). Same table, same channel (web_push), same limit
-- per user. The rows of today are web. expo_token is a capability like the endpoint: no column grant to
-- authenticated (the grant of 20261102130500 lists columns, so new ones stay closed), never logged.
alter table public.push_subscriptions
  add column kind text not null default 'web' check (kind in ('web', 'expo')),
  -- expoPushTokenSchema.
  add column expo_token text unique
    check (char_length(expo_token) <= 256 and expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  alter column endpoint drop not null,
  alter column p256dh drop not null,
  alter column auth drop not null,
  add constraint push_subscriptions_kind_columns check (
    (kind = 'web' and endpoint is not null and p256dh is not null and auth is not null and expo_token is null)
    or (kind = 'expo' and expo_token is not null and endpoint is null and p256dh is null and auth is null)
  );
