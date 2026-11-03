// Type-only imports: `pnpm db:check-permissions` loads this file directly in Node.
import type { OccurrenceActor, OccurrenceStatus } from './tasks';

/**
 * Every allowed status change and who may make it. Mirrored in public.occurrence_transitions.
 * Reversals exist so that a wrong tap can be undone; XP is compensated, never edited (ADR-0005).
 */
export const occurrenceTransitions = [
  { from: 'pending', to: 'done', actors: ['assignee', 'editor'] },
  { from: 'pending', to: 'partial', actors: ['assignee', 'editor'] },
  { from: 'pending', to: 'missed', actors: ['assignee', 'editor', 'system'] },
  { from: 'pending', to: 'cancelled', actors: ['deleter'] },
  { from: 'missed', to: 'done', actors: ['assignee', 'editor'] },
  { from: 'missed', to: 'partial', actors: ['assignee', 'editor'] },
  { from: 'missed', to: 'pending', actors: ['editor'] },
  { from: 'missed', to: 'cancelled', actors: ['deleter'] },
  { from: 'done', to: 'pending', actors: ['assignee', 'editor'] },
  { from: 'partial', to: 'pending', actors: ['assignee', 'editor'] },
  { from: 'cancelled', to: 'pending', actors: ['deleter'] },
] as const satisfies readonly {
  from: OccurrenceStatus;
  to: OccurrenceStatus;
  actors: readonly OccurrenceActor[];
}[];

export type OccurrenceTransition = (typeof occurrenceTransitions)[number];
