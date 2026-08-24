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

import {
    Animated,
    StyleSheet,
    View,
} from 'react-native';

export type InteractionFeedbackVariant =
  | 'burst'
  | 'subtle';

type FeedbackRequest = {
  x: number;
  y: number;
  color: string;
  variant: InteractionFeedbackVariant;
};

type FeedbackInstance =
  FeedbackRequest & {
    id: number;
  };

type InteractionFeedbackContextValue = {
  emitFeedback: (
    request: FeedbackRequest
  ) => void;
};

const InteractionFeedbackContext =
  createContext<
    InteractionFeedbackContextValue | null
  >(null);

export function InteractionFeedbackProvider({
  children,
}: PropsWithChildren) {
  const nextId =
    useRef(1);

  const [
    feedback,
    setFeedback,
  ] =
    useState<
      FeedbackInstance[]
    >([]);

  const emitFeedback =
    useCallback(
      (
        request:
          FeedbackRequest
      ) => {
        const id =
          nextId.current;

        nextId.current += 1;

        setFeedback(
          (current) => [
            ...current,

            {
              id,
              ...request,
            },
          ]
        );
      },
      []
    );

  const removeFeedback =
    useCallback(
      (
        id: number
      ) => {
        setFeedback(
          (current) =>
            current.filter(
              (item) =>
                item.id !== id
            )
        );
      },
      []
    );

  const value =
    useMemo(
      () => ({
        emitFeedback,
      }),
      [
        emitFeedback,
      ]
    );

  return (
    <InteractionFeedbackContext.Provider
      value={value}
    >
      <View
        style={
          styles.root
        }
      >
        {children}

        <View
          pointerEvents="none"
          style={
            styles.overlay
          }
        >
          {feedback.map(
            (item) => (
              <FeedbackBurst
                key={
                  item.id
                }

                item={
                  item
                }

                onDone={
                  removeFeedback
                }
              />
            )
          )}
        </View>
      </View>
    </InteractionFeedbackContext.Provider>
  );
}

export function useInteractionFeedback():
InteractionFeedbackContextValue | null {
  return useContext(
    InteractionFeedbackContext
  );
}

type FeedbackBurstProps = {
  item:
    FeedbackInstance;

  onDone: (
    id: number
  ) => void;
};

function FeedbackBurst({
  item,
  onDone,
}: FeedbackBurstProps) {
  const progress =
    useRef(
      new Animated.Value(
        0
      )
    ).current;

  const hasFinished =
    useRef(false);

  const finish =
    useCallback(
      () => {
        if (
          hasFinished.current
        ) {
          return;
        }

        hasFinished.current =
          true;

        onDone(
          item.id
        );
      },
      [
        item.id,
        onDone,
      ]
    );

  useEffect(() => {
    progress.setValue(
      0
    );

    Animated.timing(
      progress,
      {
        toValue:
          1,

        duration:
          item.variant ===
          'burst'
            ? 520
            : 300,

        useNativeDriver:
          true,
      }
    ).start(
      ({
        finished,
      }) => {
        if (finished) {
          finish();
        }
      }
    );

    return () => {
      progress.stopAnimation();
    };
  }, [
    finish,
    item.variant,
    progress,
  ]);

  const ringScale =
    progress.interpolate({
      inputRange:
        [0, 1],

      outputRange:
        item.variant ===
        'burst'
          ? [
              0.45,
              1.65,
            ]
          : [
              0.6,
              1.2,
            ],
    });

  const ringOpacity =
    progress.interpolate({
      inputRange:
        [
          0,
          0.2,
          1,
        ],

      outputRange:
        [
          0,
          0.55,
          0,
        ],
    });

  const particleOpacity =
    progress.interpolate({
      inputRange:
        [
          0,
          0.12,
          0.7,
          1,
        ],

      outputRange:
        [
          0,
          1,
          0.65,
          0,
        ],
    });

  const particleScale =
    progress.interpolate({
      inputRange:
        [
          0,
          0.25,
          1,
        ],

      outputRange:
        [
          0.4,
          1,
          0.65,
        ],
    });

  const distance =
    item.variant ===
    'burst'
      ? 22
      : 10;

  const particles = [
    {
      x: -0.85,
      y: -1,
    },

    {
      x: 0.85,
      y: -1,
    },

    {
      x: -1,
      y: -0.2,
    },

    {
      x: 1,
      y: -0.2,
    },
  ];

  return (
    <View
      style={[
        styles.feedbackOrigin,

        {
          left:
            item.x,

          top:
            item.y,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.ring,

          {
            borderColor:
              item.color,

            opacity:
              ringOpacity,

            transform: [
              {
                scale:
                  ringScale,
              },
            ],
          },
        ]}
      />

      {particles.map(
        (
          particle,
          index
        ) => {
          const translateX =
            progress.interpolate({
              inputRange:
                [0, 1],

              outputRange: [
                0,

                particle.x *
                  distance,
              ],
            });

          const translateY =
            progress.interpolate({
              inputRange:
                [0, 1],

              outputRange: [
                0,

                particle.y *
                  distance,
              ],
            });

          return (
            <Animated.View
              key={
                index
              }

              style={[
                styles.particle,

                {
                  backgroundColor:
                    item.color,

                  opacity:
                    particleOpacity,

                  transform: [
                    {
                      translateX,
                    },

                    {
                      translateY,
                    },

                    {
                      scale:
                        particleScale,
                    },
                  ],
                },
              ]}
            />
          );
        }
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
    },

    overlay: {
      ...StyleSheet.absoluteFill,

      zIndex:
        9999,

      elevation:
        9999,
    },

    feedbackOrigin: {
      position:
        'absolute',

      width:
        1,

      height:
        1,
    },

    ring: {
      position:
        'absolute',

      left:
        -16,

      top:
        -16,

      width:
        32,

      height:
        32,

      borderRadius:
        16,

      borderWidth:
        1.5,
    },

    particle: {
      position:
        'absolute',

      left:
        -3,

      top:
        -3,

      width:
        7,

      height:
        7,

      borderRadius:
        4,
    },
  });