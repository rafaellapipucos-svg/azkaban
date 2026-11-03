-- ADR-0010, section 4. total_xp follows xp_events in the same insert. The row is born here or in the
-- close job, whichever comes first.
create function public.xp_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_stats as s (user_id, total_xp)
  values (new.user_id, new.amount)
  on conflict (user_id) do update set total_xp = s.total_xp + excluded.total_xp, updated_at = now();
  return new;
end;
$$;

revoke execute on function public.xp_events_after_insert() from public, anon, authenticated;

create trigger xp_events_after_insert
  after insert on public.xp_events
  for each row execute function public.xp_events_after_insert();
