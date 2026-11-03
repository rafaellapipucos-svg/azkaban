-- ADR-0008, sections 5 and 6: the two calls of dispatch-notifications, for the service role only.
-- notificationDefaults (batch, lease, backoff, maximum delay) stay in packages/config: the function
-- passes them here, and no trigger reads them.

-- End of the quiet window that contains p_at, in the profile's zone, or null when p_at is outside it or
-- the profile has none. The window may cross midnight. The end is the local date plus quiet_hours_end in
-- that zone, so a change of daylight saving time is Postgres's arithmetic, not ours.
create function public.quiet_hours_end_at(
  p_timezone text,
  p_start time,
  p_end time,
  p_at timestamptz
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_start is null or p_end is null then null
    when p_start < p_end and l.ts::time >= p_start and l.ts::time < p_end
      then (l.ts::date + p_end) at time zone p_timezone
    when p_start > p_end and l.ts::time >= p_start
      then (l.ts::date + 1 + p_end) at time zone p_timezone
    when p_start > p_end and l.ts::time < p_end
      then (l.ts::date + p_end) at time zone p_timezone
  end
  from (select p_at at time zone p_timezone as ts) l;
$$;

revoke execute on function public.quiet_hours_end_at(text, time, time, timestamptz) from public, anon, authenticated;

-- Takes up to p_limit rows that are due: pending with next_attempt_at reached, or sending with the lease
-- run out (a sending row keeps its lease end in next_attempt_at). In this order:
--   1. more than p_max_delay_hours past scheduled_for: expired;
--   2. the recipient no longer has access, a reminder whose occurrence is no longer pending, or a review
--      notice whose photo is no longer waiting: cancelled;
--   3. quiet hours: back to pending at the end of the window, no attempt counted. A reminder whose anchor
--      falls before the end of the current window rings anyway: after the anchor it is no use;
--   4. web_push with no subscription left: cancelled, no_subscription.
-- The rest go to sending, with attempts + 1 and the lease. Returns
--   { items: [...], expired, cancelled, deferred }
-- where each item is
--   { outboxId, notificationId, channel, type, data, occurrenceId, locale, taskTitle,
--     requiresPhotoProof, attempts, scheduledFor, subscriptions: [{ id, endpoint, p256dh, auth }] }.
create function public.claim_notification_batch(
  p_limit int,
  p_lease_seconds int,
  p_max_delay_hours int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  quiet_end timestamptz;
  lease_end timestamptz := now() + make_interval(secs => p_lease_seconds);
  items jsonb := '[]';
  expired int := 0;
  cancelled int := 0;
  deferred int := 0;
begin
  if p_limit is null or p_limit < 1 or p_lease_seconds is null or p_lease_seconds < 1
    or p_max_delay_hours is null or p_max_delay_hours < 1 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  for r in
    select ob.id, ob.notification_id, ob.user_id, ob.channel, ob.scheduled_for, ob.attempts,
      n.type, n.data, n.occurrence_id, p.locale, p.timezone, p.quiet_hours_start, p.quiet_hours_end,
      o.status as occurrence_status, o.proof_review_status, t.title, t.requires_photo_proof
    from public.notification_outbox ob
    join public.notifications n on n.id = ob.notification_id
    join public.profiles p on p.id = ob.user_id
    left join public.task_occurrences o on o.id = n.occurrence_id
    left join public.tasks t on t.id = o.task_id
    where ob.status in ('pending', 'sending') and ob.next_attempt_at <= now()
    order by ob.next_attempt_at
    limit p_limit
    for update of ob skip locked
  loop
    if now() > r.scheduled_for + make_interval(hours => p_max_delay_hours) then
      update public.notification_outbox
      set status = 'expired', locked_until = null, last_error = 'expired'
      where id = r.id;
      expired := expired + 1;
      continue;
    end if;

    if not public.can_receive_notification(r.user_id, r.type, r.occurrence_id) then
      update public.notification_outbox
      set status = 'cancelled', locked_until = null, last_error = 'no_access'
      where id = r.id;
      cancelled := cancelled + 1;
      continue;
    end if;

    if (r.type = 'task_reminder' and r.occurrence_status is distinct from 'pending')
      or (r.type = 'proof_in_review' and r.proof_review_status is distinct from 'in_review') then
      update public.notification_outbox
      set status = 'cancelled', locked_until = null, last_error = 'resolved'
      where id = r.id;
      cancelled := cancelled + 1;
      continue;
    end if;

    -- profiles.timezone has no check of its own, and one bad name must not stop the whole queue. The
    -- fallback is the column's default.
    begin
      quiet_end := public.quiet_hours_end_at(r.timezone, r.quiet_hours_start, r.quiet_hours_end, now());
    exception when invalid_parameter_value then
      quiet_end := public.quiet_hours_end_at('America/Sao_Paulo', r.quiet_hours_start, r.quiet_hours_end, now());
    end;
    if quiet_end is not null
      and not (r.type = 'task_reminder' and (r.data ->> 'anchorAt')::timestamptz < quiet_end) then
      update public.notification_outbox
      set status = 'pending', next_attempt_at = quiet_end, locked_until = null
      where id = r.id;
      deferred := deferred + 1;
      continue;
    end if;

    if r.channel = 'web_push'
      and not exists (select 1 from public.push_subscriptions s where s.user_id = r.user_id) then
      update public.notification_outbox
      set status = 'cancelled', locked_until = null, last_error = 'no_subscription'
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
      'taskTitle', r.title,
      'requiresPhotoProof', coalesce(r.requires_photo_proof, false),
      'attempts', r.attempts + 1,
      'scheduledFor', r.scheduled_for,
      'subscriptions', case when r.channel = 'web_push' then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth
        ) order by s.created_at), '[]')
        from public.push_subscriptions s where s.user_id = r.user_id
      ) else '[]'::jsonb end
    );
  end loop;

  return jsonb_build_object('items', items, 'expired', expired, 'cancelled', cancelled, 'deferred', deferred);
