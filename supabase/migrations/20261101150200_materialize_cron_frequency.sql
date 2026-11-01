-- materialize-occurrences handles at most 200 tasks (or 600 ms of expansion) per run, to stay under the
-- CPU limit of an Edge Function, oldest cursor first. Once a day that is 200 tasks a day; every 15
-- minutes it is about 19 thousand. A run with nothing to do skips tasks whose cursor is less than 12 h
-- from the limit, reads the list and answers { inserted: 0 } in about 15 ms, so the extra runs are cheap.
-- The job gets a name that no longer says "daily"; URL, secret and body are the same.
select cron.unschedule('materialize-occurrences-daily');

select cron.schedule(
  'materialize-occurrences',
  '*/15 * * * *',
  'select public.call_materialize_occurrences()'
);
