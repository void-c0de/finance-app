import {
    useEffect,
    useRef,
} from 'react';

import {
    Animated,
    StyleSheet,
    Text,
    View,
    type LayoutChangeEvent,
} from 'react-native';

import {
    FinanceLogo,
} from '@/components/brand/FinanceLogo';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    usePrefersReducedMotion,
} from '@/hooks/use-reduced-motion';

import {
    financeMotion,
} from '@/theme/finance-motion';

type AppBootSplashProps = {
  onLayout?: (
    event:
      LayoutChangeEvent
  ) => void;

  message?:
    string;
};

export function AppBootSplash({
  onLayout,

  message =
    'Deine Finanzen werden vorbereitet…',
}: AppBootSplashProps) {
  const {
    colors,
    spacing,
    typography,
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

  const float =
    useRef(
      new Animated.Value(
        0
      )
    ).current;

  useEffect(() => {
    if (reducedMotion) {
      /*
       * Android "Animationen reduzieren":
       * ruhige, statische Boot-Ansicht.
       */
      pulse.stopAnimation();

      float.stopAnimation();

      pulse.setValue(0.35);

      return;
    }

    const pulseAnimation =
      Animated.loop(
        Animated.sequence([
          Animated.timing(
            pulse,
            {
              toValue:
                1,

              duration:
                financeMotion
                  .duration
                  .pulseHalf,

              useNativeDriver:
                true,
            }
          ),

          Animated.timing(
            pulse,
            {
              toValue:
                0,

              duration:
                financeMotion
                  .duration
                  .pulseHalf,

              useNativeDriver:
                true,
            }
          ),
        ])
      );

    const floatAnimation =
      Animated.loop(
        Animated.sequence([
          Animated.timing(
            float,
            {
              toValue:
                1,

              duration:
                1100,

              useNativeDriver:
                true,
            }
          ),

          Animated.timing(
            float,
            {
              toValue:
                0,

              duration:
                1100,

              useNativeDriver:
                true,
            }
          ),
        ])
      );

    pulseAnimation.start();

    floatAnimation.start();

    return () => {
      pulseAnimation.stop();

      floatAnimation.stop();
    };
  }, [
    float,
    pulse,
    reducedMotion,
  ]);

  const firstRingStyle = {
    opacity:
      pulse.interpolate({
        inputRange:
          [0, 1],

        outputRange:
          [
            0.22,
            0,
          ],
      }),

    transform: [
      {
        scale:
          pulse.interpolate({
            inputRange:
              [0, 1],

            outputRange:
              [
                1,
                1.55,
              ],
          }),
      },
    ],
  };

  const secondRingStyle = {
    opacity:
      pulse.interpolate({
        inputRange:
          [0, 1],

        outputRange:
          [
            0.11,
            0,
          ],
      }),

    transform: [
      {
        scale:
          pulse.interpolate({
            inputRange:
              [0, 1],

            outputRange:
              [
                1.18,
                1.92,
              ],
          }),
      },
    ],
  };

  const logoStyle = {
    transform: [
      {
        translateY:
          float.interpolate({
            inputRange:
              [0, 1],

            outputRange:
              [
                0,
                -5,
              ],
          }),
      },
    ],
  };

  return (
    <View
      onLayout={
        onLayout
      }
      style={[
        styles.container,

        {
          backgroundColor:
            colors.background,

          paddingHorizontal:
            spacing.xxxl,
        },
      ]}
    >
      <View
        style={
          styles.logoStage
        }
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,

            {
              borderColor:
                colors.primary,
            },

            firstRingStyle,
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,

            {
              borderColor:
                colors.primary,
            },

            secondRingStyle,
          ]}
        />

        <Animated.View
          style={
            logoStyle
          }
        >
          <FinanceLogo
            size={92}
          />
        </Animated.View>
      </View>

      <Text
        style={[
          typography.caption,

          styles.eyebrow,

          {
            color:
              colors.primary,

            marginTop:
              spacing.xxl,
          },
        ]}
      >
        WILLKOMMEN ZURÜCK
      </Text>

      <Text
        style={[
          typography.screenTitle,

          {
            color:
              colors.text,

            marginTop:
              spacing.xs,
          },
        ]}
      >
        Finance
      </Text>

      <Text
        style={[
          typography.small,

          styles.message,

          {
            color:
              colors.textSecondary,

            marginTop:
              spacing.sm,
          },
        ]}
      >
        {message}
      </Text>

      <View
        style={[
          styles.loadingTrack,

          {
            backgroundColor:
              colors.surfaceSecondary,

            marginTop:
              spacing.xxl,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.loadingPulse,

            {
              backgroundColor:
                colors.primary,

              opacity:
                pulse.interpolate({
                  inputRange:
                    [0, 1],

                  outputRange:
                    [
                      0.55,
                      1,
                    ],
                }),

              transform: [
                {
                  scaleX:
                    pulse.interpolate({
                      inputRange:
                        [0, 1],

                      outputRange:
                        [
                          0.55,
                          1,
                        ],
                    }),
                },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex:
        1,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    logoStage: {
      width:
        150,

      height:
        150,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    ring: {
      position:
        'absolute',

      width:
        100,

      height:
        100,

      borderRadius:
        50,

      borderWidth:
        1.5,
    },

    eyebrow: {
      letterSpacing:
        1.5,
    },

    message: {
      textAlign:
        'center',

      minHeight:
        20,
    },

    loadingTrack: {
      width:
        96,

      height:
        4,

      borderRadius:
        2,

      overflow:
        'hidden',
    },

    loadingPulse: {
      width:
        '100%',

      height:
        '100%',

      borderRadius:
        2,
    },
  });