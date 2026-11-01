// Hourly job (ADR-0007, section 14): removes the photos past retention, keeps the rows, and sweeps what
// no row points to. Called by the cron job `proof-retention` with `x-cron-secret`, like
// materialize-occurrences. Every step is safe to repeat, and a run that dies halfway leaves the rest
// to the next one: the object is removed before its row is marked, so a proof whose mark was lost is
// due again, and removing an object that is already gone is not an error.
import { proofDefaults } from '@azkaban/config';
import { responder, sameSecret, serviceClient } from '../_shared/http.ts';

const BUCKET = 'task-proofs';
// Marking is one call per proof, which is I/O and not CPU. A group of these at a time keeps a full
// batch well under the 150 s idle limit, and the wall clock is bounded as well.
const MARK_CONCURRENCY = 10;
const MARK_BUDGET_MS = 90_000;

const reply = responder();

class DatabaseError extends Error {}
function check<T>(stage: string, result: { data: T; error: { code?: string } | null }): T {
  if (result.error) {
    // The stage and the code only: a message can quote a row.
    console.error(JSON.stringify({ event: 'retention_failed', stage, code: result.error.code }));
    throw new DatabaseError(stage);
  }
  return result.data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  try {
    // Only the cron job calls this, so there is no JWT path. A missing or wrong secret is refused the same.
    const given = req.headers.get('x-cron-secret');
    const expected = Deno.env.get('CRON_SECRET');
    if (given === null || !expected || !(await sameSecret(given, expected))) {
      return reply(401, { error: 'unauthorized' });
    }

    const admin = serviceClient();
    const storage = admin.storage.from(BUCKET);
    const limit = proofDefaults.retentionBatchSize;
    const began = performance.now();

    // 1 and 2. The photos past retention. Remove first, mark after.
    const due = check('due', await admin.rpc('proofs_due_for_retention', { p_limit: limit })) as {
      proof_id: string;
      storage_path: string | null;
    }[];
    const paths = due.flatMap((p) => (p.storage_path ? [p.storage_path] : []));
    if (paths.length > 0) check('remove', await storage.remove(paths));

    // 3. Each mark approves a proof still in review (once) and clears the personal fields.
    let marked = 0;
    for (
      let i = 0;
      i < due.length && performance.now() - began < MARK_BUDGET_MS;
      i += MARK_CONCURRENCY
    ) {
      const group = due.slice(i, i + MARK_CONCURRENCY);
      await Promise.all(
        group.map(async (p) =>
          check('mark', await admin.rpc('mark_proof_photo_deleted', { p_proof_id: p.proof_id })),
        ),
      );
      marked += group.length;
    }

    // 4. Objects with no row and more than 24 hours old, then the challenges nobody used.
    const orphans = check(
      'orphans',
      await admin.rpc('orphan_proof_objects', { p_limit: limit }),
    ) as { name: string }[];
    if (orphans.length > 0)
      check('remove_orphans', await storage.remove(orphans.map((o) => o.name)));
    const challenges = check(
      'challenges',
      await admin.rpc('delete_stale_proof_challenges'),
    ) as number;

    // Counts only: no path, name or id.
    const totals = {
      photosRemoved: paths.length,
      proofsMarked: marked,
      orphansRemoved: orphans.length,
      challengesDeleted: challenges,
      // A full batch means there may be more, and the next run takes it.
      moreDue: due.length === limit || marked < due.length || orphans.length === limit,
    };
    console.log(
      JSON.stringify({
        event: 'retention_done',
        ...totals,
        ms: Math.round(performance.now() - began),
      }),
    );
    return reply(200, totals);
  } catch {
    console.error(JSON.stringify({ event: 'unexpected' }));
    return reply(500, { error: 'internal' });
  }
});
