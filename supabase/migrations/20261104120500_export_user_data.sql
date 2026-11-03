-- ADR-0012, section 2. What account-export puts in `sections`, in the order of accountExportSections,
-- each an array of rows with the database's columns minus the ones the ADR leaves out. Service role only:
-- RLS hides on purpose what the export needs (a proof of an ex-member, phone_verifications,
-- whatsapp_messages, auth.users). Returns { sections, photoPaths }: every proof row has photo_url null,
-- and photoPaths maps the proof id to its Storage path for the function to sign; the path itself never
-- goes in the file. A photo the retention already deleted has no path and keeps photo_url null.
create function public.export_user_data(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sections jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;

  sections := jsonb_build_object(
    'account', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
        'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at))
      from auth.users u where u.id = p_user), '[]'::jsonb),
    'profile', coalesce((
      select jsonb_agg(to_jsonb(p)) from public.profiles p where p.id = p_user), '[]'::jsonb),
    'proof_consents', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.accepted_at, c.id)
      from public.proof_consents c where c.user_id = p_user), '[]'::jsonb),
    'group_memberships', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object('group_name', g.name, 'group_type', g.type)
        order by m.joined_at, m.group_id)
      from public.group_members m join public.groups g on g.id = m.group_id
      where m.user_id = p_user), '[]'::jsonb),
    'owned_groups', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at, g.id)
      from public.groups g where g.owner_id = p_user), '[]'::jsonb),
    -- The code is the group's credential and may still be valid.
    'created_invites', coalesce((
      select jsonb_agg(to_jsonb(i) - 'code' order by i.created_at, i.id)
      from public.group_invites i where i.created_by = p_user), '[]'::jsonb),
    'contexts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.contexts c where c.owner_user_id = p_user or c.created_by = p_user), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
      from public.tasks t where t.assignee_id = p_user or t.created_by = p_user), '[]'::jsonb),
    'occurrences', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.scheduled_start, o.id)
      from public.task_occurrences o where o.assignee_id = p_user), '[]'::jsonb),
    'status_history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.changed_at, h.id)
      from public.task_status_history h
      where h.changed_by = p_user
        or exists (select 1 from public.task_occurrences o where o.id = h.occurrence_id and o.assignee_id = p_user)
    ), '[]'::jsonb),
    'rule_changes', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.changed_at, r.id)
      from public.task_rule_changes r where r.changed_by = p_user), '[]'::jsonb),
    'proofs', coalesce((
      select jsonb_agg((to_jsonb(p) - 'storage_path') || jsonb_build_object('photo_url', null)
        order by p.received_at, p.id)
      from public.task_proofs p where p.user_id = p_user), '[]'::jsonb),
    -- Someone else's proof: only the decision, never the author, the photo, the hash or the flags.
    'proof_reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'occurrence_id', p.occurrence_id,
        'review_status', p.review_status, 'reviewed_at', p.reviewed_at, 'review_note', p.review_note)
        order by p.reviewed_at, p.id)
      from public.task_proofs p
      where p.reviewed_by = p_user and p.user_id is distinct from p_user), '[]'::jsonb),
    'xp_events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
      from public.xp_events x where x.user_id = p_user), '[]'::jsonb),
    'user_stats', coalesce((
      select jsonb_agg(to_jsonb(s)) from public.user_stats s where s.user_id = p_user), '[]'::jsonb),
    'user_day_stats', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.local_date)
      from public.user_day_stats d where d.user_id = p_user), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.granted_at, a.achievement_key)
      from public.user_achievements a where a.user_id = p_user), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at, n.id)
      from public.notifications n where n.user_id = p_user), '[]'::jsonb),
    'notification_preferences', coalesce((
      select jsonb_agg(to_jsonb(np) order by np.type, np.channel)
      from public.notification_preferences np where np.user_id = p_user), '[]'::jsonb),
    -- Together, endpoint and keys send a push to the device: only the host of the service goes.
    'push_subscriptions', coalesce((
      select jsonb_agg((to_jsonb(s) - 'endpoint' - 'p256dh' - 'auth')
        || jsonb_build_object('endpoint_host', public.push_endpoint_host(s.endpoint))
        order by s.created_at, s.id)
      from public.push_subscriptions s where s.user_id = p_user), '[]'::jsonb),
    'phone_verifications', coalesce((
      select jsonb_agg(to_jsonb(v) - 'code_hash' order by v.created_at, v.id)
      from public.phone_verifications v where v.user_id = p_user), '[]'::jsonb),
    'whatsapp_messages', coalesce((
      select jsonb_agg(to_jsonb(w) order by w.created_at, w.id)
      from public.whatsapp_messages w where w.user_id = p_user), '[]'::jsonb),
    'shopping_lists', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at, l.id)
      from public.shopping_lists l
      where l.owner_user_id = p_user
        or (l.group_id is not null and (l.created_by = p_user or l.completed_by = p_user))
    ), '[]'::jsonb),
    'shopping_list_items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.added_at, i.id)
      from public.shopping_list_items i join public.shopping_lists l on l.id = i.list_id
      where l.owner_user_id = p_user
        or (l.group_id is not null and (i.added_by = p_user or i.checked_by = p_user))
    ), '[]'::jsonb),
    'shopping_catalog_items', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order, c.id)
      from public.shopping_catalog_items c where c.owner_user_id = p_user), '[]'::jsonb)
  );

  return jsonb_build_object(
    'sections', sections,
    'photoPaths', coalesce((
      select jsonb_object_agg(p.id, p.storage_path)
      from public.task_proofs p where p.user_id = p_user and p.storage_path is not null
    ), '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.export_user_data(uuid) from public, anon, authenticated;
grant execute on function public.export_user_data(uuid) to service_role;
