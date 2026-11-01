-- ADR-0007, section 9: the reviewer of a proof is a new actor. It acts only through review_proof,
-- which writes the occurrence itself, so set_occurrence_status never lists it. The value cannot be
-- used in the transaction that creates it, so the transitions that name it are the next migrations.
alter type public.occurrence_actor add value 'reviewer';
