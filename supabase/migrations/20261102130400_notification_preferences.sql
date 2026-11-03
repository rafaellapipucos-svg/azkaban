-- ADR-0008, section 3. One row per type and channel the user chose. No row means
-- notificationRules.defaultChannels, read by enqueue_notification.
create table public.notification_preferences (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  channel public.delivery_channel not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type, channel)
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notification_preferences_delete_own on public.notification_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.notification_preferences from anon, authenticated;
grant select, delete on public.notification_preferences to authenticated;
-- user_id comes from the default. An upsert sets the three columns again, so update has them too.
grant insert (type, channel, enabled) on public.notification_preferences to authenticated;
grant update (type, channel, enabled) on public.notification_preferences to authenticated;

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