end;
$$;

-- What the function did with each claimed row. p_results is an array of
--   { outboxId, status: 'sent' | 'retry' | 'failed', code?, retryAfterSeconds?,
--     deliveredSubscriptionIds?: [], goneSubscriptionIds?: [] }
-- sent records sent_at; retry goes back to pending after retryAfterSeconds (the backoff, computed by the
-- function with notificationDefaults.retry); failed stops. code is a short code, cut to 64. Gone
-- subscriptions (404, 410) are deleted, delivered ones get last_success_at; both only among the
-- recipient's own. A row no longer in sending (its lease ran out and another run took it) is skipped.
-- Returns the number of rows updated.
create function public.report_notification_results(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  owner uuid;
  updated int := 0;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  for x in
    select (e ->> 'outboxId')::uuid as outbox_id, e ->> 'status' as status, left(e ->> 'code', 64) as code,
      (e ->> 'retryAfterSeconds')::int as retry_after,
      coalesce(e -> 'deliveredSubscriptionIds', '[]') as delivered,
      coalesce(e -> 'goneSubscriptionIds', '[]') as gone
    from jsonb_array_elements(p_results) e
  loop
    if x.status is null or x.status not in ('sent', 'retry', 'failed') then
      raise exception 'invalid_argument' using errcode = '22023';
    end if;

    select user_id into owner from public.notification_outbox
    where id = x.outbox_id and status = 'sending'
    for update;
    if not found then
      continue;
    end if;

    delete from public.push_subscriptions
    where user_id = owner and id in (select g::uuid from jsonb_array_elements_text(x.gone) g);

    update public.push_subscriptions set last_success_at = now()
    where user_id = owner and id in (select d::uuid from jsonb_array_elements_text(x.delivered) d);

    update public.notification_outbox
    set status = case x.status when 'sent' then 'sent' when 'retry' then 'pending' else 'failed' end
          ::public.notification_outbox_status,
      sent_at = case when x.status = 'sent' then now() end,
      next_attempt_at = case when x.status = 'retry'
        then now() + make_interval(secs => greatest(coalesce(x.retry_after, 0), 1))
        else next_attempt_at end,
      locked_until = null,
      last_error = case when x.status = 'sent' then null else x.code end
    where id = x.outbox_id;
    updated := updated + 1;
  end loop;

  return updated;
end;
$$;

revoke execute on function public.claim_notification_batch(int, int, int) from public, anon, authenticated;
revoke execute on function public.report_notification_results(jsonb) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(int, int, int) to service_role;
grant execute on function public.report_notification_results(jsonb) to service_role;
