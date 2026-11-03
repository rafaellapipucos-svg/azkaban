-- ADR-0009, sections 4 and 5. The phone, its verification, the WhatsApp consent and the daily summary,
-- next to the profile. Only the RPCs write the phone and the consent: no grant on them. The owner reads
-- the whole row, as before (whatsappStatusSchema, dailySummaryPreferencesSchema); co-members still see
-- only the display name, through group_member_profiles().
alter table public.profiles
  add column phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  add column phone_verified_at timestamptz,
  add column whatsapp_opt_in_at timestamptz,
  add column whatsapp_opt_in_version int check (whatsapp_opt_in_version >= 1),
  add column whatsapp_opt_out_at timestamptz,
  add column whatsapp_opt_out_source text check (whatsapp_opt_out_source in ('app', 'webhook')),
  -- Defaults from whatsappRules.dailySummary. On by default, but the job only looks at ready profiles.
  add column daily_summary_enabled boolean not null default true,
  add column daily_summary_time time not null default '08:00',
  add column daily_summary_include_overdue boolean not null default true,
  add column daily_summary_deadline_days smallint not null default 7
    check (daily_summary_deadline_days between 0 and 30),
  add column daily_summary_skip_empty boolean not null default true,
  -- The local date of the last summary the job handled. The system's, never the user's.
  add column daily_summary_last_date date,
  add constraint profiles_phone_pair_check
    check ((phone_e164 is null) = (phone_verified_at is null)),
  add constraint profiles_whatsapp_opt_in_pair_check
    check ((whatsapp_opt_in_at is null) = (whatsapp_opt_in_version is null)),
  add constraint profiles_whatsapp_opt_out_pair_check
    check ((whatsapp_opt_out_at is null) = (whatsapp_opt_out_source is null)),
  -- No consent without a verified phone.
  add constraint profiles_whatsapp_opt_in_phone_check
    check (whatsapp_opt_in_at is null or phone_verified_at is not null);

-- The PARAR lookup by the digits of the number.
create index profiles_phone_digits_idx on public.profiles (substr(phone_e164, 2))
  where phone_e164 is not null;

grant update (
  daily_summary_enabled, daily_summary_time, daily_summary_include_overdue,
  daily_summary_deadline_days, daily_summary_skip_empty
) on public.profiles to authenticated;
