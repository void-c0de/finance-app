import {
    useRef,
} from 'react';

import {
    Animated,
    type GestureResponderEvent,
    Pressable,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    type InteractionFeedbackVariant,
    useInteractionFeedback,
} from '@/providers/InteractionFeedbackProvider';

import {
    type FinanceHapticKind,
    performFinanceHaptic,
} from '@/services/haptics';

import {
    financeMotion,
} from '@/theme/finance-motion';

/**
 * Zentrale Interaction-Policy.
 *
 * - navigation:  subtile visuelle Rückmeldung,
 *                KEINE Vibration (Liste/Detail-Navigation).
 * - important:   kräftige Rückmeldung + Haptic
 *                (Add/Save/Refresh/Connect ...).
 * - destructive: negative Farbrückmeldung + Warning-Haptic.
 *
 * Explizit gesetzte Props überschreiben
 * jeweils die Intent-Vorgabe.
 */
type FinancePressableIntent =
  | 'navigation'
  | 'important'
  | 'destructive';

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

const DESTRUCTIVE_SCALE =
  0.97;

type FinancePressableProps =
  Omit<
    PressableProps,
    'children' | 'onPress'
  > & {
    children:
      PressableProps['children'];

    onPress?:
      PressableProps['onPress'];

    contentStyle?:
      StyleProp<ViewStyle>;

    intent?:
      FinancePressableIntent;

    /**
     * Legacy-Kompatibilität.
     *
     * Alle app-eigenen Buttons besitzen
     * jetzt grundsätzlich visuelles Feedback.
     */
    splashEffect?:
      boolean;

    hapticFeedback?:
      boolean;

    hapticKind?:
      FinanceHapticKind;

    feedbackColor?:
      string;

    feedbackVariant?:
      InteractionFeedbackVariant;

    tapScale?:
      number;
  };

export function FinancePressable({
  children,

  onPress,

  contentStyle,

  intent,

  splashEffect:
    _legacySplashEffect =
      true,

  hapticFeedback,

  hapticKind,

  feedbackColor,

  feedbackVariant,

  tapScale,

  disabled,

  ...pressableProps
}: FinancePressableProps) {
  const {
    colors,
  } =
    useFinanceTheme();

  const interactionFeedback =
    useInteractionFeedback();

  const scale =
    useRef(
      new Animated.Value(
        1
      )
    ).current;

  const resolvedIntentDefaults =
    intent === 'navigation'
      ? NAVIGATION_DEFAULTS

      : intent === 'important'
        ? IMPORTANT_DEFAULTS

        : intent === 'destructive'
          ? {
              feedbackVariant: 'burst' as const,

              tapScale: DESTRUCTIVE_SCALE,

              hapticFeedback: true,

              hapticKind: 'warning' as const,
            }

          : null;

  const resolvedFeedbackVariant =
    feedbackVariant ??
    resolvedIntentDefaults?.feedbackVariant ??
    'burst';

  const resolvedTapScale =
    tapScale ??
    resolvedIntentDefaults?.tapScale ??
    financeMotion
      .press
      .scale;

  const resolvedHapticFeedback =
    hapticFeedback ??
    resolvedIntentDefaults?.hapticFeedback ??
    false;

  const resolvedHapticKind =
    hapticKind ??
    resolvedIntentDefaults?.hapticKind ??
    'action';

  const resolvedFeedbackColor =
    feedbackColor ??
    (intent === 'destructive'
      ? colors.negative
      : colors.primary);

  /*
   * Der alte Flag bleibt nur erhalten,
   * damit bestehende Aufrufe nicht brechen.
   *
   * Visuelles Feedback ist jetzt ein
   * Grundprinzip aller app-eigenen Controls.
   */
  void _legacySplashEffect;

  function runLocalTapAnimation() {
    if (disabled) {
      return;
    }

    scale.stopAnimation();

    scale.setValue(
      1
    );

    Animated.sequence([
      Animated.timing(
        scale,
        {
          toValue:
            resolvedTapScale,

          duration:
            financeMotion
              .duration
              .instant,

          useNativeDriver:
            true,
        }
      ),

      Animated.spring(
        scale,
        {
          toValue:
            1,

          speed:
            financeMotion
              .press
              .releaseSpeed,

          bounciness:
            4,

          useNativeDriver:
            true,
        }
      ),
    ]).start();
  }

  function emitVisualFeedback(
    event:
      GestureResponderEvent
  ) {
    const {
      pageX,
      pageY,
    } =
      event.nativeEvent;

    interactionFeedback
      ?.emitFeedback({
        x:
          pageX,

        y:
          pageY,

        color:
          resolvedFeedbackColor,

        variant:
          resolvedFeedbackVariant,
      });
  }

  function handlePress(
    event:
      GestureResponderEvent
  ) {
    if (disabled) {
      return;
    }

    /*
     * EXTREM WICHTIG:
     *
     * Alles startet erst nach
     * einem echten bestätigten onPress.
     *
     * Beim Scrollen wird onPress
     * abgebrochen.
     *
     * Daher:
     *
     * Scrollen -> keine Vibration
     * Scrollen -> keine Tropfen
     *
     * echter Klick -> Feedback
     */
    runLocalTapAnimation();

    emitVisualFeedback(
      event
    );

    if (
      resolvedHapticFeedback
    ) {
      void performFinanceHaptic(
        resolvedHapticKind
      );
    }

    onPress?.(
      event
    );
  }

  return (
    <Pressable
      {...pressableProps}

      disabled={
        disabled
      }

      onPress={
        handlePress
      }
    >
      {(state) => (
        <Animated.View
          style={[
            contentStyle,

            {
              transform: [
                {
                  scale,
                },
              ],
            },
          ]}
        >
          {typeof children ===
          'function'
            ? children(
                state
              )
            : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
