import {
    useEffect,
    useRef,
} from 'react';

import {
    Animated,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    usePrefersReducedMotion,
} from '@/hooks/use-reduced-motion';

type FinanceSkeletonProps = {
  width?:
    number
    | `${number}%`
    | 'auto';

  height?:
    number;

  radius?:
    'sm'
    | 'md'
    | 'lg'
    | 'round';

  style?:
    StyleProp<ViewStyle>;
};

/**
 * Zentrales Skeleton-Element.
 *
 * Reduzierte Motion (Android-
 * Barrierefreiheit) schaltet auf
 * einen stillen Puls um.
 */
export function FinanceSkeleton({
  width = '100%',

  height = 16,

  radius = 'md',

  style,
}: FinanceSkeletonProps) {
  const {
    colors,
    radius: radiusTokens,
  } =
    useFinanceTheme();

  const reducedMotion =
    usePrefersReducedMotion();

  const pulse =
    useRef(
      new Animated.Value(
        0
      )
    ).current;

  useEffect(() => {
    const animation =
      Animated.loop(
        Animated.sequence([
          Animated.timing(
            pulse,
            {
              toValue:
                1,

              duration: 750,

              useNativeDriver:
                false,
            }
          ),

          Animated.timing(
            pulse,
            {
              toValue:
                0,

              duration: 750,

              useNativeDriver:
                false,
            }
          ),
        ])
      );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    pulse,
  ]);

  const opacity =
    reducedMotion
      ? 0.55

      : pulse.interpolate({
          inputRange:
            [0, 1],

          outputRange:
            [
              0.45,
              1,
            ],
        });

  return (
    <Animated.View
      style={[
        styles.base,

        {
          width,

          height,

          backgroundColor:
            colors.surfaceInteractive,

          borderRadius:
            radius === 'round'
              ? radiusTokens.round

              : radiusTokens[radius],
        },

        style,

        {
          opacity,
        },
      ]}
    />
  );
}

/**
 * Skeleton-Zeile für Listen
 * (Transaktionen, Konten ...).
 */
export function FinanceSkeletonRow({
  style,
}: {
  style?:
    StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.row,

        style,
      ]}
    >
      <FinanceSkeleton
        width={46}

        height={46}

        radius="round"
      />

      <View
        style={
          styles.rowText
        }
      >
        <FinanceSkeleton
          width="62%"

          height={14}
        />

        <FinanceSkeleton
          width="38%"

          height={11}

          style={
            styles.rowCaption
          }
        />
      </View>

      <FinanceSkeleton
        width={72}

        height={14}
      />
    </View>
  );
}

const styles =
  StyleSheet.create({
    base: {},

    row: {
      flexDirection:
        'row',

      alignItems:
        'center',

      paddingVertical:
        12,
    },

    rowText: {
      flex: 1,

      marginHorizontal:
        12,
    },

    rowCaption: {
      marginTop: 8,
    },
  });
