-- BL-33, ADR-0010 section 14 (SEG6-6, corrected). Realtime sends a DELETE to every subscriber of the
-- table, without RLS, with the replica identity of the row. The default identity is the primary key, so
-- a cascade from a deleted account used to carry (user_id, achievement_key). With an opaque id as the
-- key, as in xp_events, the DELETE carries only that id. The pair stays unique, so a grant is still
-- once, and the unique index serves the lookups by user_id and the cascade.
alter table public.user_achievements
  add column id uuid not null default gen_random_uuid(),
  drop constraint user_achievements_pkey,
  add constraint user_achievements_pkey primary key (id),
  add constraint user_achievements_user_id_achievement_key_key unique (user_id, achievement_key);

-- The default, said out loud: a "full" identity would put user_id back in the DELETE.
alter table public.user_achievements replica identity default;
