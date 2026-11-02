import { NotificationBell } from '@azkaban/feature-notifications';
import { TodayScreen } from '@azkaban/feature-tasks';
import { tokens } from '@azkaban/ui';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

// Features do not import each other, so the route puts the bell on Hoje, beside the title.
// pending: when TodayScreen takes `children` in its header (tarefas-calendario), pass the bell there
// and drop this overlay.
export default function Today() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <TodayScreen onProof={(id) => router.push(`/tasks/${id}/proof`)} />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: tokens.spacing[6],
          width: '100%',
          maxWidth: tokens.layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: tokens.spacing[4],
          alignItems: 'flex-end',
        }}
      >
        <NotificationBell />
      </View>
    </View>
  );
}
