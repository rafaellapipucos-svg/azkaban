-- ADR-0009, sections 7 and 8. What was handed to the provider and how far it got, without content: no
-- parameters, no text, no phone. recipient_wa_id stays for the PARAR lookup. Written by the service role
-- (report_notification_results, the phone-verification and whatsapp-webhook functions); the client sees
-- nothing: RLS on, no policy, no grant to anon or authenticated.
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  -- Null only for the PARAR reply, which answers a number that may be in several accounts.
  user_id uuid references public.profiles (id) on delete cascade,
  outbox_id uuid references public.notification_outbox (id) on delete set null,
  purpose text not null check (purpose in ('notification', 'phone_code', 'stop_reply')),
  -- Null for free text.
  template text check (char_length(template) <= 512 and template ~ '^[a-z0-9_]+$'),
  provider text not null check (provider in ('console', 'meta')),
  provider_message_id text not null unique check (char_length(provider_message_id) between 1 and 128),
  recipient_wa_id text check (recipient_wa_id ~ '^[0-9]{6,15}$'),
  status text not null default 'accepted'
    check (status in ('accepted', 'sent', 'delivered', 'read', 'failed')),
  status_at timestamptz not null default now(),
  error_code text check (error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  check (user_id is not null or purpose = 'stop_reply')
);

create index whatsapp_messages_wa_id_idx on public.whatsapp_messages (recipient_wa_id)
  where recipient_wa_id is not null;
create index whatsapp_messages_user_idx on public.whatsapp_messages (user_id);
-- The retention job.
create index whatsapp_messages_created_idx on public.whatsapp_messages (created_at);

alter table public.whatsapp_messages enable row level security;

revoke all on public.whatsapp_messages from anon, authenticated;

-- The outbox of the ConsoleProvider: the whole message, code and text included, because the E2E reads
-- them here. The protection is the access (service role only) and consoleRetentionDays. Empty with meta.
create table public.whatsapp_console_messages (
  id uuid primary key default gen_random_uuid(),
  to_e164 text not null check (to_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  message jsonb not null check (jsonb_typeof(message) = 'object' and pg_column_size(message) <= 16384),
  created_at timestamptz not null default now()
);

create index whatsapp_console_messages_created_idx on public.whatsapp_console_messages (created_at);

alter table public.whatsapp_console_messages enable row level security;

revoke all on public.whatsapp_console_messages from anon, authenticated;

-- The webhook's statuses, by provider_message_id. p_events is an array of
--   { providerMessageId, status: 'sent' | 'delivered' | 'read' | 'failed', at: ISO | null, errorCode: null | 'wa_<n>' }.
-- A status only moves forward (accepted < sent < delivered < read), and failed wins over any. An unknown
-- id, another status name or a step back is ignored, so a repeated event is harmless. Returns the rows
-- that changed.
create function public.record_whatsapp_statuses(p_events jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  changed int := 0;
  n int;
begin
  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  for e in
    select x ->> 'providerMessageId' as id, x ->> 'status' as status,
      case when x ->> 'at' ~ '^\d{4}-\d{2}-\d{2}T' then (x ->> 'at')::timestamptz end as at,
      case when x ->> 'errorCode' ~ '^[a-z0-9_]{1,64}$' then x ->> 'errorCode' end as code,
      ord
    from jsonb_array_elements(p_events) with ordinality as t (x, ord)
    where jsonb_typeof(x) = 'object'
      and x ->> 'status' in ('sent', 'delivered', 'read', 'failed')
    order by ord
  loop
    update public.whatsapp_messages m
    set status = e.status, status_at = coalesce(e.at, now()),
      error_code = case when e.status = 'failed' then e.code end
    where m.provider_message_id = e.id
      and m.status <> 'failed'
      and (
        e.status = 'failed'
        or array_position(array['accepted', 'sent', 'delivered', 'read'], e.status)
          > array_position(array['accepted', 'sent', 'delivered', 'read'], m.status)
      );
    get diagnostics n = row_count;
    changed := changed + n;
  end loop;

  return changed;
end;
$$;

-- PARAR from a number. The number is matched by the digits of the profile's phone, or by a wa_id the
-- provider already answered for that user: a Brazilian wa_id may come without the ninth digit. Every
-- ready profile of that number opts out from the webhook, and the count of those that changed is
-- returned. Repeating changes nobody, so the caller confirms once.
create function public.whatsapp_stop_by_wa_id(p_wa_id text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed int;
begin
  if p_wa_id is null or p_wa_id !~ '^[0-9]{6,15}$' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  update public.profiles p
  set whatsapp_opt_out_at = now(), whatsapp_opt_out_source = 'webhook'
  where public.is_whatsapp_ready(p)
    and (
      substr(p.phone_e164, 2) = p_wa_id
      or p.id in (select m.user_id from public.whatsapp_messages m where m.recipient_wa_id = p_wa_id)
    );
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke execute on function public.record_whatsapp_statuses(jsonb) from public, anon, authenticated;
revoke execute on function public.whatsapp_stop_by_wa_id(text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_statuses(jsonb) to service_role;
grant execute on function public.whatsapp_stop_by_wa_id(text) to service_role;
