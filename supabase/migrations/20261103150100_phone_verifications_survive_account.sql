-- SEG5-4. Deleting the account deleted its codes, and with them the per-number send limit: create, ask 5
-- codes for X, delete, repeat. The rows now outlive the user, with user_id null, until the 48-hour
-- retention, so the number keeps its count. The per-user limit and the confirmation only read rows of a
-- user, and a null one matches nobody.
alter table public.phone_verifications
  alter column user_id drop not null,
  drop constraint phone_verifications_user_id_fkey,
  add constraint phone_verifications_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;
