import { useRestoreFocus } from '@azkaban/platform';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { colors, layout, opacity, spacing } from './tokens';

// Lives only while the sheet is open, which is what useRestoreFocus needs.
export function RestoreFocus() {
  useRestoreFocus();
  return null;
}

type Props = {
  visible: boolean;
  /** Names the dialog for screen readers: "Nova tarefa". Put the same text in a visible heading. */
  label: string;
  /** Esc, the back button on Android and a tap on the dimmed area. */
  onClose: () => void;
  children: ReactNode;
};

/**
 * A bottom sheet over a dimmed screen. It names the dialog (the Modal of react-native-web
 * renders an unnamed `aria-modal` otherwise) and returns focus to the control that opened it,
 * which react-native-web loses when a child takes `autoFocus`. Closing is the caller's job:
 * `onClose` must set `visible` to false.
 */
export function Sheet({ visible, label, onClose, children }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Not in the Modal's native types; react-native-web passes it to the dialog element.
      {...{ 'aria-label': label }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        {/* The close button inside the sheet is the keyboard and screen reader way out. */}
        <Pressable
          aria-hidden
          focusable={false}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.text,
            opacity: opacity.scrim,
          }}
        />
        <View
          style={{
            gap: spacing[3],
            padding: spacing[4],
            width: '100%',
            maxWidth: layout.maxContentWidth,
            alignSelf: 'center',
          }}
          className="rounded-t-lg bg-background dark:bg-background-dark"
        >
          <RestoreFocus />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
