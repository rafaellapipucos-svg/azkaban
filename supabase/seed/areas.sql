insert into public.areas (key, i18n_key, icon, color_token, sort_order) values
  ('work', 'areas.work', '💼', 'violet', 1),
  ('home', 'areas.home', '🏠', 'teal', 2)
on conflict (key) do nothing;
