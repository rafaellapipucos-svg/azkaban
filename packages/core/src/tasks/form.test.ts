import type { RecurrenceInput, TaskInput } from '@azkaban/contracts';
import { taskInputSchema } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { planDelete, planEdit } from './edit';
import {
  addDays,
  buildTaskInput,
  defaultRecurrence,
  localTimeOf,
  nextHourTime,
  offersAdminApproval,
  resolvePrefill,
  taskFormValues,
  toBatchInput,
  weekdayOf,
  withFrequency,
  zonedInstant,
  type FormTask,
  type TaskFormValues,
} from './form';

const SP = 'America/Sao_Paulo';
const CTX = '00000000-0000-4000-8000-000000000001';
const ME = '00000000-0000-4000-8000-000000000002';

const values = (overrides: Partial<TaskFormValues> = {}): TaskFormValues => ({
  title: '  Lavar a louça ',
  notes: '',
  contextId: CTX,
  assigneeIds: [ME],
  scheduleType: 'timed',
  date: '2026-11-04',
  time: '09:00',
  startDate: '',
  hasDuration: false,
  durationMin: 30,
  reminders: [0, 30, 30],
  repeat: false,
  recurrence: defaultRecurrence(),
  requiresPhotoProof: false,
  requiresAdminApproval: false,
  requiresPartialReason: true,
  difficulty: 'easy',
  priority: 'normal',
  visibility: 'group',
  ...overrides,
});
const context = { timezone: SP, assigneeId: ME, creatorId: ME, personalContext: false };

describe('time helpers', () => {
  it('converts a clock time in the zone to an instant and back', () => {
    expect(zonedInstant(SP, '2026-11-04', '09:00')).toBe('2026-11-04T12:00:00.000Z');
    expect(localTimeOf(SP, '2026-11-04T12:00:00.000Z')).toBe('09:00');
    // 23:30 in Sao Paulo is the next day in UTC
    expect(localTimeOf(SP, '2026-11-05T02:30:00.000Z')).toBe('23:30');
  });

  it('picks the next full hour and stops at the end of the day', () => {
    expect(nextHourTime(SP, new Date('2026-11-04T13:20:00.000Z'))).toBe('11:00');
    expect(nextHourTime(SP, new Date('2026-11-05T02:30:00.000Z'))).toBe('23:59');
  });

  it('keeps the photo and approval switches as the form has them when they make sense', () => {
    expect(
      buildTaskInput(values({ requiresPhotoProof: true, requiresAdminApproval: true }), context),
    ).toMatchObject({ requiresPhotoProof: true, requiresAdminApproval: true });
  });

  it('drops an approval that has no photo, or no group, because the contract refuses it', () => {
    const noPhoto = buildTaskInput(values({ requiresAdminApproval: true }), context);
    expect(noPhoto.requiresAdminApproval).toBe(false);
    expect(taskInputSchema.safeParse(noPhoto).success).toBe(true);

    const personal = buildTaskInput(
      values({ requiresPhotoProof: true, requiresAdminApproval: true }),
      { ...context, personalContext: true },
    );
    expect(personal).toMatchObject({ requiresPhotoProof: true, requiresAdminApproval: false });
    expect(taskInputSchema.safeParse(personal).success).toBe(true);

    const privateTask = buildTaskInput(
      values({ requiresPhotoProof: true, requiresAdminApproval: true, visibility: 'private' }),
      context,
    );
    expect(privateTask).toMatchObject({ visibility: 'private', requiresAdminApproval: false });
    expect(taskInputSchema.safeParse(privateTask).success).toBe(true);
  });

  it('offers the approval switch only with a photo, in a group, to a task someone else does', () => {
    const other = '00000000-0000-4000-8000-000000000003';
    const ok = { requiresPhotoProof: true, visibility: 'group' as const, assigneeIds: [other] };
    const group = { personalContext: false, editorId: ME };
    expect(offersAdminApproval(ok, group)).toBe(true);
    expect(offersAdminApproval({ ...ok, requiresPhotoProof: false }, group)).toBe(false);
    expect(offersAdminApproval({ ...ok, visibility: 'private' }, group)).toBe(false);
    expect(offersAdminApproval(ok, { ...group, personalContext: true })).toBe(false);
    // Nobody approves their own photo: the person editing is among the assignees.
    expect(offersAdminApproval({ ...ok, assigneeIds: [ME] }, group)).toBe(false);
    expect(offersAdminApproval({ ...ok, assigneeIds: [other, ME] }, group)).toBe(false);
  });

  it('resolves the day and time a link asks the form to start with', () => {
    expect(resolvePrefill({}, '2026-11-04')).toEqual({ date: '2026-11-04', time: null });
    expect(resolvePrefill({ day: 'tomorrow' }, '2026-11-04').date).toBe('2026-11-05');
    expect(resolvePrefill({ day: '2026-12-25', time: '14:30' }, '2026-11-04')).toEqual({
      date: '2026-12-25',
      time: '14:30',
    });
    // A hand-edited link falls back instead of putting garbage in the form
    expect(resolvePrefill({ day: '2026-13-45', time: '25:00' }, '2026-11-04')).toEqual({
      date: '2026-11-04',
      time: null,
    });
    expect(resolvePrefill({ day: 'soon', time: '9:00' }, '2026-11-04')).toEqual({
      date: '2026-11-04',
      time: null,
    });
  });

  it('adds days and finds the weekday', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(weekdayOf('2026-11-04')).toBe('WE');
    expect(weekdayOf('2026-11-08')).toBe('SU');
  });
});

