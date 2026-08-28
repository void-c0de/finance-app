import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * The Finance mark (rounded tile · three rising pillars · a ball) with the ball
 * brought to life for the boot screen:
 *
 *   1. it hops up the three pillars, squashing on each landing
 *   2. loops once around the top pillar ("im Kreis drehen")
 *   3. arcs up to its home spot at the top-right of the mark
 *   4. bounces twice and settles — at which point the mark matches the static
 *      `FinanceLogo` exactly, then the loop restarts
 *
 * Everything is transform + opacity → `useNativeDriver: true`. Honors the
 * system "reduce motion" setting (renders the resolved static mark).
 */

type Props = { size?: number };

// Ball path keyframes. Units = fraction of `size`, origin = tile centre,
// y negative = up. `t` is the position along the loop (0..1), strictly rising.
type Key = { t: number; x: number; y: number; sx?: number; sy?: number; o?: number };

const HOME_X = 0.2475;
const HOME_Y = -0.2475;
const BAR1 = { x: -0.145, y: -0.015 };
const BAR2 = { x: 0.0, y: -0.135 };
const BAR3 = { x: 0.145, y: -0.282 };

const KEYS: Key[] = [
  { t: 0.0, x: BAR1.x, y: BAR1.y, sx: 0.55, sy: 0.55, o: 0 },
  { t: 0.05, x: BAR1.x, y: BAR1.y, o: 1 },
  { t: 0.09, x: BAR1.x, y: BAR1.y + 0.022, sx: 1.22, sy: 0.78 },
  { t: 0.12, x: BAR1.x, y: BAR1.y },
  // hop 1 → bar 2
  { t: 0.135, x: -0.118, y: -0.16 },
  { t: 0.16, x: -0.072, y: -0.238 },
  { t: 0.185, x: -0.03, y: -0.184 },
  { t: 0.2, x: BAR2.x, y: BAR2.y, sx: 1.26, sy: 0.74 },
  { t: 0.23, x: BAR2.x, y: BAR2.y },
  // hop 2 → bar 3
  { t: 0.25, x: 0.03, y: -0.28 },
  { t: 0.28, x: 0.072, y: -0.378 },
  { t: 0.31, x: 0.11, y: -0.338 },
  { t: 0.33, x: BAR3.x, y: BAR3.y, sx: 1.3, sy: 0.7 },
  { t: 0.36, x: BAR3.x, y: BAR3.y },
  // one loop around the top pillar (circle centred r above bar 3)
  { t: 0.385, x: 0.196, y: -0.303 },
  { t: 0.41, x: 0.217, y: -0.354 },
  { t: 0.435, x: 0.196, y: -0.405 },
  { t: 0.46, x: 0.145, y: -0.426 },
  { t: 0.485, x: 0.094, y: -0.405 },
  { t: 0.51, x: 0.073, y: -0.354 },
  { t: 0.535, x: 0.094, y: -0.303 },
  { t: 0.56, x: BAR3.x, y: BAR3.y, sx: 1.2, sy: 0.8 },
  { t: 0.585, x: BAR3.x, y: BAR3.y },
  // arc up-right to home
  { t: 0.62, x: 0.17, y: -0.365 },
  { t: 0.655, x: 0.2, y: -0.405 },
  { t: 0.69, x: 0.228, y: -0.31 },
  { t: 0.715, x: HOME_X, y: HOME_Y, sx: 1.22, sy: 0.78 },
  // settle
  { t: 0.75, x: HOME_X, y: HOME_Y - 0.05 },
  { t: 0.78, x: HOME_X, y: HOME_Y, sx: 1.12, sy: 0.88 },
  { t: 0.81, x: HOME_X, y: HOME_Y - 0.02 },
  { t: 0.84, x: HOME_X, y: HOME_Y, sx: 1.04, sy: 0.96 },
  { t: 0.87, x: HOME_X, y: HOME_Y },
  // hold (matches the static logo), then fade + teleport back
  { t: 0.95, x: HOME_X, y: HOME_Y, o: 1 },
  { t: 0.985, x: HOME_X, y: HOME_Y, o: 0 },
  { t: 1.0, x: BAR1.x, y: BAR1.y, o: 0 },
];

// eased sub-sequence: (toProgress, durationMs, easing)
const SEGMENTS: [number, number, ((v: number) => number)][] = [
  [0.05, 260, Easing.out(Easing.quad)],
  [0.12, 300, Easing.out(Easing.quad)],
  [0.2, 380, Easing.inOut(Easing.quad)],
  [0.23, 140, Easing.linear],
  [0.33, 400, Easing.inOut(Easing.quad)],
  [0.36, 160, Easing.out(Easing.quad)],
  [0.585, 900, Easing.inOut(Easing.sin)],
  [0.715, 480, Easing.out(Easing.quad)],
  [0.87, 520, Easing.out(Easing.quad)],
  [0.95, 620, Easing.linear],
  [1.0, 360, Easing.in(Easing.quad)],
];

function ramp(pick: (k: Key) => number | undefined, fallback: number) {
  let last = fallback;
  const out = KEYS.map((k) => {
    const v = pick(k);
    if (v === undefined) return last;
    last = v;
    return v;
  });
  return out;
}

export function FinanceLogoAnimated({ size = 92 }: Props) {
  const { colors } = useFinanceTheme();
  const reducedMotion = usePrefersReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(0.9); // resolved / at-home frame
      return;
    }
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence(
        SEGMENTS.map(([toValue, duration, easing]) =>
          Animated.timing(progress, { toValue, duration, easing, useNativeDriver: true }),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reducedMotion]);

  const inputRange = KEYS.map((k) => k.t);
  const ballX = progress.interpolate({ inputRange, outputRange: ramp((k) => k.x, BAR1.x).map((v) => v * size) });
  const ballY = progress.interpolate({ inputRange, outputRange: ramp((k) => k.y, BAR1.y).map((v) => v * size) });
  const ballSx = progress.interpolate({ inputRange, outputRange: ramp((k) => k.sx, 1) });
  const ballSy = progress.interpolate({ inputRange, outputRange: ramp((k) => k.sy, 1) });
  const ballO = progress.interpolate({ inputRange, outputRange: ramp((k) => k.o, 1) });

  const outerRadius = size * 0.28;
  const contentWidth = size * 0.52;
  const contentHeight = size * 0.46;
  const gap = size * 0.055;
  const barWidth = size * 0.09;
  const ball = size * 0.105;

  return (
    <View
      accessibilityLabel="Finance App Logo"
      style={{
        width: size,
        height: size,
        borderRadius: outerRadius,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: contentWidth,
          height: contentHeight,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap,
        }}
      >
        {[0.42, 0.68, 1].map((h, i) => (
          <View
            key={i}
            style={{
              width: barWidth,
              height: contentHeight * h,
              borderRadius: barWidth / 2,
              backgroundColor: '#FFFFFF',
              opacity: 0.78 + i * 0.11,
            }}
          />
        ))}
      </View>

      <Animated.View
        style={{
          position: 'absolute',
          left: size / 2 - ball / 2,
          top: size / 2 - ball / 2,
          width: ball,
          height: ball,
          borderRadius: ball / 2,
          backgroundColor: '#FFFFFF',
          opacity: ballO,
          transform: [{ translateX: ballX }, { translateY: ballY }, { scaleX: ballSx }, { scaleY: ballSy }],
        }}
      />
    </View>
  );
}
