// Type-only imports: `pnpm db:check-permissions` loads this file directly in Node.
import type { OccurrenceActor, OccurrenceStatus } from './tasks';

/**
 * Every allowed status change and who may make it. Mirrored in public.occurrence_transitions.
 * Reversals exist so that a wrong tap can be undone; XP is compensated, never edited (ADR-0005).
 * `reviewer` is a dispute, or undoing one, and only the `review_proof` RPC acts as it. On a task
 * with photo proof, reaching `done` also needs a current proof (ADR-0007).
 */
export const occurrenceTransitions = [
  { from: 'pending', to: 'done', actors: ['assignee', 'editor'] },
  { from: 'pending', to: 'partial', actors: ['assignee', 'editor'] },
  { from: 'pending', to: 'missed', actors: ['assignee', 'editor', 'system'] },
  { from: 'pending', to: 'cancelled', actors: ['deleter'] },
  { from: 'missed', to: 'done', actors: ['assignee', 'editor', 'reviewer'] },
  { from: 'missed', to: 'partial', actors: ['assignee', 'editor'] },
  { from: 'missed', to: 'pending', actors: ['editor'] },
  { from: 'missed', to: 'cancelled', actors: ['deleter'] },
  { from: 'done', to: 'pending', actors: ['assignee', 'editor'] },
  { from: 'done', to: 'partial', actors: ['reviewer'] },
  { from: 'done', to: 'missed', actors: ['reviewer'] },
  { from: 'partial', to: 'pending', actors: ['assignee', 'editor'] },
  { from: 'partial', to: 'done', actors: ['reviewer'] },
  { from: 'cancelled', to: 'pending', actors: ['deleter'] },
] as const satisfies readonly {
  from: OccurrenceStatus;
  to: OccurrenceStatus;
  actors: readonly OccurrenceActor[];
}[];

export type OccurrenceTransition = (typeof occurrenceTransitions)[number];
