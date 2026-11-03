import { Modal, View } from 'react-native';
import { Button } from './Button';
import { Confetti } from './Confetti';
import { Mascot } from './Mascot';
import { RestoreFocus } from './Sheet';
import { Body, Title } from './Text';
import { layout, sizes, spacing } from './tokens';
import { useReducedMotion } from './useReducedMotion';
import { useThemeColors } from './useThemeColors';

type Props = {
  visible: boolean;
  /** Names the dialog and is its heading: "Dia perfeito!". */
  title: string;
  detail?: string;
  closeLabel: string;
  /** Esc, the back button on Android and the close button. Must set `visible` to false. */
  onClose: () => void;
};

/** The whole screen for a perfect day: the mascot celebrating, confetti, a line and a way out. */
export function PerfectDayScreen({ visible, title, detail, closeLabel, onClose }: Props) {
  const reduced = useReducedMotion();
  const { background } = useThemeColors();
  return (
    <Modal
      visible={visible}
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={onClose}
      // Not in the Modal's native types; react-native-web passes it to the dialog element.
      {...{ 'aria-label': title }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[4],
          padding: spacing[6],
        }}
      >
        <RestoreFocus />
        <Confetti />
        <Mascot mood="celebrating" size={sizes.mascotLarge} animate />
        <Title className="text-center">{title}</Title>
        {detail ? <Body className="text-center">{detail}</Body> : null}
        <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
          <Button label={closeLabel} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
