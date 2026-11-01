import type { GroupMember, TeamOverviewRow } from '@azkaban/contracts';

export type TeamTone = 'green' | 'yellow' | 'red' | 'none';

/** Rate at or above `green` is green, at or above `yellow` is yellow, below is red. */
export type RateBands = { green: number; yellow: number };

export type DayCounts = Pick<TeamOverviewRow, 'pending' | 'done' | 'partial' | 'missed' | 'late'>;

export type MemberOverview = {
  userId: string;
  displayName: string;
  /** Counts by local day, only for days that have something. */
  days: Map<string, DayCounts>;
  /** Occurrences that count toward the rate. */
  due: number;
  done: number;
  /** `done / due`, or null while nothing is due. */
  rate: number | null;
  tone: TeamTone;
};

const empty = (): DayCounts => ({ pending: 0, done: 0, partial: 0, missed: 0, late: 0 });

export function toneOf(rate: number | null, bands: RateBands): TeamTone {
  if (rate === null) return 'none';
  if (rate >= bands.green) return 'green';
  return rate >= bands.yellow ? 'yellow' : 'red';
}

/**
 * The state of one day as a person sees it. All green is `green`, a miss is `red`, something
 * yellow (and no miss) is `yellow`, and a day that is only pending is `none`: it is not wrong yet.
 */
export function dayTone(counts: DayCounts): TeamTone {
  const total = counts.pending + counts.done + counts.partial + counts.missed;
  if (total === 0) return 'none';
  if (counts.missed > 0) return 'red';
  if (counts.partial > 0) return 'yellow';
  return counts.pending > 0 ? 'none' : 'green';
}

/**
 * One entry per member, in name order. Everyone in `members` appears, with or without tasks, and
 * so does anyone with a row but no longer listed. The rate counts `done` against everything that
 * was due by `today`: pending ones only count on days before it (today's are still on time), and
 * days after it count for nothing. `partial` and `missed` stay in the base, so they pull it down.
 */
export function teamOverview(
  rows: readonly TeamOverviewRow[],
  members: readonly Pick<GroupMember, 'userId' | 'displayName'>[],
  { today, bands }: { today: string; bands: RateBands },
): MemberOverview[] {
  const byUser = new Map<string, MemberOverview>();
  const ensure = (userId: string, displayName: string) => {
    let member = byUser.get(userId);
    if (!member) {
      member = { userId, displayName, days: new Map(), due: 0, done: 0, rate: null, tone: 'none' };
      byUser.set(userId, member);
    }
    return member;
  };
  for (const { userId, displayName } of members) ensure(userId, displayName);

  for (const row of rows) {
    const member = ensure(row.userId, row.displayName);
    const counts = member.days.get(row.date) ?? empty();
    for (const key of ['pending', 'done', 'partial', 'missed', 'late'] as const) {
      counts[key] += row[key];
    }
    member.days.set(row.date, counts);
    if (row.date > today) continue;
    member.done += row.done;
    member.due += row.done + row.partial + row.missed + (row.date < today ? row.pending : 0);
  }

  return [...byUser.values()]
    .map((member) => {
      const rate = member.due === 0 ? null : member.done / member.due;
      return { ...member, rate, tone: toneOf(rate, bands) };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
