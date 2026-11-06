-- The areas are reference data the app needs to create a context. supabase/seed only runs on the
-- local db reset, so the hosted project was left without them; the rows now come with the schema.
insert into public.areas (key, i18n_key, icon, color_token, sort_order) values
  ('work', 'areas.work', '💼', 'violet', 1),
  ('home', 'areas.home', '🏠', 'teal', 2)
on conflict (key) do nothing;
