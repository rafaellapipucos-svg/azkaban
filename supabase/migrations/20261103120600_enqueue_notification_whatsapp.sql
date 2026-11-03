-- ADR-0009, sections 2 and 5. daily_summary has no occurrence and no group: the recipient is the profile
-- itself, and what the summary tells is read at send time with the access of that moment.
create or replace function public.can_receive_notification(
  p_user uuid,
  p_type public.notification_type,
  p_occurrence_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_type = 'daily_summary' then p_user is not null else coalesce(
    (
      select case
        when p_type = 'proof_in_review' then
          public.can_view_task_for(p_user, t)
          and t.archived_at is null
          and t.group_id is not null
          and t.visibility = 'group'
          and public.proof_user_can(p_user, t.group_id, 'proof.review')
        else public.can_view_task_for(p_user, t)
      end
      from public.task_occurrences o
      join public.tasks t on t.id = o.task_id
      where o.id = p_occurrence_id
    ),
    false
  ) end;
$$;

-- As before (20261102150100), plus:
--   - whatsapp only for a type in notificationRules.whatsappTypes and a ready profile;
--   - daily_summary only by whatsapp in this phase: push has no text for it, and the summary costs a
--     template per channel. A preference row for push writes nothing;
--   - the bell row of daily_summary is born read: it is listed, but neither counts nor pops up.
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

  insert into public.notifications (user_id, type, occurrence_id, group_id, data, dedupe_key, read_at)
  values (p_user, p_type, p_occurrence_id, p_group_id, p_data, p_type::text || ':' || p_event_key,
    case when p_type = 'daily_summary' then now() end)
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
      or (
        p_type <> 'daily_summary'
        and exists (select 1 from public.push_subscriptions s where s.user_id = p_user)
      )
    )
    and (
      c.channel <> 'whatsapp'
      or (
        (rules -> 'whatsappTypes') ? p_type::text
        and exists (select 1 from public.profiles p where p.id = p_user and public.is_whatsapp_ready(p))
      )
    );

  return new_id;
end;
$$;
