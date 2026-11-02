-- ADR-0008, sections 3 and 5. Quiet hours in the profile's time zone, next to it. The defaults are
-- notificationRules.defaultQuietHours, and adding the columns with them fills the existing rows too.
-- Both null means none; a window may cross midnight but cannot be empty (quietHoursSchema).
-- group_member_profiles() returns only the display name, so co-members never see them.
alter table public.profiles
  add column quiet_hours_start time default '22:00',
  add column quiet_hours_end time default '07:00',
  add constraint profiles_quiet_hours_check check (
    (quiet_hours_start is null and quiet_hours_end is null)
    or (quiet_hours_start is not null and quiet_hours_end is not null
      and quiet_hours_start <> quiet_hours_end)
  );

grant update (quiet_hours_start, quiet_hours_end) on public.profiles to authenticated;
