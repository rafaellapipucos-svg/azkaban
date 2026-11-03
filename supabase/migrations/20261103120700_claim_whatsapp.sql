-- ADR-0009, sections 2, 5 and 9. The claim learns WhatsApp and the daily summary, and hands the push the
-- deadline of the red; the report records what the provider accepted.

-- The time zone of a profile, or the column's default when Postgres does not know the name:
-- profiles.timezone has no check of its own, and one bad name must not stop a queue or a job.
-- ponytail: not is_valid_timezone, whose scan of pg_timezone_names costs ~18 ms a call, too much for
-- every profile every minute. A name Postgres takes and Intl does not (a POSIX string) only fails that
-- user's own item in the dispatcher.
create function public.profile_timezone(p_timezone text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  perform now() at time zone p_timezone;
  return coalesce(p_timezone, 'America/Sao_Paulo');
exception when invalid_parameter_value then
  return 'America/Sao_Paulo';
end;
$$;

-- What the daily summary of p_user tells for p_local_date (dailySummarySourceSchema), read with the access
-- of the bell: occurrences the user is responsible for, of tasks not archived that the user still sees.
-- The same buckets as "Hoje" (QA4-1), without the manage_group exception:
--   overdue   pending past overdue_at, or missed still inside lateCompletionWindowHours; null when off;
--   today     pending, not overdue, whose day in the zone is p_local_date (a deadline by its due day);
--   deadlines pending deadline tasks due after p_local_date and within daily_summary_deadline_days.
-- Each list cut by whatsappRules.dailySummary.maxItems; totals has the full counts. streak waits for
-- Phase 6. ponytail: scans the user's open occurrences; a lower bound on the start if that ever weighs.
create function public.daily_summary_source(p_user uuid, p_timezone text, p_local_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with prefs as (
    select p.daily_summary_include_overdue as include_overdue, p.daily_summary_deadline_days as days,
      public.whatsapp_rules() -> 'dailySummary' -> 'maxItems' as max_items,
      make_interval(hours => (public.task_rules() ->> 'lateCompletionWindowHours')::int) as late_window
    from public.profiles p
    where p.id = p_user
  ),
  base as (
    select o.id, o.status, o.scheduled_start, o.scheduled_due, t.schedule_type,
      jsonb_build_object(
        'occurrenceId', o.id,
        'title', t.title,
        'areaI18nKey', a.i18n_key,
        'contextName', c.name,
        'scheduleType', t.schedule_type,
        'startAt', o.scheduled_start,
        'dueAt', case when t.schedule_type = 'deadline' then o.scheduled_due end
      ) as item,
      ((case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end)
        at time zone p_timezone)::date as day,
      o.overdue_at < now()
        and (o.status = 'pending' or now() <= o.overdue_at + prefs.late_window) as overdue
    from prefs
    cross join public.task_occurrences o
    join public.tasks t on t.id = o.task_id
    join public.contexts c on c.id = t.context_id
    join public.areas a on a.id = c.area_id
    where o.assignee_id = p_user
      and o.status in ('pending', 'missed')
      and t.archived_at is null
      and public.can_view_task_for(p_user, t)
  ),
  lists as (
    select 'today' as list, b.item, row_number() over (order by b.scheduled_start, b.id) as n
    from base b
    where b.status = 'pending' and not b.overdue and b.day = p_local_date
    union all
    select 'overdue', b.item, row_number() over (order by b.scheduled_start, b.id)
    from base b, prefs
    where b.overdue and prefs.include_overdue
    union all
    select 'deadlines', b.item, row_number() over (order by b.scheduled_due, b.id)
    from base b, prefs
    where b.schedule_type = 'deadline' and b.status = 'pending' and not b.overdue
      and b.day > p_local_date and b.day <= p_local_date + prefs.days
  )
  select jsonb_build_object(
    'localDate', p_local_date,
    'timezone', p_timezone,
    'today', (select coalesce(jsonb_agg(l.item order by l.n), '[]') from lists l
      where l.list = 'today' and l.n <= (prefs.max_items ->> 'today')::int),
    'overdue', case when prefs.include_overdue then (select coalesce(jsonb_agg(l.item order by l.n), '[]') from lists l
      where l.list = 'overdue' and l.n <= (prefs.max_items ->> 'overdue')::int) end,
    'deadlines', (select coalesce(jsonb_agg(l.item order by l.n), '[]') from lists l
      where l.list = 'deadlines' and l.n <= (prefs.max_items ->> 'deadlines')::int),
    'deadlineDays', prefs.days,
    'totals', jsonb_build_object(
      'today', (select count(*) from lists l where l.list = 'today'),
      'overdue', (select count(*) from lists l where l.list = 'overdue'),
      'deadlines', (select count(*) from lists l where l.list = 'deadlines')
    ),
    'streak', null
  )
  from prefs;
$$;

-- Nothing to tell: every list of the source is empty.
create function public.daily_summary_is_empty(p_source jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_source -> 'totals' ->> 'today')::int = 0
    and (p_source -> 'totals' ->> 'overdue')::int = 0
    and (p_source -> 'totals' ->> 'deadlines')::int = 0;
$$;

drop function public.claim_notification_batch(int, int, int);

-- As before (20261102131000), plus:
--   - p_channels: only rows of the channels the function can send in this run. Without VAPID, push waits
--     and WhatsApp goes on. The default keeps a dispatcher that only knows push working;
--   - daily_summary expires at scheduled_for + whatsappRules.dailySummary.catchUpMinutes, not
--     p_max_delay_hours: a morning summary delivered at night is no use;
--   - whatsapp: a profile no longer ready (opt-out, number removed or changed) is cancelled with
--     whatsapp_not_ready, and a type outside notificationRules.whatsappTypes with
--     whatsapp_type_not_allowed;
--   - daily_summary skips quiet hours (it has its own time), and with daily_summary_skip_empty and nothing
--     to tell at send time is cancelled with summary_empty.
-- Each item gains timezone (of the profile), overdueAt and occurrenceStatus (of the occurrence, null
-- without one), phone (E.164, only on whatsapp, else null) and summary (dailySummarySourceSchema, only for
-- daily_summary, else null).
create function public.claim_notification_batch(
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
      'taskTitle', r.title,
      'requiresPhotoProof', coalesce(r.requires_photo_proof, false),
      'overdueAt', r.overdue_at,
      'occurrenceStatus', r.occurrence_status,
      'attempts', r.attempts + 1,
      'scheduledFor', r.scheduled_for,
      'subscriptions', case when r.channel = 'web_push' then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth
        ) order by s.created_at), '[]')
        from public.push_subscriptions s where s.user_id = r.user_id
      ) else '[]'::jsonb end,
      'phone', case when r.channel = 'whatsapp' then r.phone_e164 end,
      'summary', summary
    );
  end loop;

  return jsonb_build_object('items', items, 'expired', expired, 'cancelled', cancelled, 'deferred', deferred);
