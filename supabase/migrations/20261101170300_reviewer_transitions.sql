-- Mirrored in packages/contracts/src/occurrence-transitions.ts. ADR-0007, section 9. A dispute leaves
-- done for partial or missed, and undoing it comes back; only review_proof acts as the reviewer.
-- The trigger adds the proof conditions to each of these pairs.
insert into public.occurrence_transitions (from_status, to_status, actor) values
  ('missed', 'done', 'reviewer'),
  ('done', 'partial', 'reviewer'),
  ('done', 'missed', 'reviewer'),
  ('partial', 'done', 'reviewer');
