import { taskRules } from '@azkaban/config';
import type {
  OccurrenceListItem,
  OccurrenceTransitionInput,
  Task,
  TaskErrorCode,
} from '@azkaban/contracts';
import {
  availableTransitions,
  canManageGroupTask,
  deriveActors,
  isLate,
  localDayRange,
} from '@azkaban/core';
import { taskErrorCode, tasksRepository, useCurrentUser } from '@azkaban/data';
import { storage } from '@azkaban/platform';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { tasksConfig } from './config';

export type OccurrenceDetail = { item: OccurrenceListItem; task: Task };
export type Transition = ReturnType<typeof availableTransitions>[number];

const MINUTE_MS = 60_000;

/** A clock that ticks every minute, so "overdue" and the day boundary follow the real time. */
export function useNow(intervalMs = MINUTE_MS) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Occurrences of the next `days` local days plus everything overdue, as one list. `mineOnly`
 * narrows to what is assigned to the user; without it the database decides what is visible.
 */
export function useOccurrenceLists({ days, mineOnly }: { days: number; mineOnly: boolean }) {
  const { user, timezone, ready } = useCurrentUser();
  const now = useNow();
  const range = localDayRange(timezone, now, days);
  const assigneeId = mineOnly ? user.id : undefined;
  const scope = assigneeId ?? 'all';

  const window = useQuery({
    queryKey: ['occurrences', 'window', scope, range.from, range.to],
    queryFn: () => tasksRepository.listOccurrences({ from: range.from, to: range.to, assigneeId }),
    enabled: ready,
  });
  const overdue = useQuery({
    queryKey: ['occurrences', 'overdue', scope],
    queryFn: () => tasksRepository.listOverdue({ before: new Date().toISOString(), assigneeId }),
    enabled: ready,
  });
  const items = useMemo(
    () => [...(overdue.data ?? []), ...(window.data ?? [])],
    [overdue.data, window.data],
  );
  return {
    items,
    now,
    timezone,
    loading: !ready || window.isPending || overdue.isPending,
    failed: window.isError || overdue.isError,
  };
}

/** What the current user may do with an occurrence. Only decides which controls to show. */
export function useTransitions(item: OccurrenceListItem | undefined) {
  const { user } = useCurrentUser();
  const now = useNow();
  return useMemo(() => {
    if (!item) {
      return { actors: [], available: [] as Transition[], canEdit: false, canDelete: false };
    }
    const actors = deriveActors(user, {
      groupId: item.task.groupId,
      createdBy: item.task.createdBy,
      occurrenceAssigneeId: item.assigneeId,
      taskAssigneeId: item.task.assigneeId,
      visibility: item.task.visibility,
    });
    const available = availableTransitions({
      occurrence: item,
      actors,
      requiresPartialReason: item.task.requiresPartialReason,
      lateCompletionWindowHours: taskRules.lateCompletionWindowHours,
      canManageGroup: canManageGroupTask(user, item.task.groupId),
      now,
    });
    return {
      actors,
      available,
      canEdit: actors.includes('editor'),
      canDelete: actors.includes('deleter'),
    };
  }, [user, item, now]);
}

/** What the list shows while the request is in flight; the database answer replaces it. */
export function withOptimisticStatus(
  item: OccurrenceListItem,
  { toStatus, reason }: Pick<OccurrenceTransitionInput, 'toStatus' | 'reason'>,
  now: Date,
): OccurrenceListItem {
  const resolves = toStatus === 'done' || toStatus === 'partial';
  return {
    ...item,
    status: toStatus,
    late: resolves && isLate(item.overdueAt, now),
    statusReason: toStatus === 'pending' ? null : reason,
  };
}

type Snapshot = {
  lists: [QueryKey, OccurrenceListItem[] | undefined][];
  detail: OccurrenceDetail | undefined;
};

/**
 * Status changes with optimistic updates: the row changes at once, and goes back if the database
 * refuses. Every list and the detail screen share the cache, so they stay in step.
 */
export function useStatusChange() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<TaskErrorCode | 'generic' | null>(null);

  const mutation = useMutation({
    mutationFn: tasksRepository.setStatus,
    onMutate: async (input: OccurrenceTransitionInput): Promise<Snapshot> => {
      setError(null);
      const detailKey = ['occurrence', input.occurrenceId];
      await queryClient.cancelQueries({ queryKey: ['occurrences'] });
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot: Snapshot = {
        lists: queryClient.getQueriesData<OccurrenceListItem[]>({ queryKey: ['occurrences'] }),
        detail: queryClient.getQueryData<OccurrenceDetail>(detailKey),
      };
      const now = new Date();
      queryClient.setQueriesData<OccurrenceListItem[]>({ queryKey: ['occurrences'] }, (list) =>
        list?.map((item) =>
          item.id === input.occurrenceId ? withOptimisticStatus(item, input, now) : item,
        ),
      );
      if (snapshot.detail) {
        queryClient.setQueryData<OccurrenceDetail>(detailKey, {
          ...snapshot.detail,
          item: withOptimisticStatus(snapshot.detail.item, input, now),
        });
      }
      return snapshot;
    },
    onError: (failure, input, snapshot) => {
      snapshot?.lists.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (snapshot?.detail) {
        queryClient.setQueryData(['occurrence', input.occurrenceId], snapshot.detail);
      }
      setError(taskErrorCode(failure) ?? 'generic');
    },
    onSettled: (_data, _failure, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['occurrences'] }),
        queryClient.invalidateQueries({ queryKey: ['occurrence', input.occurrenceId] }),
        queryClient.invalidateQueries({ queryKey: ['history', input.occurrenceId] }),
      ]),
  });

  const change = useCallback(
    (item: OccurrenceListItem, toStatus: OccurrenceTransitionInput['toStatus'], reason?: string) =>
      mutation.mutate({
        occurrenceId: item.id,
        toStatus,
        expectedStatus: item.status,
        reason: reason?.trim() ? reason.trim() : null,
      }),
    [mutation],
  );
  return { change, error, clearError: () => setError(null), pending: mutation.isPending };
}

/** Refresh everything a task change can touch. */
export function useRefreshTasks() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['occurrences'] }),
        queryClient.invalidateQueries({ queryKey: ['occurrence'] }),
        queryClient.invalidateQueries({ queryKey: ['history'] }),
        // The calendar asks for far-off occurrences once per range: a new repeating task must
        // make it ask again.
        queryClient.invalidateQueries({ queryKey: ['materialize'] }),
      ]),
    [queryClient],
  );
}

/** A short confirmation, such as "Tarefa criada", that disappears by itself. */
export function useNotice() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(false), tasksConfig.noticeMs);
    return () => clearTimeout(id);
  }, [shown]);
  return [shown, () => setShown(true)] as const;
}

/** The context quick create starts from: the last one used on this device. */
export function useLastContext() {
  const [lastContextId, setLast] = useState<string | null>(null);
  useEffect(() => {
    storage
      .getItem(tasksConfig.lastContextKey)
      .then(setLast)
      .catch(() => undefined);
  }, []);
  const remember = useCallback((contextId: string) => {
    setLast(contextId);
    storage.setItem(tasksConfig.lastContextKey, contextId).catch(() => undefined);
  }, []);
  return { lastContextId, remember };
}
