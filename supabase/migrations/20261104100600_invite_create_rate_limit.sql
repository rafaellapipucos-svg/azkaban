-- ADR-0012, section 4. Every insert in group_invites by a user counts.
create trigger group_invites_rate_limit
  before insert on public.group_invites
  for each row execute function public.consume_rate_limit_on_insert('invite_create');
