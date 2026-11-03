-- ADR-0010, section 8. The CelebrationHost listens to its own inserts. Realtime delivers a row only to
-- whoever the select policy lets read it, and both policies are the owner's (xp_events_select,
-- user_achievements_select).
alter publication supabase_realtime add table public.xp_events, public.user_achievements;
