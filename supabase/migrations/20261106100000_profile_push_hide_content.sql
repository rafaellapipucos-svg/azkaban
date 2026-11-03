-- BL-32, ADR-0008 sections 9 and 16 item 8. Hide the content of the push on the lock screen: a neutral
-- title and body, the detail only on opening. Off by default (the human's decision of 2026-11-03), next
-- to the quiet hours. The owner reads and writes it through profiles_select_own and profiles_update_own;
-- group_member_profiles() returns only the display name, so co-members never see it.
alter table public.profiles
  add column push_hide_content boolean not null default false;

grant update (push_hide_content) on public.profiles to authenticated;
