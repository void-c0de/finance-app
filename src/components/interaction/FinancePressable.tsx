import { useCallback, useRef } from 'react';

import {
  Animated,
  Easing,
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useFinanceTheme } from '@/hooks/use-finance-theme';
import {
  type InteractionFeedbackVariant,
  useInteractionFeedback,
} from '@/providers/InteractionFeedbackProvider';
import { type FinanceHapticKind, performFinanceHaptic } from '@/services/haptics';
import { financeMotion } from '@/theme/finance-motion';

/**
 * Zentrale Interaction-Policy.
 *
 * - navigation:  subtile visuelle Rückmeldung, KEINE Vibration.
 * - important:   kräftige Rückmeldung + Haptic (Add/Save/Refresh/Connect …).
 * - destructive: negative Farbrückmeldung + Warning-Haptic.
 *
 * Reaktiv: die Skalier-Animation reagiert SOFORT auf `onPressIn` (Feder), nicht
 * erst auf den bestätigten Tap. Der „Belohnungs"-Effekt (Farbtropfen + Haptic)
 * kommt weiterhin nur beim echten, bestätigten `onPress` — beim Scrollen wird
 * `onPress` abgebrochen, also kein Feedback.
 */
type FinancePressableIntent = 'navigation' | 'important' | 'destructive';

type IntentDefaults = {
  feedbackVariant: InteractionFeedbackVariant;
  tapScale: number;
  hapticFeedback: boolean;
  hapticKind: FinanceHapticKind;
};

const NAVIGATION_DEFAULTS: IntentDefaults = {
  feedbackVariant: 'subtle',
  tapScale: financeMotion.press.subtleScale,
  hapticFeedback: false,
  hapticKind: 'selection',
};

const IMPORTANT_DEFAULTS: IntentDefaults = {
  feedbackVariant: 'burst',
  tapScale: financeMotion.press.scale,
  hapticFeedback: true,
  hapticKind: 'action',
};

const DESTRUCTIVE_DEFAULTS: IntentDefaults = {
  feedbackVariant: 'burst',
  tapScale: 0.97,
  hapticFeedback: true,
  hapticKind: 'warning',
};

type FinancePressableProps = Omit<PressableProps, 'children' | 'onPress'> & {
  children: PressableProps['children'];
  onPress?: PressableProps['onPress'];
  contentStyle?: StyleProp<ViewStyle>;
  intent?: FinancePressableIntent;
  /** Legacy-Kompatibilität — alle app-eigenen Controls haben jetzt Feedback. */
  splashEffect?: boolean;
  hapticFeedback?: boolean;
  hapticKind?: FinanceHapticKind;
  feedbackColor?: string;
  feedbackVariant?: InteractionFeedbackVariant;
  tapScale?: number;
};

export function FinancePressable({
  children,
  onPress,
  contentStyle,
  intent,
  splashEffect: _legacySplashEffect = true,
  hapticFeedback,
  hapticKind,
  feedbackColor,
  feedbackVariant,
  tapScale,
  disabled,
  onPressIn,
  onPressOut,
  ...pressableProps
}: FinancePressableProps) {
  const { colors } = useFinanceTheme();
  const interactionFeedback = useInteractionFeedback();

  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(0)).current; // 0 → 1 pressed
  const isPressed = useRef(false);

  const defaults =
    intent === 'navigation'
      ? NAVIGATION_DEFAULTS
      : intent === 'important'
        ? IMPORTANT_DEFAULTS
        : intent === 'destructive'
          ? DESTRUCTIVE_DEFAULTS
          : null;

  const resolvedFeedbackVariant = feedbackVariant ?? defaults?.feedbackVariant ?? 'burst';
  const resolvedTapScale = tapScale ?? defaults?.tapScale ?? financeMotion.press.scale;
  const resolvedHapticFeedback = hapticFeedback ?? defaults?.hapticFeedback ?? false;
  const resolvedHapticKind = hapticKind ?? defaults?.hapticKind ?? 'action';
  const resolvedFeedbackColor =
    feedbackColor ?? (intent === 'destructive' ? colors.negative : colors.primary);

  void _legacySplashEffect;

  const springTo = useCallback(
    (toScale: number, toDim: number, pressing: boolean) => {
      if (disabled) return;
      Animated.parallel([
        Animated.spring(scale, {
          toValue: toScale,
          speed: pressing ? financeMotion.press.springSpeed : financeMotion.press.releaseSpeed,
          bounciness: pressing ? 0 : 6,
          useNativeDriver: true,
        }),
        Animated.timing(dim, {
          toValue: toDim,
          duration: pressing ? financeMotion.duration.instant : financeMotion.duration.fast,
          easing: pressing ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [disabled, dim, scale],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      isPressed.current = true;
      springTo(resolvedTapScale, 1, true);
      onPressIn?.(event);
    },
    [onPressIn, resolvedTapScale, springTo],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      isPressed.current = false;
      springTo(1, 0, false);
      onPressOut?.(event);
    },
    [onPressOut, springTo],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) return;
      // confirmed tap → the "reward": a themed feedback burst at the touch point
      const { pageX, pageY } = event.nativeEvent;
      interactionFeedback?.emitFeedback({
        x: pageX,
        y: pageY,
        color: resolvedFeedbackColor,
        variant: resolvedFeedbackVariant,
      });
      if (resolvedHapticFeedback) {
        void performFinanceHaptic(resolvedHapticKind);
      }
      onPress?.(event);
    },
    [
      disabled,
      interactionFeedback,
      onPress,
      resolvedFeedbackColor,
      resolvedFeedbackVariant,
      resolvedHapticFeedback,
      resolvedHapticKind,
    ],
  );

  const opacity = dim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      {(state) => (
        <Animated.View style={[contentStyle, { transform: [{ scale }], opacity }]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
