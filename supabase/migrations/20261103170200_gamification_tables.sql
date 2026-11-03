-- ADR-0010, sections 4, 5 and 7. Caches derived from xp_events and the occurrences, written only by
-- security definer functions and triggers. The owner reads its own rows; nobody else, the admin included.
-- achievements is readable by any signed-in user. Everything cascades with the profile (LGPD).
create table public.user_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  total_xp int not null default 0,
  current_streak int not null default 0 check (current_streak >= 0),
  best_streak int not null default 0 check (best_streak >= 0),
  streak_freezes int not null default 0 check (streak_freezes >= 0),
  perfect_run int not null default 0 check (perfect_run >= 0),
  last_closed_date date,
  updated_at timestamptz not null default now()
);

-- One local day of the profile, with its counts and the streak state after it. No row: nothing planned.
create table public.user_day_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  planned int not null default 0 check (planned >= 0),
  done int not null default 0 check (done >= 0),
  partial int not null default 0 check (partial >= 0),
  missed int not null default 0 check (missed >= 0),
  goal_met boolean not null default false,
  perfect boolean not null default false,
  freeze_used boolean not null default false,
  streak int not null default 0 check (streak >= 0),
  freezes int not null default 0 check (freezes >= 0),
  perfect_run int not null default 0 check (perfect_run >= 0),
  primary key (user_id, local_date)
);

-- Texts live in i18n under gamification:achievements.<key>. A new kind is code here and in the contract.
create table public.achievements (
  key text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  kind text not null check (kind in ('occurrences_done', 'streak_days', 'proofs', 'perfect_run')),
  threshold int not null check (threshold >= 1),
  icon text not null check (char_length(icon) between 1 and 16),
  sort_order int not null default 0
);

-- Granted once, never revoked.
create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_key text not null references public.achievements (key) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

-- The seed of section 5, in the migration so the hosted project gets it too.
insert into public.achievements (key, kind, threshold, icon, sort_order) values
  ('first_task', 'occurrences_done', 1, '🌱', 1),
  ('streak_7', 'streak_days', 7, '🔥', 2),
  ('streak_30', 'streak_days', 30, '🏆', 3),
  ('proofs_100', 'proofs', 100, '📸', 4),
  ('perfect_week', 'perfect_run', 7, '⭐', 5);

alter table public.user_stats enable row level security;
alter table public.user_day_stats enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

create policy user_stats_select on public.user_stats
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_day_stats_select on public.user_day_stats
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_achievements_select on public.user_achievements
  for select to authenticated using (user_id = (select auth.uid()));
create policy achievements_select on public.achievements
  for select to authenticated using (true);

revoke all on public.user_stats, public.user_day_stats, public.achievements, public.user_achievements
  from anon, authenticated;
grant select on public.user_stats, public.user_day_stats, public.achievements, public.user_achievements
  to authenticated;
