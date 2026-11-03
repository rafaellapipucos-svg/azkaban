import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, sizes, spacing } from './tokens';

type Props = {
  /** Spoken name, and the visible text when `extended`: "Nova tarefa". */
  label: string;
  onPress: () => void;
  icon?: string;
  /** Show the label next to the icon. Better for first-time users than a bare "+". */
  extended?: boolean;
  /**
   * Inside a tab screen the tab bar already clears the safe area and sits below this view,
   * so the default only keeps a gap. Pass false on screens without a tab bar to add the inset.
   */
  insideTabs?: boolean;
};

// Render as a sibling of the Screen inside a flex-1 View: it floats over the content, bottom right.
export function Fab({ label, onPress, icon = '+', extended, insideTabs = true }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        pointerEvents: 'box-none',
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        paddingBottom: spacing[4] + (insideTabs ? 0 : insets.bottom),
      }}
    >
      <View
        style={{
          pointerEvents: 'box-none',
          width: '100%',
          maxWidth: layout.maxContentWidth,
          alignItems: 'flex-end',
          paddingHorizontal: spacing[4],
        }}
      >
        <Pressable
          role="button"
          aria-label={label}
          onPress={onPress}
          style={{ minHeight: sizes.fab, minWidth: sizes.fab }}
          className="flex-row items-center justify-center gap-2 rounded-full border-b-4 border-primaryEdge bg-primary px-4 active:translate-y-1 active:border-b-0"
        >
          <Text aria-hidden className="font-heavy text-xl text-onPrimary">
            {icon}
          </Text>
          {extended ? <Text className="font-heavy text-md text-onPrimary">{label}</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}
