-- ADR-0010, section 1. Four new reasons at once (shopping_completed is reserved for Phase 7), and
-- local_date, filled exactly on the two reasons of the perfect day. The indexes serve the daily cap
-- (user, created_at), the ranking (group, created_at) and the balance of a perfect day (user, local_date).
alter table public.xp_events add column local_date date;

alter table public.xp_events drop constraint xp_events_reason_check;
alter table public.xp_events add constraint xp_events_reason_check check (reason in (
  'occurrence_done', 'occurrence_done_late', 'occurrence_partial', 'occurrence_reverted',
  'proof_bonus', 'perfect_day', 'perfect_day_reverted', 'shopping_completed'
));
alter table public.xp_events add constraint xp_events_local_date_check
  check ((reason in ('perfect_day', 'perfect_day_reverted')) = (local_date is not null));

drop index public.xp_events_user_id_idx;
create index xp_events_user_created_idx on public.xp_events (user_id, created_at);
create index xp_events_group_created_idx on public.xp_events (group_id, created_at) where group_id is not null;
create index xp_events_user_local_date_idx on public.xp_events (user_id, local_date) where local_date is not null;