describe('withFrequency', () => {
  it('gives each kind what the contract asks for', () => {
    const base = defaultRecurrence();
    const weekly = withFrequency(base, 'weekly', '2026-11-04');
    expect(weekly).toMatchObject({ frequency: 'weekly', weekdays: ['WE'], monthDay: null });
    const monthly = withFrequency(weekly, 'monthly', '2026-11-04');
    expect(monthly).toMatchObject({ frequency: 'monthly', weekdays: [], monthDay: 4 });
    expect(withFrequency(monthly, 'daily', '2026-11-04')).toMatchObject({
      weekdays: [],
      monthDay: null,
    });
  });
});

describe('buildTaskInput', () => {
  it('builds a timed task that passes the contract', () => {
    const input = buildTaskInput(values(), context);
    expect(input).toMatchObject({
      title: 'Lavar a louça',
      notes: null,
      startAt: '2026-11-04T12:00:00.000Z',
      dueAt: null,
      durationMin: null,
      reminders: [30, 0],
      visibility: 'group',
      recurrence: null,
    });
    expect(taskInputSchema.safeParse(input).success).toBe(true);
  });

  it('keeps a duration only when asked', () => {
    expect(
      buildTaskInput(values({ hasDuration: true, durationMin: 45 }), context).durationMin,
    ).toBe(45);
  });

  it('puts an all-day task at local midnight and drops reminders', () => {
    const input = buildTaskInput(values({ scheduleType: 'all_day', reminders: [30] }), context);
    expect(input).toMatchObject({
      startAt: '2026-11-04T03:00:00.000Z',
      dueAt: null,
      reminders: [],
    });
    expect(taskInputSchema.safeParse(input).success).toBe(true);
  });

  it('makes a deadline fall due at 23:59, with an optional start', () => {
    const input = buildTaskInput(
      values({ scheduleType: 'deadline', date: '2026-11-10', startDate: '2026-11-05' }),
      context,
    );
    expect(input).toMatchObject({
      startAt: '2026-11-05T03:00:00.000Z',
      dueAt: '2026-11-11T02:59:00.000Z',
    });
    expect(taskInputSchema.safeParse(input).success).toBe(true);
    expect(
      buildTaskInput(values({ scheduleType: 'deadline', date: '2026-11-10' }), context).startAt,
    ).toBeNull();
  });

  it('forces private in a personal context and keeps group otherwise', () => {
    expect(buildTaskInput(values(), { ...context, personalContext: true }).visibility).toBe(
      'private',
    );
    expect(buildTaskInput(values({ visibility: 'private' }), context).visibility).toBe('private');
  });

  it('refuses private when the assignee is not the creator', () => {
    const input = buildTaskInput(values({ visibility: 'private' }), {
      ...context,
      assigneeId: 'other',
    });
    expect(input.visibility).toBe('group');
  });

  it('aligns the start to the rule when saving', () => {
    const weekly: RecurrenceInput = {
      frequency: 'weekly',
      interval: 1,
      weekdays: ['MO', 'FR'],
      monthDay: null,
      end: { type: 'never' },
    };
    const input = buildTaskInput(values({ repeat: true, recurrence: weekly }), context);
    expect(input.startAt).toBe('2026-11-06T12:00:00.000Z');
    expect(input.recurrence).toEqual(weekly);
  });

  it('refuses a rule that ends before the task starts', () => {
    const ended = { ...defaultRecurrence(), end: { type: 'on_date', date: '2026-11-01' } } as const;
    expect(() => buildTaskInput(values({ repeat: true, recurrence: ended }), context)).toThrow(
      'recurrence_ends_before_anchor',
    );
  });

  it('turns a task into a batch of assignees, always for the group', () => {
    const ids = [ME, '00000000-0000-4000-8000-000000000003'];
    const batch = toBatchInput(buildTaskInput(values({ visibility: 'private' }), context), ids);
    expect(batch).toMatchObject({ assigneeIds: ids, visibility: 'group' });
    expect('assigneeId' in batch).toBe(false);
  });
});

