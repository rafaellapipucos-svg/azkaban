import { taskDefaults, taskRules } from '@azkaban/config';
import type { OccurrenceListItem, OccurrenceTransitionInput, Task } from '@azkaban/contracts';
import {
  availableTransitions,
  canManageGroupTask,
  canReviewProof,
  canSendProof,
  deriveActors,
  isLate,
  isLateWindowOpen,
  localDayRange,
  materializeWithFollowUps,
} from '@azkaban/core';
import {
  occurrenceStatusAction,
  offlineQueueFull,
  taskErrorCode,
  tasksRepository,
  useCurrentUser,
  type TaskFailureCode,
} from '@azkaban/data';
import { storage } from '@azkaban/platform';
import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { tasksConfig } from './config';

export type OccurrenceDetail = { item: OccurrenceListItem; task: Task };
export type Transition = ReturnType<typeof availableTransitions>[number];
/** `offline`: no connection, and the change cannot wait in the queue. */
export type StatusError = TaskFailureCode | 'generic' | 'offline';

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
    refetch: () => Promise.all([window.refetch(), overdue.refetch()]),
  };
}

/**
 * What the current user may do with an occurrence. Only decides which controls to show.
 * `canSendProof`: the photo can be sent now. `canReview`: the user can undo a dispute.
 * `windowOpen`: the late window has not closed on them.
 */
export function useTransitions(item: OccurrenceListItem | undefined) {
  const { user } = useCurrentUser();
  const now = useNow();
  return useMemo(() => {
    if (!item) {
      return {
        actors: [],
        available: [] as Transition[],
        canEdit: false,
        canDelete: false,
        canSendProof: false,
        canReview: false,
        windowOpen: true,
      };
    }
    const actors = deriveActors(user, {
      groupId: item.task.groupId,
      createdBy: item.task.createdBy,
      occurrenceAssigneeId: item.assigneeId,
      taskAssigneeId: item.task.assigneeId,
      visibility: item.task.visibility,
      proofFlagsLocked: item.task.proofFlagsLocked,
    });
    const canReview = canReviewProof(user, {
      groupId: item.task.groupId,
      visibility: item.task.visibility,
      authorId: item.assigneeId,
    });
    const request = {
      occurrence: item,
      actors,
      requiresPartialReason: item.task.requiresPartialReason,
      requiresPhotoProof: item.task.requiresPhotoProof,
      canReviewProof: canReview,
      lateCompletionWindowHours: taskRules.lateCompletionWindowHours,
      canManageGroup: canManageGroupTask(user, item.task.groupId),
      now,
    };
    return {
      actors,
      available: availableTransitions(request),
      canSendProof: canSendProof(request),
      canReview,
      windowOpen:
        request.canManageGroup ||
        isLateWindowOpen(item.overdueAt, request.lateCompletionWindowHours, now),
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
    // Reopening drops the proof and its review (ADR-0007 section 9); any other change keeps them.
    proofReviewStatus: toStatus === 'pending' ? null : item.proofReviewStatus,
  };
}

/**
 * Status changes go through the offline queue (ADR-0012, section 5) with an optimistic update: the
 * row changes at once, also without a connection, and the database answer replaces it when the
 * action settles. Every list and the detail screen share the cache, so they stay in step. A refusal
 * is shown here and refetched; one of an action that waited in the queue also becomes a notice.
 */
export function useStatusChange() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<StatusError | null>(null);

  const mutation = useMutation({
    ...occurrenceStatusAction,
    // Returns nothing: the context is saved with a waiting action, and a snapshot of every list
    // does not belong on the disk. The refetch on settle undoes a refused change.
    onMutate: async (input: OccurrenceTransitionInput) => {
      setError(null);
      const detailKey = ['occurrence', input.occurrenceId];
      await queryClient.cancelQueries({ queryKey: ['occurrences'] });
      await queryClient.cancelQueries({ queryKey: detailKey });
      const now = new Date();
      queryClient.setQueriesData<OccurrenceListItem[]>({ queryKey: ['occurrences'] }, (list) =>
        list?.map((item) =>
          item.id === input.occurrenceId ? withOptimisticStatus(item, input, now) : item,
        ),
      );
      queryClient.setQueryData<OccurrenceDetail>(
        detailKey,
        (detail) => detail && { ...detail, item: withOptimisticStatus(detail.item, input, now) },
      );
    },
    onError: (failure) => setError(taskErrorCode(failure) ?? 'generic'),
  });

  const change = useCallback(
    (
      item: OccurrenceListItem,
      toStatus: OccurrenceTransitionInput['toStatus'],
      reason?: string,
    ) => {
      // A photo task never waits in the queue (ADR-0007, section 16), and the queue has a ceiling.
      if (
        !onlineManager.isOnline() &&
        (item.task.requiresPhotoProof || offlineQueueFull(queryClient))
      ) {
        setError('offline');
        return;
      }
      mutation.mutate({
        occurrenceId: item.id,
        toStatus,
        expectedStatus: item.status,
        reason: reason?.trim() ? reason.trim() : null,
      });
    },
    [mutation, queryClient],
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
        queryClient.invalidateQueries({ queryKey: ['rule-changes'] }),
        // The calendar asks for far-off occurrences once per range: a new repeating task must
        // make it ask again.
        queryClient.invalidateQueries({ queryKey: ['materialize'] }),
      ]),
    [queryClient],
  );
}

export const materializeKey = ['materialize-tasks'];

async function updatePending(change: (ids: string[]) => string[]) {
  try {
    const stored = await storage.getItem(tasksConfig.pendingMaterializeKey);
    const ids = change(stored ? (JSON.parse(stored) as string[]) : []);
    await storage.setItem(tasksConfig.pendingMaterializeKey, JSON.stringify(ids));
  } catch {
    // Remembering is a safeguard; without it the daily job still fills the gap.
  }
}

/** Tasks whose request never finished, such as when the page was closed while it ran. */
export async function readPendingMaterialization(): Promise<string[]> {
  try {
    const stored = await storage.getItem(tasksConfig.pendingMaterializeKey);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Creates the occurrences of repeating tasks in the background, then refreshes the lists. The screen
 * that saved has already gone back by then: the request lives in the mutation cache, so
 * `MaterializeStatus` can show it running, or failed with a retry, from any tab.
 */
export function useMaterializeTasks() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationKey: materializeKey,
    // The function is safe to repeat, and a worker killed under load (status 546) answers the
    // next call: try again before telling the person.
    retry: 2,
    retryDelay: 1500,
    mutationFn: async (taskIds: string[]) => {
      // Written first and cleared only on success: a reload in the middle must not lose the work.
      await updatePending((ids) => [...new Set([...ids, ...taskIds])]);
      // `deferred` is left to the daily job after the follow-ups; `failed` keeps the ids pending
      // and makes `MaterializeStatus` offer the retry, without the automatic one above.
      const result = await materializeWithFollowUps(
        () => tasksRepository.materializeTasks(taskIds),
        taskDefaults.materializeMaxFollowUps,
      );
      if (result.failed === 0)
        await updatePending((ids) => ids.filter((id) => !taskIds.includes(id)));
      return result;
    },
    onSettled: refresh,
  });
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
