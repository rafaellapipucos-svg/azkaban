-- ADR-0011, section 16, SEG7-3. Shopping text goes out of the app, assembled, by another member's hand:
-- no control characters (C0, DEL and C1), no line or paragraph separators, no direction controls. The
-- same set as shoppingControlCharacterPattern, as an explicit class: [[:cntrl:]] depends on the locale.
-- U+0000 never reaches a text column. ZWJ and U+FE0F stay: they build emojis. Validated on purpose: a row
-- out of the rule should fail this migration.
alter table public.shopping_catalog_items
  add constraint shopping_catalog_items_name_plain_check
    check (name !~ '[\u0001-\u001f\u007f-\u009f  ‪-‮⁦-⁩]'),
  add constraint shopping_catalog_items_emoji_plain_check
    check (emoji !~ '[\u0001-\u001f\u007f-\u009f  ‪-‮⁦-⁩]');

alter table public.shopping_lists
  add constraint shopping_lists_name_plain_check
    check (name !~ '[\u0001-\u001f\u007f-\u009f  ‪-‮⁦-⁩]');

alter table public.shopping_list_items
  add constraint shopping_list_items_name_plain_check
    check (name !~ '[\u0001-\u001f\u007f-\u009f  ‪-‮⁦-⁩]'),
  add constraint shopping_list_items_note_plain_check
    check (note !~ '[\u0001-\u001f\u007f-\u009f  ‪-‮⁦-⁩]'),
  add constraint shopping_list_items_emoji_plain_check
    check (emoji !~ '[\u0001-\u001f\u007f-\u009f  ‪-‮⁦-⁩]');
