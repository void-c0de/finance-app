import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Animated, Easing, StyleSheet, View } from 'react-native';

export type InteractionFeedbackVariant = 'burst' | 'subtle';

type FeedbackRequest = {
  x: number;
  y: number;
  color: string;
  variant: InteractionFeedbackVariant;
};

type FeedbackInstance = FeedbackRequest & { id: number };

type InteractionFeedbackContextValue = {
  emitFeedback: (request: FeedbackRequest) => void;
};

const InteractionFeedbackContext = createContext<InteractionFeedbackContextValue | null>(null);

export function InteractionFeedbackProvider({ children }: PropsWithChildren) {
  const nextId = useRef(1);
  const [feedback, setFeedback] = useState<FeedbackInstance[]>([]);

  const emitFeedback = useCallback((request: FeedbackRequest) => {
    const id = nextId.current;
    nextId.current += 1;
    setFeedback((current) => {
      // keep the overlay light — never queue more than a few at once
      const next = current.length >= 4 ? current.slice(1) : current;
      return [...next, { id, ...request }];
    });
  }, []);

  const removeFeedback = useCallback((id: number) => {
    setFeedback((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ emitFeedback }), [emitFeedback]);

  return (
    <InteractionFeedbackContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="none" style={styles.overlay}>
          {feedback.map((item) => (
            <FeedbackBurst key={item.id} item={item} onDone={removeFeedback} />
          ))}
        </View>
      </View>
    </InteractionFeedbackContext.Provider>
  );
}

export function useInteractionFeedback(): InteractionFeedbackContextValue | null {
  return useContext(InteractionFeedbackContext);
}

type FeedbackBurstProps = {
  item: FeedbackInstance;
  onDone: (id: number) => void;
};

// six sparks, gently varied — reads as a soft "confirm" bloom, not a firework
const PARTICLES = [
  { angle: -110, size: 7, reach: 1.0 },
  { angle: -70, size: 6, reach: 0.92 },
  { angle: -30, size: 5, reach: 0.8 },
  { angle: -150, size: 5, reach: 0.8 },
  { angle: 20, size: 4, reach: 0.62 },
  { angle: 200, size: 4, reach: 0.62 },
];

function FeedbackBurst({ item, onDone }: FeedbackBurstProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const hasFinished = useRef(false);
  const isBurst = item.variant === 'burst';

  const finish = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    onDone(item.id);
  }, [item.id, onDone]);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: isBurst ? 460 : 280,
      easing: Easing.bezier(0.16, 1, 0.3, 1), // fluid ease-out (like a spring settle)
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) finish();
    });
    return () => progress.stopAnimation();
  }, [finish, isBurst, progress]);

  const glowScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: isBurst ? [0.2, 2.4] : [0.3, 1.6],
  });
  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [0, isBurst ? 0.28 : 0.18, 0],
  });
  const ringScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: isBurst ? [0.35, 1.9] : [0.5, 1.35],
  });
  const ringOpacity = progress.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0, isBurst ? 0.6 : 0.4, 0],
  });
  const particleOpacity = progress.interpolate({
    inputRange: [0, 0.1, 0.65, 1],
    outputRange: [0, 1, 0.7, 0],
  });
  const particleScale = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.3, 1, 0.55],
  });

  const distance = isBurst ? 26 : 12;

  return (
    <View style={[styles.origin, { left: item.x, top: item.y }]}>
      <Animated.View
        style={[
          styles.glow,
          { backgroundColor: item.color, opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { borderColor: item.color, opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      {PARTICLES.map((p, index) => {
        const rad = (p.angle * Math.PI) / 180;
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.cos(rad) * distance * p.reach],
        });
        const translateY = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.sin(rad) * distance * p.reach],
        });
        return (
          <Animated.View
            key={index}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                marginLeft: -p.size / 2,
                marginTop: -p.size / 2,
                backgroundColor: item.color,
                opacity: particleOpacity,
                transform: [{ translateX }, { translateY }, { scale: particleScale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 9999, elevation: 9999 },
  origin: { position: 'absolute', width: 1, height: 1 },
  glow: {
    position: 'absolute',
    left: -26,
    top: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  ring: {
    position: 'absolute',
    left: -18,
    top: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  particle: { position: 'absolute' },
});
