-- ADR-0008, sections 2 and 4. Who may receive a notification, checked for a given user and not for
-- auth.uid(): the writers are triggers and jobs, often with no user, or with the user who acted.

-- can_view_task for a given user, the same rules with p_user in place of auth.uid(). Keep the two
-- together: a change to who sees a task changes both.
create function public.can_view_task_for(p_user uuid, p_task public.tasks)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when p_task.group_id is null then p_task.assignee_id = p_user
      else exists (
          select 1 from public.group_members m where m.group_id = p_task.group_id and m.user_id = p_user
        )
        and (
          p_task.assignee_id = p_user
          or p_task.created_by = p_user
          or (
            p_task.visibility = 'group'
            and (
              exists (
                select 1 from public.task_occurrences o
                where o.task_id = p_task.id and o.assignee_id = p_user
              )
              or public.proof_user_can(p_user, p_task.group_id, 'task.view_group')
            )
          )
        )
    end,
    false
  );
$$;

-- When writing and again when sending: a current member who sees the task, or, for a proof waiting for
-- review, who may review it. Without the occurrence there is nothing to tell.
create function public.can_receive_notification(
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
  select coalesce(
    (
      select case
        when p_type = 'proof_in_review' then
          t.group_id is not null
          and t.visibility = 'group'
          and public.proof_user_can(p_user, t.group_id, 'proof.review')
        else public.can_view_task_for(p_user, t)
      end
      from public.task_occurrences o
      join public.tasks t on t.id = o.task_id
      where o.id = p_occurrence_id
    ),
    false
  );
$$;

-- Internal. Writes the bell row and, only if it was born now, one outbox row per active channel the user
-- has on: the preference, or notificationRules.defaultChannels without one. web_push needs at least one
-- subscription. Repeating the same event is a no-op, by the unique (user_id, dedupe_key).
-- Returns the notification id, or null when nothing was written.
create function public.enqueue_notification(
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
  new_id uuid;
begin
  if p_user is null or not public.can_receive_notification(p_user, p_type, p_occurrence_id) then
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

revoke execute on function public.can_view_task_for(uuid, public.tasks) from public, anon, authenticated;
revoke execute on function public.can_receive_notification(uuid, public.notification_type, uuid)
  from public, anon, authenticated;
revoke execute on function public.enqueue_notification(
  uuid, public.notification_type, uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated;
