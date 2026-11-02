-- ADR-0008, section 17, SEG4-1. A member who toggled done and pending wrote a new line in the creator's
-- bell on every round, because each round is a new history line and so a new event key. Now, for the
-- types of notificationRules.renotifyCooldown, the same notice (same user, type, occurrence and data)
-- within the cooldown writes nothing: no bell row, no outbox row, no Realtime event. A different fact
-- (another status, another person) has other data and is still told. The event key and its unique
-- index stay as they were: the cooldown is one more check, not a new key. Transitions of the same
-- occurrence hold its row lock, so two of them do not read the window at the same time.
-- notifications_user_created_idx (user_id, created_at desc) serves the lookup.
create or replace function public.enqueue_notification(
  p_user uuid,
  p_type public.notification_type,
  p_occurrence_id uuid,
  p_group_id uuid,
  p_data jsonb,
  p_event_key text,
  p_scheduled_for timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb := public.notification_rules();
  cooldown jsonb := rules -> 'renotifyCooldown';
  new_id uuid;
begin
  if p_user is null or not public.can_receive_notification(p_user, p_type, p_occurrence_id) then
    return null;
  end if;

  -- With no occurrence there is nothing to compare.
  if p_occurrence_id is not null
    and (cooldown -> 'types') ? p_type::text
    and exists (
      select 1 from public.notifications n
      where n.user_id = p_user
        and n.type = p_type
        and n.occurrence_id = p_occurrence_id
        and n.data = p_data
        and n.created_at > now() - make_interval(mins => (cooldown ->> 'minutes')::int)
    ) then
    return null;
  end if;

  insert into public.notifications (user_id, type, occurrence_id, group_id, data, dedupe_key)
  values (p_user, p_type, p_occurrence_id, p_group_id, p_data, p_type::text || ':' || p_event_key)
  on conflict (user_id, dedupe_key) do nothing
  returning id into new_id;

  if new_id is null then
    return null;
  end if;

  insert into public.notification_outbox (notification_id, user_id, channel, scheduled_for, next_attempt_at)
  select new_id, p_user, c.channel, p_scheduled_for, now()
  from (
    select ch::public.delivery_channel as channel
    from jsonb_array_elements_text(rules -> 'activeChannels') ch
  ) c
  left join public.notification_preferences pref
    on pref.user_id = p_user and pref.type = p_type and pref.channel = c.channel
  where coalesce(pref.enabled, (rules -> 'defaultChannels' -> p_type::text ->> c.channel::text)::boolean, false)
    and (
      c.channel <> 'web_push'
      or exists (select 1 from public.push_subscriptions s where s.user_id = p_user)
    );

  return new_id;
end;
$$;
