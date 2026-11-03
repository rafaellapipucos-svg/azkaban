import { execSync } from 'node:child_process';

// pg_cron runs the clock jobs of ADR-0008 in the local stack too: a reminder (every minute) or an
// automatic red (every 5 minutes) could land in the middle of any spec, depending on the hour it runs,
// and add a notice or a red the spec did not ask for. They stay off for the run;
// `notifications-jobs.spec.ts` calls both directly, last (see the projects in playwright.config.ts).
// ponytail: a run killed before the teardown leaves them off until the next run or `supabase db reset`.
const JOBS = ['enqueue-due-reminders', 'auto-miss-occurrences'];

const setJobs = (active: boolean) =>
  execSync(
    `pnpm exec supabase db query --local "select cron.alter_job(jobid, active := ${active}) from cron.job where jobname in (${JOBS.map((job) => `'${job}'`).join(', ')})"`,
    { stdio: 'pipe' },
  );

export default function globalSetup() {
  setJobs(false);
  return () => {
    setJobs(true);
  };
}
