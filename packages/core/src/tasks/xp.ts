import type { OccurrenceStatus, TaskDifficulty } from '@azkaban/contracts';

/** Same shape as `taskRules.xp` in config, which core does not import. */
export type XpRules = {
  status: { done: number; done_late: number; partial: number; missed: number };
  difficultyWeight: Record<TaskDifficulty, number>;
};

/**
 * XP an occurrence is worth in its current state, for display only: the database writes the
 * events (ADR-0005 section 6). It is `status x difficultyWeight`. A late `done` uses `done_late`;
 * a late `partial` keeps the `partial` value. Pending and cancelled are worth zero, which is also
 * what reopening gives back through the compensating event.
 */
export function occurrenceXp(
  occurrence: { status: OccurrenceStatus; late: boolean; difficulty: TaskDifficulty },
  rules: XpRules,
): number {
  const { status, late, difficulty } = occurrence;
  let base = 0;
  if (status === 'done') base = late ? rules.status.done_late : rules.status.done;
  else if (status === 'partial') base = rules.status.partial;
  else if (status === 'missed') base = rules.status.missed;
  return base * rules.difficultyWeight[difficulty];
}