end;
$$;

-- As before (20261102131000), plus: a sent whatsapp row may carry
--   whatsapp: { providerMessageId, waId, template, provider? }
-- and gets its line in whatsapp_messages (purpose notification, status accepted) in the same transaction.
-- provider is console or meta; without it, a console.<uuid> id is the console's. A bad waId or template is
-- stored as null rather than failing the report, which would send the message again; a repeated id is
-- skipped.
create or replace function public.report_notification_results(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  owner uuid;
  ch public.delivery_channel;
  message_id text;
  updated int := 0;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  for x in
    select (e ->> 'outboxId')::uuid as outbox_id, e ->> 'status' as status, left(e ->> 'code', 64) as code,
      (e ->> 'retryAfterSeconds')::int as retry_after,
      coalesce(e -> 'deliveredSubscriptionIds', '[]') as delivered,
      coalesce(e -> 'goneSubscriptionIds', '[]') as gone,
      case when jsonb_typeof(e -> 'whatsapp') = 'object' then e -> 'whatsapp' end as wa
    from jsonb_array_elements(p_results) e
  loop
    if x.status is null or x.status not in ('sent', 'retry', 'failed') then
      raise exception 'invalid_argument' using errcode = '22023';
    end if;

    select user_id, channel into owner, ch from public.notification_outbox
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

    message_id := x.wa ->> 'providerMessageId';
    if x.status = 'sent' and ch = 'whatsapp' and char_length(message_id) between 1 and 128 then
      insert into public.whatsapp_messages (
        user_id, outbox_id, purpose, template, provider, provider_message_id, recipient_wa_id
      ) values (
        owner, x.outbox_id, 'notification',
        case when char_length(x.wa ->> 'template') <= 512 and x.wa ->> 'template' ~ '^[a-z0-9_]+$'
          then x.wa ->> 'template' end,
        case when x.wa ->> 'provider' in ('console', 'meta') then x.wa ->> 'provider'
          when message_id like 'console.%' then 'console' else 'meta' end,
        message_id,
        case when x.wa ->> 'waId' ~ '^[0-9]{6,15}$' then x.wa ->> 'waId' end
      )
      on conflict (provider_message_id) do nothing;
    end if;
  end loop;

  return updated;
end;
$$;

revoke execute on function public.profile_timezone(text) from public, anon, authenticated;
revoke execute on function public.daily_summary_source(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.daily_summary_is_empty(jsonb) from public, anon, authenticated;
revoke execute on function public.claim_notification_batch(int, int, int, text[]) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(int, int, int, text[]) to service_role;
