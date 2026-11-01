import { CalendarScreen } from '@azkaban/feature-calendar';
import { useLocalSearchParams } from 'expo-router';

// The team view opens a member's week through these params. The key restarts the screen when they
// change, because tabs stay mounted and the screen only reads them at the start.
export default function Calendar() {
  const { view, date, scope, group, member } = useLocalSearchParams<{
    view?: string;
    date?: string;
    scope?: string;
    group?: string;
    member?: string;
  }>();
  const initial = {
    view: view === 'month' || view === 'week' || view === 'day' ? view : undefined,
    date,
    scope: scope === 'mine' || scope === 'member' || scope === 'team' ? scope : undefined,
    groupId: group,
    memberId: member,
  } as const;
  return <CalendarScreen key={JSON.stringify(initial)} initial={initial} />;
}
