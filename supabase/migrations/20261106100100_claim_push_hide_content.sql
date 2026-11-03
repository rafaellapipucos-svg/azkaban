-- BL-32. As 20261105100200, except that each item says hideContent: the user's push_hide_content, on the
-- web_push channel (both kinds of subscription). When it is on, the dispatcher renders a neutral push and
-- keeps data.url; taskTitle comes null, so a dispatcher that does not know the flag yet still leaves the
-- title off the lock screen. WhatsApp is not a lock-screen push and keeps the title.
create or replace function public.claim_notification_batch(
  p_limit int,
  p_lease_seconds int,
  p_max_delay_hours int,
  p_channels text[] default array['web_push']
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  tz text;
  quiet_end timestamptz;
  summary jsonb;
  outcome text;
  lease_end timestamptz := now() + make_interval(secs => p_lease_seconds);
  whatsapp_types jsonb := public.notification_rules() -> 'whatsappTypes';
  catch_up interval := make_interval(
    mins => (public.whatsapp_rules() -> 'dailySummary' ->> 'catchUpMinutes')::int
  );
  items jsonb := '[]';
  expired int := 0;
  cancelled int := 0;
  deferred int := 0;
begin
  if p_limit is null or p_limit < 1 or p_lease_seconds is null or p_lease_seconds < 1
    or p_max_delay_hours is null or p_max_delay_hours < 1
    or coalesce(cardinality(p_channels), 0) = 0
    or exists (
      select 1 from unnest(p_channels) ch
      where ch is null or ch not in (select unnest(enum_range(null::public.delivery_channel))::text)
    ) then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  for r in
    select ob.id, ob.notification_id, ob.user_id, ob.channel, ob.scheduled_for, ob.attempts,
      n.type, n.data, n.occurrence_id, p.locale, p.timezone, p.quiet_hours_start, p.quiet_hours_end,
      p.phone_e164, p.daily_summary_skip_empty, public.is_whatsapp_ready(p) as whatsapp_ready,
      ob.channel = 'web_push' and p.push_hide_content as hide_content,
      o.status as occurrence_status, o.overdue_at, o.proof_review_status, t.title, t.requires_photo_proof
    from public.notification_outbox ob
    join public.notifications n on n.id = ob.notification_id
    join public.profiles p on p.id = ob.user_id
    left join public.task_occurrences o on o.id = n.occurrence_id
    left join public.tasks t on t.id = o.task_id
    where ob.status in ('pending', 'sending') and ob.next_attempt_at <= now()
      and ob.channel::text = any (p_channels)
    order by ob.next_attempt_at
    limit p_limit
    for update of ob skip locked
  loop
    if now() > r.scheduled_for + (case when r.type = 'daily_summary' then catch_up
        else make_interval(hours => p_max_delay_hours) end) then
      update public.notification_outbox
      set status = 'expired', locked_until = null, last_error = 'expired'
      where id = r.id;
      expired := expired + 1;
      continue;
    end if;

    tz := public.profile_timezone(r.timezone);
    summary := case when r.type = 'daily_summary'
      then public.daily_summary_source(r.user_id, tz, (r.data ->> 'localDate')::date) end;

    outcome := case
      when not public.can_receive_notification(r.user_id, r.type, r.occurrence_id) then 'no_access'
      when (r.type = 'task_reminder' and r.occurrence_status is distinct from 'pending')
        or (r.type = 'proof_in_review' and r.proof_review_status is distinct from 'in_review') then 'resolved'
      when r.channel = 'whatsapp' and not r.whatsapp_ready then 'whatsapp_not_ready'
      when r.channel = 'whatsapp' and not whatsapp_types ? r.type::text then 'whatsapp_type_not_allowed'
    end;
    if outcome is not null then
      update public.notification_outbox
      set status = 'cancelled', locked_until = null, last_error = outcome
      where id = r.id;
      cancelled := cancelled + 1;
      continue;
    end if;

    quiet_end := case when r.type <> 'daily_summary'
      then public.quiet_hours_end_at(tz, r.quiet_hours_start, r.quiet_hours_end, now()) end;
    if quiet_end is not null
      and not (r.type = 'task_reminder' and (r.data ->> 'anchorAt')::timestamptz < quiet_end) then
      update public.notification_outbox
      set status = 'pending', next_attempt_at = quiet_end, locked_until = null
      where id = r.id;
      deferred := deferred + 1;
      continue;
    end if;

    outcome := case
      when r.channel = 'web_push'
        and not exists (select 1 from public.push_subscriptions s where s.user_id = r.user_id) then 'no_subscription'
      when r.type = 'daily_summary' and r.daily_summary_skip_empty
        and public.daily_summary_is_empty(summary) then 'summary_empty'
    end;
    if outcome is not null then
      update public.notification_outbox
      set status = 'cancelled', locked_until = null, last_error = outcome
      where id = r.id;
      cancelled := cancelled + 1;
      continue;
    end if;

    update public.notification_outbox
    set status = 'sending', attempts = attempts + 1, locked_until = lease_end, next_attempt_at = lease_end
    where id = r.id;

    items := items || jsonb_build_object(
      'outboxId', r.id,
      'notificationId', r.notification_id,
      'channel', r.channel,
      'type', r.type,
      'data', r.data,
      'occurrenceId', r.occurrence_id,
      'locale', r.locale,
      'timezone', tz,
      'taskTitle', case when r.hide_content then null else r.title end,
      'hideContent', r.hide_content,
      'requiresPhotoProof', coalesce(r.requires_photo_proof, false),
      'overdueAt', r.overdue_at,
      'occurrenceStatus', r.occurrence_status,
      'attempts', r.attempts + 1,
      'scheduledFor', r.scheduled_for,
      'subscriptions', case when r.channel = 'web_push' then (
        select coalesce(jsonb_agg(case s.kind
          when 'expo' then jsonb_build_object('id', s.id, 'kind', s.kind, 'expoToken', s.expo_token)
          else jsonb_build_object('id', s.id, 'kind', s.kind, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
        end order by s.created_at), '[]')
        from public.push_subscriptions s where s.user_id = r.user_id
      ) else '[]'::jsonb end,
      'phone', case when r.channel = 'whatsapp' then r.phone_e164 end,
      'summary', summary
    );
  end loop;

  return jsonb_build_object('items', items, 'expired', expired, 'cancelled', cancelled, 'deferred', deferred);
end;
$$;
