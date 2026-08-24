import {
    BlurView,
} from 'expo-blur';

import {
    type ReactNode,
    useRef,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
    FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    useFinanceBlurTarget,
} from '@/providers/FinanceBlurHost';

import {
    financeMotion,
} from '@/theme/finance-motion';

type FinanceSearchFieldProps<T> = {
  value:
    string;

  onChangeText:
    (
      value: string
    ) => void;

  placeholder?:
    string;

  results:
    readonly T[];

  keyExtractor:
    (
      item: T,
      index: number
    ) => string;

  renderResult:
    (
      item: T
    ) => ReactNode;

  onSelect:
    (
      item: T
    ) => void;

  resultsTitle?:
    string;

  emptyTitle?:
    string;

  emptyDescription?:
    string;

  isLoading?:
    boolean;
};

export function FinanceSearchField<T>({
  value,

  onChangeText,

  placeholder =
    'Suchen',

  results,

  keyExtractor,

  renderResult,

  onSelect,

  resultsTitle =
    'Ergebnisse',

  emptyTitle =
    'Keine Ergebnisse',

  emptyDescription =
    'Versuche einen anderen Suchbegriff.',

  isLoading =
    false,
}: FinanceSearchFieldProps<T>) {
  const {
    colors,
    isDark,
    radius,
    spacing,
    typography,
  } = useFinanceTheme();

  const insets =
    useSafeAreaInsets();

  const blurTarget =
    useFinanceBlurTarget();

  const [
    modalVisible,
    setModalVisible,
  ] =
    useState(false);

  const entrance =
    useRef(
      new Animated.Value(0)
    ).current;

  function openSearch() {
    setModalVisible(
      true
    );

    entrance.setValue(
      0
    );

    requestAnimationFrame(
      () => {
        Animated.spring(
          entrance,
          {
            toValue:
              1,

            speed:
              financeMotion
                .search
                .springSpeed,

            bounciness:
              4,

            useNativeDriver:
              true,
          }
        ).start();
      }
    );
  }

  function closeSearch() {
    Keyboard.dismiss();

    Animated.timing(
      entrance,
      {
        toValue:
          0,

        duration:
          financeMotion
            .duration
            .fast,

        useNativeDriver:
          true,
      }
    ).start(
      ({
        finished,
      }) => {
        if (finished) {
          setModalVisible(
            false
          );
        }
      }
    );
  }

  function selectResult(
    item: T
  ) {
    Keyboard.dismiss();

    setModalVisible(
      false
    );

    onSelect(item);
  }

  const overlayStyle = {
    opacity:
      entrance,

    transform: [
      {
        translateY:
          entrance.interpolate({
            inputRange:
              [0, 1],

            outputRange: [
              financeMotion
                .search
                .entranceTranslateY,

              0,
            ],
          }),
      },

      {
        scale:
          entrance.interpolate({
            inputRange:
              [0, 1],

            outputRange: [
              financeMotion
                .search
                .entranceScale,

              1,
            ],
          }),
      },
    ],
  };

  return (
    <>
      <FinancePressable
        accessibilityRole="button"

        accessibilityLabel={
          `${placeholder} öffnen`
        }

        onPress={
          openSearch
        }

        splashEffect={
          false
        }

        hapticFeedback={
          false
        }

        tapScale={
          0.992
        }

        style={[
          styles.collapsed,

          {
            backgroundColor:
              colors.surface,

            borderColor:
              colors.border,

            borderRadius:
              radius.lg,
          },
        ]}

        contentStyle={
          styles.collapsedContent
        }
      >
        <Text
          style={[
            styles.searchGlyph,

            {
              color:
                colors.textMuted,
            },
          ]}
        >
          ⌕
        </Text>

        <Text
          numberOfLines={
            1
          }

          style={[
            typography.body,

            styles.collapsedText,

            {
              color:
                value.length >
                0
                  ? colors.text

                  : colors.textMuted,
            },
          ]}
        >
          {value.length >
          0
            ? value

            : placeholder}
        </Text>

        <Text
          style={[
            typography.caption,

            {
              color:
                colors.textMuted,
            },
          ]}
        >
          Tippen
        </Text>
      </FinancePressable>

      <Modal
        visible={
          modalVisible
        }

        transparent

        statusBarTranslucent

        navigationBarTranslucent

        animationType="none"

        onRequestClose={
          closeSearch
        }
      >
        <View
          style={
            styles.modalRoot
          }
        >
          <BlurView
            style={
              StyleSheet
                .absoluteFill
            }

            intensity={
              42
            }

            tint={
              isDark
                ? 'dark'
                : 'light'
            }

            blurMethod="dimezisBlurViewSdk31Plus"

            blurTarget={
              blurTarget ??
              undefined
            }
          />

          <View
            pointerEvents="none"

            style={[
              StyleSheet
                .absoluteFill,

              {
                backgroundColor:
                  isDark
                    ? 'rgba(0, 0, 0, 0.34)'

                    : 'rgba(245, 246, 248, 0.28)',
              },
            ]}
          />

          <Pressable
            accessibilityRole="button"

            accessibilityLabel="Suche schließen"

            onPress={
              closeSearch
            }

            style={
              StyleSheet
                .absoluteFill
            }
          />

          <KeyboardAvoidingView
            style={
              styles.keyboardAvoider
            }

            behavior={
              Platform.OS ===
              'ios'
                ? 'padding'
                : 'height'
            }
          >
            <Animated.View
              style={[
                styles.dock,

                {
                  paddingHorizontal:
                    spacing.lg,

                  paddingBottom:
                    Math.max(
                      insets.bottom,
                      spacing.md
                    ) +
                    spacing.sm,
                },

                overlayStyle,
              ]}
            >
              <View
                style={[
                  styles.resultsPanel,

                  {
                    backgroundColor:
                      colors.surface,

                    borderColor:
                      colors.border,

                    borderRadius:
                      radius.xl,

                    marginBottom:
                      spacing.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.resultsHeader,

                    {
                      paddingHorizontal:
                        spacing.lg,

                      paddingTop:
                        spacing.lg,

                      paddingBottom:
                        spacing.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.caption,

                      styles.resultsTitle,

                      {
                        color:
                          colors.textMuted,
                      },
                    ]}
                  >
                    {resultsTitle
                      .toUpperCase()}
                  </Text>

                  <Text
                    style={[
                      typography.caption,

                      {
                        color:
                          colors.textMuted,
                      },
                    ]}
                  >
                    {results.length}
                  </Text>
                </View>

                {isLoading ? (
                  <View
                    style={
                      styles.loadingResults
                    }
                  >
                    <ActivityIndicator
                      color={
                        colors.primary
                      }
                    />
                  </View>
                ) : results.length ===
                  0 ? (
                  <View
                    style={[
                      styles.emptyResults,

                      {
                        padding:
                          spacing.xl,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.bodyMedium,

                        {
                          color:
                            colors.text,
                        },
                      ]}
                    >
                      {emptyTitle}
                    </Text>

                    <Text
                      style={[
                        typography.small,

                        {
                          color:
                            colors.textSecondary,

                          marginTop:
                            spacing.xs,
                        },
                      ]}
                    >
                      {emptyDescription}
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"

                    showsVerticalScrollIndicator={
                      false
                    }

                    style={
                      styles.resultsScroll
                    }
                  >
                    {results.map(
                      (
                        item,
                        index
                      ) => (
                        <FinancePressable
                          key={
                            keyExtractor(
                              item,
                              index
                            )
                          }

                          onPress={() => {
                            selectResult(
                              item
                            );
                          }}

                          /*
                           * Suchresultat =
                           * subtile Navigation,
                           * keine Vibration.
                           */
                          splashEffect={
                            false
                          }

                          hapticFeedback={
                            false
                          }

                          tapScale={
                            0.994
                          }

                          style={[
                            styles.resultButton,

                            {
                              borderTopColor:
                                index ===
                                0
                                  ? 'transparent'

                                  : colors.border,
                            },
                          ]}

                          contentStyle={
                            styles.resultContent
                          }
                        >
                          {renderResult(
                            item
                          )}
                        </FinancePressable>
                      )
                    )}
                  </ScrollView>
                )}
              </View>

              <View
                style={[
                  styles.activeSearch,

                  {
                    backgroundColor:
                      colors.surfaceElevated,

                    borderColor:
                      colors.primary,

                    borderRadius:
                      radius.xl,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.searchGlyph,

                    {
                      color:
                        colors.primary,
                    },
                  ]}
                >
                  ⌕
                </Text>

                <TextInput
                  autoFocus

                  value={
                    value
                  }

                  onChangeText={
                    onChangeText
                  }

                  placeholder={
                    placeholder
                  }

                  placeholderTextColor={
                    colors.textMuted
                  }

                  autoCorrect={
                    false
                  }

                  selectionColor={
                    colors.primary
                  }

                  returnKeyType="search"

                  style={[
                    typography.body,

                    styles.input,

                    {
                      color:
                        colors.text,
                    },
                  ]}
                />

                {value.length >
                0 ? (
                  <FinancePressable
                    accessibilityRole="button"

                    accessibilityLabel="Suche leeren"

                    onPress={() =>
                      onChangeText(
                        ''
                      )
                    }

                    splashEffect={
                      false
                    }

                    hapticFeedback={
                      false
                    }

                    style={
                      styles.clearButton
                    }

                    contentStyle={
                      styles.clearContent
                    }
                  >
                    <Text
                      style={[
                        styles.clearGlyph,

                        {
                          color:
                            colors.textSecondary,
                        },
                      ]}
                    >
                      ×
                    </Text>
                  </FinancePressable>
                ) : (
                  <FinancePressable
                    accessibilityRole="button"

                    accessibilityLabel="Suche schließen"

                    onPress={
                      closeSearch
                    }

                    splashEffect={
                      false
                    }

                    hapticFeedback={
                      false
                    }

                    style={
                      styles.clearButton
                    }

                    contentStyle={
                      styles.clearContent
                    }
                  >
                    <Text
                      style={[
                        typography.smallMedium,

                        {
                          color:
                            colors.primary,
                        },
                      ]}
                    >
                      Fertig
                    </Text>
                  </FinancePressable>
                )}
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles =
  StyleSheet.create({
    collapsed: {
      minHeight:
        56,

      borderWidth:
        1,
    },

    collapsedContent: {
      minHeight:
        54,

      paddingHorizontal:
        16,

      flexDirection:
        'row',

      alignItems:
        'center',
    },

    collapsedText: {
      flex:
        1,

      marginHorizontal:
        10,
    },

    searchGlyph: {
      fontSize:
        25,

      lineHeight:
        28,
    },

    modalRoot: {
      flex:
        1,
    },

    keyboardAvoider: {
      flex:
        1,
    },

    dock: {
      flex:
        1,

      justifyContent:
        'flex-end',
    },

    resultsPanel: {
      maxHeight:
        370,

      flexShrink:
        1,

      borderWidth:
        StyleSheet
          .hairlineWidth,

      overflow:
        'hidden',
    },

    resultsHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    resultsTitle: {
      letterSpacing:
        1.1,
    },

    loadingResults: {
      minHeight:
        120,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    emptyResults: {
      minHeight:
        110,

      justifyContent:
        'center',
    },

    resultsScroll: {
      flexShrink:
        1,
    },

    resultButton: {
      borderTopWidth:
        StyleSheet
          .hairlineWidth,
    },

    resultContent: {
      minHeight:
        72,

      paddingHorizontal:
        16,

      paddingVertical:
        8,

      justifyContent:
        'center',
    },

    activeSearch: {
      minHeight:
        60,

      borderWidth:
        1.5,

      paddingHorizontal:
        16,

      flexDirection:
        'row',

      alignItems:
        'center',
    },

    input: {
      flex:
        1,

      paddingVertical:
        0,

      marginHorizontal:
        10,
    },

    clearButton: {
      minHeight:
        42,

      minWidth:
        42,
    },

    clearContent: {
      minHeight:
        42,

      minWidth:
        42,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    clearGlyph: {
      fontSize:
        28,

      lineHeight:
        30,
    },
  });