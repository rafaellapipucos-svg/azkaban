-- tasks.rrule held anything up to 500 characters, so any account could store FREQ=SECONDLY or a BYHOUR
-- that puts the end before the start. The column now takes exactly what toRRule and splitRecurrence
-- (packages/core/src/recurrence) write, in their order, and nothing else:
--   FREQ=DAILY
--   FREQ=WEEKLY;BYDAY=<days>              Monday-first, no repeats, as toRRule sorts them
--   FREQ=MONTHLY;BYMONTHDAY=<1-28>        or 28,29[,30[,31]];BYSETPOS=-1 for the last of those days
-- with INTERVAL=2..99 right after FREQ (1 is never written) and at the end COUNT=1..730 or UNTIL=<UTC>.
-- The RPCs call the same function, so a bad rule fails early with a clear message.
create function public.is_valid_rrule(p_rrule text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  every constant text := '(;INTERVAL=([2-9]|[1-9][0-9]))?';
  day constant text := '(MO|TU|WE|TH|FR|SA|SU)';
  ending constant text := '(;COUNT=([1-9]|[1-9][0-9]|[1-6][0-9]{2}|7[0-2][0-9]|730)'
    || '|;UNTIL=20[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3])[0-5][0-9][0-5][0-9]Z)?$';
  order_of constant text[] := array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  days text[];
  i int;
begin
  if p_rrule is null then
    return false;
  end if;

  if p_rrule ~ ('^FREQ=DAILY' || every || ending) then
    return true;
  end if;

  if p_rrule ~ ('^FREQ=WEEKLY' || every || ';BYDAY=' || day || '(,' || day || '){0,6}' || ending) then
    days := string_to_array(substring(p_rrule from ';BYDAY=([A-Z,]+)'), ',');
    for i in 2..array_length(days, 1) loop
      if array_position(order_of, days[i]) <= array_position(order_of, days[i - 1]) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  return p_rrule ~ (
    '^FREQ=MONTHLY' || every
    || ';BYMONTHDAY=(([1-9]|1[0-9]|2[0-8])|28,29(,30(,31)?)?;BYSETPOS=-1)' || ending
  );
end;
$$;

-- A column CHECK runs as the caller, so clients need to execute it.
revoke execute on function public.is_valid_rrule(text) from public, anon;
grant execute on function public.is_valid_rrule(text) to authenticated;

alter table public.tasks
  add constraint tasks_rrule_grammar_check check (rrule is null or public.is_valid_rrule(rrule));
