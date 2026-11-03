-- ADR-0011, section 7. postgres_changes, as the bell: Realtime checks the select policy of each table for
-- each subscriber, as that subscriber, and both policies go through can_view_shopping_list (the owner of a
-- personal list, or a member of the list's group). A DELETE reaches every subscriber with the id only,
-- so replica identity stays the default. The catalog stays out: it is read again on opening.
alter publication supabase_realtime add table public.shopping_lists, public.shopping_list_items;
