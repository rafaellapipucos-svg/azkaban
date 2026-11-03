-- ADR-0012, section 6. The claim checks the acceptance again, so a nonce issued a minute before a
-- revocation does not carry a photo sent after it. Same body as migration 171700, plus that check,
-- made before the nonce is marked used. proof-validate already maps proof_consent_required to 403.
create or replace function public.claim_proof_challenge(p_nonce uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.proof_challenges;
  occ public.task_occurrences;
  ctx public.contexts;
  consent int;
  received timestamptz := now();
begin
  -- Another user's nonce looks like one that does not exist.
  select * into ch from public.proof_challenges where id = p_nonce and user_id = p_user_id;
  if not found then
    raise exception 'challenge_invalid' using errcode = 'P0001';
  end if;

  select p.proof_consent_version into consent from public.profiles p where p.id = p_user_id;
  if consent is null or consent < (public.proof_rules() ->> 'consentVersion')::int then
    raise exception 'proof_consent_required' using errcode = 'P0001';
  end if;

  update public.proof_challenges
  set used_at = received
  where id = p_nonce and user_id = p_user_id and used_at is null and expires_at > received
  returning * into ch;

  if not found then
    select * into ch from public.proof_challenges where id = p_nonce;
    if ch.used_at is not null then
      raise exception 'challenge_used' using errcode = 'P0001';
    end if;
    raise exception 'challenge_expired' using errcode = 'P0001';
  end if;

  select * into occ from public.task_occurrences where id = ch.occurrence_id;
  perform public.proof_assert_open(occ, p_user_id, ch.created_at, received);

  select c.* into ctx
  from public.tasks t join public.contexts c on c.id = t.context_id
  where t.id = occ.task_id;

  return jsonb_build_object(
    'occurrenceId', occ.id,
    'challengeCreatedAt', ch.created_at,
    'receivedAt', received,
    'location', case
      when ctx.location_lat is null then null
      else jsonb_build_object('lat', ctx.location_lat, 'lng', ctx.location_lng, 'radiusM', ctx.location_radius_m)
    end
  );
end;
$$;

revoke execute on function public.claim_proof_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_proof_challenge(uuid, uuid) to service_role;