describe('taskFormValues', () => {
  const task: FormTask = {
    title: 'Academia',
    notes: null,
    contextId: CTX,
    assigneeId: ME,
    scheduleType: 'timed',
    startAt: '2026-11-02T12:00:00.000Z',
    dueAt: null,
    durationMin: 60,
    timezone: SP,
    reminders: [30, 0],
    requiresPhotoProof: true,
    requiresAdminApproval: false,
    requiresPartialReason: true,
    difficulty: 'hard',
    priority: 'high',
    visibility: 'group',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
  } as const;
  const occurrence = {
    scheduledStart: '2026-11-04T12:00:00.000Z',
    scheduledDue: '2026-11-04T13:00:00.000Z',
  };

  it('shows the series anchor for all', () => {
    const form = taskFormValues(task, occurrence, 'all');
    expect(form).toMatchObject({
      date: '2026-11-02',
      time: '09:00',
      repeat: true,
      hasDuration: true,
    });
    expect(form.recurrence).toMatchObject({ frequency: 'weekly', weekdays: ['MO', 'WE'] });
  });

  it('shows the occurrence for this and this_and_following', () => {
    expect(taskFormValues(task, occurrence, 'this_and_following')).toMatchObject({
      date: '2026-11-04',
      repeat: true,
    });
    expect(taskFormValues(task, occurrence, 'this')).toMatchObject({
      date: '2026-11-04',
      repeat: false,
    });
  });

  it('keeps the proof flags the screen does not show', () => {
    expect(taskFormValues(task, occurrence, 'all').requiresPhotoProof).toBe(true);
  });

  it('gives back the same flags it was given, so a reschedule never moves them', () => {
    const approved = { ...task, requiresAdminApproval: true };
    const form = taskFormValues(approved, occurrence, 'this');
    const input = buildTaskInput(form, {
      timezone: SP,
      assigneeId: ME,
      creatorId: ME,
      personalContext: false,
    });
    expect(input).toMatchObject({ requiresPhotoProof: true, requiresAdminApproval: true });
  });

  it('goes back to the same task: build(form(task)) keeps the schedule', () => {
    const form = taskFormValues(task, occurrence, 'all');
    const input = buildTaskInput(form, context);
    expect(input).toMatchObject({ startAt: task.startAt, durationMin: 60, reminders: [30, 0] });
  });

  it('reads a deadline back as dates', () => {
    const deadline = {
      ...task,
      scheduleType: 'deadline',
      startAt: '2026-11-05T03:00:00.000Z',
      dueAt: '2026-11-11T02:59:00.000Z',
      durationMin: null,
      rrule: null,
    } as const;
    const form = taskFormValues(
      deadline,
      { scheduledStart: deadline.startAt, scheduledDue: deadline.dueAt },
      'all',
    );
    expect(form).toMatchObject({ date: '2026-11-10', startDate: '2026-11-05', repeat: false });
  });

  it('falls back to no repetition for a rule the app does not edit', () => {
    const odd = { ...task, rrule: 'FREQ=YEARLY' };
    expect(taskFormValues(odd, occurrence, 'all').repeat).toBe(false);
  });
});

