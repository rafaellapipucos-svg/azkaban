-- ADR-0007, section 13. The photos bucket: private, with the limits of proofRules as a second barrier
-- after the function (mirrored and compared by `pnpm db:check-permissions`). There is deliberately
-- no policy on storage.objects for it. With RLS on and no policy, anon and authenticated cannot insert,
-- read, overwrite or delete an object: only proof-validate writes, with the service role, and
-- proof-url hands out a signed URL that lives 60 seconds.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-proofs', 'task-proofs', false, 2097152, '{image/jpeg}')
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
