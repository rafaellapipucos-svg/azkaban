import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// pg_cron runs the clock jobs of ADR-0008 in the local stack too: a reminder (every minute) or an
// automatic red (every 5 minutes) could land in the middle of any spec, depending on the hour it runs,
// and add a notice or a red the spec did not ask for. The daily summary (ADR-0009) likewise sends to
// any ready profile whose time matches the minute. Closing the gamification days (ADR-0010, every 15
// minutes) refreshes every profile past midnight and could add a perfect day or break a streak a spec
// is reading. They stay off for the run;
// `notifications-jobs.spec.ts` calls the first two directly, last (see the projects in
// playwright.config.ts), and `whatsapp.spec.ts` calls the summary job for its own profile.
// They come back on in the teardown, which Playwright runs after failures and after a Ctrl+C, and
// again on the process's `exit` and on SIGTERM/SIGHUP/SIGBREAK (a closed terminal, a CI cancel).
// ponytail: a kill no handler sees (`taskkill /F`, power loss) still leaves them off until the next
// run's teardown or `supabase db reset`.
const JOBS = [
  'enqueue-due-reminders',
  'auto-miss-occurrences',
  'enqueue-daily-summaries',
  'close-gamification-days',
];

const setJobs = (active: boolean) =>
  execSync(
    `pnpm exec supabase db query --local "select cron.alter_job(jobid, active := ${active}) from cron.job where jobname in (${JOBS.map((job) => `'${job}'`).join(', ')})"`,
    { stdio: 'pipe' },
  );

// Port 8091, the mail on 54424 and `apps/app/.env.development.local` belong to stack A: with stack B
// switched on in this checkout (docs/agentes/ferramentas/pilha-b.sh), the run would talk to A.
function assertStackA() {
  const projectId = /^project_id\s*=\s*"([^"]*)"/m.exec(
    readFileSync('supabase/config.toml', 'utf8'),
  )?.[1];
  if (projectId !== 'azkaban')
    throw new Error(
      `A E2E só roda na pilha A: supabase/config.toml tem project_id "${projectId}", e não "azkaban". Volte o config.toml para a pilha A neste checkout antes de rodar.`,
    );
}

export default function globalSetup() {
  assertStackA();
  let off = true;
  const restore = () => {
    if (!off) return;
    off = false;
    setJobs(true);
  };
  // `exit` listeners must be synchronous, as `execSync` is; there the error can only be logged.
  process.once('exit', () => {
    try {
      restore();
    } catch (error) {
      console.error('global-setup: could not switch the cron jobs back on', error);
    }
  });
  // These end the process without `exit` unless someone listens: switch back on, then end it as a
  // failed run (Windows cannot re-raise them). SIGINT stays with Playwright, which stops the run and
  // calls the teardown below.
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
    process.once(signal, () => {
      try {
        restore();
      } finally {
        process.exit(1);
      }
    });
  }
  setJobs(false);
  return restore;
}