describe('planEdit and planDelete', () => {
  const series = {
    rrule: 'FREQ=DAILY',
    startAt: '2026-11-02T12:00:00.000Z',
    dueAt: null,
    timezone: SP,
  };
  const pivot = '2026-11-05T12:00:00.000Z';
  const input = (
    recurrence: RecurrenceInput | null,
  ): Pick<TaskInput, 'recurrence' | 'startAt' | 'dueAt' | 'timezone'> => ({
    recurrence,
    startAt: pivot,
    dueAt: null,
    timezone: SP,
  });

  it('this has no rule', () => {
    expect(
      planEdit({
        scope: 'this',
        task: series,
        pivotStart: pivot,
        input: input(defaultRecurrence()),
      }),
    ).toEqual({
      rrule: null,
      headRrule: null,
    });
  });

  it('all sends the whole rule, or none when the task stops repeating', () => {
    expect(
      planEdit({
        scope: 'all',
        task: series,
        pivotStart: pivot,
        input: input(defaultRecurrence()),
      }),
    ).toEqual({
      rrule: 'FREQ=DAILY',
      headRrule: null,
    });
    expect(planEdit({ scope: 'all', task: series, pivotStart: pivot, input: input(null) })).toEqual(
      {
        rrule: null,
        headRrule: null,
      },
    );
  });

  it('this_and_following ends the original the day before the pivot', () => {
    const plan = planEdit({
      scope: 'this_and_following',
      task: series,
      pivotStart: pivot,
      input: input({ ...defaultRecurrence(), frequency: 'weekly', weekdays: ['TH'] }),
    });
    expect(plan.rrule).toBe('FREQ=WEEKLY;BYDAY=TH');
    expect(plan.headRrule).toBe('FREQ=DAILY;UNTIL=20261105T025959Z');
  });

  it('this_and_following with no repetition still ends the original', () => {
    const plan = planEdit({
      scope: 'this_and_following',
      task: series,
      pivotStart: pivot,
      input: input(null),
    });
    expect(plan.rrule).toBeNull();
    expect(plan.headRrule).toBe('FREQ=DAILY;UNTIL=20261105T025959Z');
  });

  it('this_and_following on the first occurrence has no head', () => {
    const plan = planEdit({
      scope: 'this_and_following',
      task: series,
      pivotStart: series.startAt,
      input: input(defaultRecurrence()),
    });
    expect(plan.headRrule).toBeNull();
  });

  it('reports a count that does not pass the pivot', () => {
    const counted = { ...defaultRecurrence(), end: { type: 'after_count', count: 2 } } as const;
    expect(() =>
      planEdit({
        scope: 'this_and_following',
        task: series,
        pivotStart: pivot,
        input: input(counted),
      }),
    ).toThrow('count_before_pivot');
  });

  it('only this_and_following needs a head rule to delete', () => {
    expect(planDelete({ scope: 'this', task: series, pivotStart: pivot })).toBeNull();
    expect(planDelete({ scope: 'all', task: series, pivotStart: pivot })).toBeNull();
    expect(planDelete({ scope: 'this_and_following', task: series, pivotStart: pivot })).toBe(
      'FREQ=DAILY;UNTIL=20261105T025959Z',
    );
    expect(
      planDelete({ scope: 'this_and_following', task: series, pivotStart: series.startAt }),
    ).toBeNull();
  });
});
