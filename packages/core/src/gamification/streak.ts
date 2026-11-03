import type { OccurrenceListItem } from '@azkaban/contracts';
import { isPerfectDay, occurrenceDay, summarizeDay } from '../tasks/calendarDay';
import { addDays } from '../tasks/form';

/** Same shape as `gamificationRules.goal` in config, which core does not import. */
export type GoalRules = { percent: number; countPartial: boolean };

/** Same shape as `gamificationRules.streak` in config. */
export type StreakRules = {
  emptyDayKeepsStreak: boolean;
  freezeEveryDays: number;
  maxFreezes: number;
};

/** Counts of one local day, as in `user_day_stats`. `in_review` counts as `done`. */
export type GoalCounts = { planned: number; done: number; partial: number };

export type DailyGoal = {
  planned: number;
  /** `done`, plus `partial` when the rules count it. */
  completed: number;
  /** Completed occurrences the goal asks for: `ceil(planned × percent / 100)`. */
  needed: number;
  met: boolean;
  /** From 0 to 1, for the ring. 1 once the goal is met. */
  progress: number;
};

/**
 * The daily goal (ADR-0010 section 3). Integer math only, so this and the SQL never differ by a
 * rounding: met is `planned > 0` and `completed × 100 ≥ planned × percent`. A day with nothing
 * planned is not met; it is an empty day.
 */
export function dailyGoal({ planned, done, partial }: GoalCounts, rules: GoalRules): DailyGoal {
  const completed = done + (rules.countPartial ? partial : 0);
  const needed = Math.floor((planned * rules.percent + 99) / 100);
  const met = planned > 0 && completed * 100 >= planned * rules.percent;
  const progress = met ? 1 : needed > 0 ? completed / needed : 0;
  return { planned, completed, needed, met, progress };
}

export type UserDayCounts = GoalCounts & { missed: number; perfect: boolean };

/**
 * Counts of `date` for `assigneeId`, the day of each occurrence being its local day in the zone of
 * the profile (`occurrenceDay`). Cancelled ones and repeated ids are left out, so the lists of Hoje
 * can be passed together.
 */
export function dayCounts(
  items: readonly OccurrenceListItem[],
  { timezone, date, assigneeId }: { timezone: string; date: string; assigneeId: string },
): UserDayCounts {
  const seen = new Set<string>();
  const ofDay = items.filter((item) => {
    if (seen.has(item.id) || item.assigneeId !== assigneeId) return false;
    seen.add(item.id);
    return occurrenceDay(item, timezone) === date;
  });
  const summary = summarizeDay(ofDay);
  return {
    planned: summary.total,
    done: summary.done,
    partial: summary.partial,
    missed: summary.missed,
    perfect: isPerfectDay(summary),
  };
}

export type StreakDay = GoalCounts & { localDate: string };

export type StreakState = { streak: number; best: number; freezes: number; perfectRun: number };

export type FoldedDay = StreakState & {
  localDate: string;
  goalMet: boolean;
  perfect: boolean;
  freezeUsed: boolean;
};

export type StreakFold = StreakState & {
  /** State after each day given, in date order, as the database writes `user_day_stats`. */
  days: FoldedDay[];
};

/**
 * The streak (ADR-0010 section 3), folding every local day from the oldest given up to `today`.
 * A day missing from `days` had nothing planned. Days after `today` are left out. `today` is open:
 * it counts once the goal is met and never breaks anything. A closed day that misses the goal
 * spends a freeze if there is one, or breaks the streak.
 */
export function foldStreak(
  days: readonly StreakDay[],
  { today, rules }: { today: string; rules: { goal: GoalRules; streak: StreakRules } },
): StreakFold {
  const byDate = new Map(days.map((day) => [day.localDate, day]));
  const state: StreakState = { streak: 0, best: 0, freezes: 0, perfectRun: 0 };
  const folded: FoldedDay[] = [];
  const first = [...byDate.keys()].sort()[0];

  for (let date = first; date !== undefined && date <= today; date = addDays(date, 1)) {
    const day = byDate.get(date) ?? { localDate: date, planned: 0, done: 0, partial: 0 };
    const goalMet = dailyGoal(day, rules.goal).met;
    // `isPerfectDay`, on counts.
    const perfect = day.planned > 0 && day.done === day.planned;
    let freezeUsed = false;

    if (day.planned === 0 && rules.streak.emptyDayKeepsStreak) {
      // An empty day neither counts nor breaks.
    } else if (goalMet) {
      state.streak += 1;
      state.best = Math.max(state.best, state.streak);
      if (state.streak % rules.streak.freezeEveryDays === 0) {
        state.freezes = Math.min(rules.streak.maxFreezes, state.freezes + 1);
      }
      state.perfectRun = perfect ? state.perfectRun + 1 : 0;
    } else if (date < today) {
      if (state.freezes > 0) {
        state.freezes -= 1;
        freezeUsed = true;
      } else {
        state.streak = 0;
      }
      // A closed empty day, when it breaks, still does not end a run of perfect days.
      if (day.planned > 0) state.perfectRun = 0;
    }

    if (byDate.has(date)) folded.push({ ...state, localDate: date, goalMet, perfect, freezeUsed });
  }
  return { ...state, days: folded };
}
