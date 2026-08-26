import {
    useState,
    type MutableRefObject,
} from 'react';

import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextInputProps,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';

import {
    useAutoScrollOnFocus,
} from '@/components/layout/FinanceKeyboardScreen';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FinanceTextFieldProps =
  TextInputProps & {
    /**
     * Ref auf das TextInput selbst -
     * fuer Next/Done-Fokus-Ketten.
     */
    inputRef?:
      MutableRefObject<
        TextInput | null
      >;

    label?:
      string;

    error?:
      string;

    helperText?:
      string;

    secureTextEntry?:
      boolean;

    containerStyle?:
      StyleProp<ViewStyle>;

    inputStyle?:
      StyleProp<TextStyle>;

    /**
     * Wrapper-View-Ref fuer den
     * Auto-Scroll-bei-Fokus.
     * Intern gesetzt, nicht von
     * aussen noetig.
     */
    wrapperRef?:
      MutableRefObject<
        View | null
      >;
  };

/**
 * Wiederverwendbares, keyboard-sicheres
 * Eingabefeld.
 *
 * - meldet sich beim Keyboard-Screen an
 *   (Auto-Scroll beim Fokus)
 * - Passwort: Augen-Symbol rechts,
 *   Toggle verliert NICHT den Fokus
 * - Label/Fehler/Hilfetext themenbewusst
 */
export function FinanceTextField({
  inputRef,

  label,

  error,

  helperText,

  secureTextEntry =

    false,

  containerStyle,

  inputStyle,

  wrapperRef:

    _wrapperRef,

  onFocus,

  ...textInputProps
}: FinanceTextFieldProps) {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const internalWrapper =
    useState<View | null>(null);

  const wrapperState =
    internalWrapper[0];

  const setWrapperState =
    internalWrapper[1];

  /*
   * Wenn kein externer Wrapper-Ref
   * uebergeben wurde, nutzen wir den
   * internen State-Hook-Pfad.
   */
  const autoScroll =
    useAutoScrollOnFocus(
      _wrapperRef ??
        ({
          current:
            wrapperState,
        } as MutableRefObject<View | null>),
    );

  const [
    passwordVisible,
    setPasswordVisible,
  ] =
    useState(false);

  const borderColor =
    error
      ? colors.negative

      : colors.borderStrong;

  return (
    <View
      ref={
        _wrapperRef ??
        setWrapperState
      }

      style={[
        styles.container,

        containerStyle,
      ]}
    >
      {label ? (
        <Text
          style={[
            typography.label,

            {
              color: colors.textSecondary,
            },
          ]}
        >
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputRow,

          {
            backgroundColor:
              colors.surfaceInteractive,

            borderColor,

            borderRadius:
              radius.md,
          },
        ]}
      >
        <TextInput
          {...textInputProps}

          ref={inputRef}

          secureTextEntry={
            secureTextEntry &&
            !passwordVisible
          }

          placeholderTextColor={
            colors.textMuted
          }

          selectionColor={
            colors.primary
          }

          onFocus={(event) => {
            autoScroll.onFocus();

            onFocus?.(event);
          }}

          style={[
            typography.body,

            styles.input,

            inputStyle,

            {
              color:
                colors.text,
            },
          ]}
        />

        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"

            accessibilityLabel={
              passwordVisible
                ? 'Passwort verbergen'

                : 'Passwort anzeigen'
            }

            onPress={() =>
              setPasswordVisible(
                (visible) =>
                  !visible,
              )
            }

            hitSlop={8}

            style={
              styles.eyeButton
            }
          >
            <Text
              style={[
                styles.eyeGlyph,

                {
                  color:
                    colors.textSecondary,
                },
              ]}
            >
              {passwordVisible
                ? '🙈'

                : '👁'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          style={[
            typography.small,

            styles.helper,

            {
              color:
                colors.negative,

              marginTop:
                spacing.xs,
            },
          ]}
        >
          {error}
        </Text>
      ) : helperText ? (
        <Text
          style={[
            typography.small,

            styles.helper,

            {
              color:
                colors.textMuted,

              marginTop:
                spacing.xs,
            },
          ]}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      width:
        '100%',
    },

    inputRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      borderWidth:
        1,
    },

    input: {
      flex:
        1,

      minHeight:
        48,

      paddingHorizontal:
        14,

      paddingVertical:
        12,
    },

    eyeButton: {
      paddingHorizontal:
        14,

      minHeight:
        44,

      justifyContent:
        'center',
    },

    eyeGlyph: {
      fontSize:
        16,
    },

    helper: {},
  });
