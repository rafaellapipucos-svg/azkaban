-- ADR-0010, section 14, SEG6-1. profiles.timezone only takes a name is_valid_timezone accepts (the list
-- tasks already use), so a POSIX string such as '<X>-13:37', which `at time zone` takes, never reaches the
-- days, the close job or the ranking. Invalid rows go back to the column's default first. The client
-- validates with Intl (timezoneSchema), so the error has no contract code.
update public.profiles set timezone = default where not public.is_valid_timezone(timezone);

create function public.profiles_check_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_check_timezone() from public, anon, authenticated;

create trigger profiles_check_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_check_timezone();
