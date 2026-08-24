import {
    useEffect,
    useState,
    type ReactNode,
} from 'react';

import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    type ScrollViewProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import {
    useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * FINANCE KEYBOARD-SAFE SCREEN ARCHITEKTUR
 * ========================================
 *
 * Globale Invariante (PLAN.md):
 *
 *   KEIN Texteingabe-Feld darf jemals
 *   von der Software-Tastatur verdeckt
 *   werden - auf jedem Geraet, in jedem
 *   Theme, in jeder Zukunft.
 *
 * Funktionsweise:
 * - Misst die tatsaechliche Keyboard-Hoehe
 *   ueber Keyboard-Events (funktioniert
 *   unabhaengig von windowSoftInputMode,
 *   auch bei Edge-to-Edge).
 * - Legt dynamisches unteres Padding auf
 *   den Scroll-Inhalt -> Fokus-Felder sind
 *   immer erreichbar/scrollbar.
 * - keyboardShouldPersistTaps: Buttons
 *   brauchen keinen Doppel-Tap.
 * - Tap auf Scrollflaeche schliesst die
 *   Tastatur (natuerliches Dismissal).
 */

export function useKeyboardVisibleHeight(): number {
  const [
    height,
    setHeight,
  ] =
    useState(0);

  useEffect(() => {
    const showListener =
      Keyboard.addListener(
        Platform.OS === 'ios'
          ? 'keyboardWillShow'
          : 'keyboardDidShow',

        (event) => {
          setHeight(
            event.endCoordinates?.height ??
              0,
          );
        },
      );

    const hideListener =
      Keyboard.addListener(
        Platform.OS === 'ios'
          ? 'keyboardWillHide'
          : 'keyboardDidHide',

        () => {
          setHeight(0);
        },
      );

    return () => {
      showListener.remove();

      hideListener.remove();
    };
  }, []);

  return height;
}

type FinanceKeyboardScreenProps = {
  children:
    ReactNode;

  /**
   * Fixierter Kopfbereich (z.B. Header
   * mit Zurueck-Button). Bleibt oberhalb
   * der scrollenden Flaeche sichtbar.
   */
  header?:
    ReactNode;

  /**
   * Hintergrundfarbe wird vom Theme
   * durch den Aufrufer gesetzt.
   */
  backgroundColor?:
    string;

  style?:
    StyleProp<ViewStyle>;

  /**
   * Extra-Padding unten (z.B. Tab-Bar-Hoehe).
   */
  extraBottomPadding?:
    number;

  contentContainerStyle?:
    StyleProp<ViewStyle>;

  scrollViewProps?: Omit<
    ScrollViewProps,
    | 'keyboardShouldPersistTaps'
    | 'style'
    | 'contentContainerStyle'
  >;
};

/**
 * Keyboard-sichere Standard-Screen-Huelle
 * fuer ALLE Formular-/Eingabe-Screens.
 *
 * WICHTIG: Kinder liegen in EINER zentralen
 * Scroll-Flaeche. Keine verschachtelten
 * ScrollViews innerhalb dieses Wrappers
 * verwenden - sonst greift das Keyboard-
 * Padding an der falschen Stelle.
 */
export function FinanceKeyboardScreen({
  children,

  header,

  backgroundColor,

  style,

  extraBottomPadding = 0,

  contentContainerStyle,

  scrollViewProps,
}: FinanceKeyboardScreenProps) {
  const insets =
    useSafeAreaInsets();

  const keyboardHeight =
    useKeyboardVisibleHeight();

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,

        backgroundColor
          ? { backgroundColor }

          : null,

        style,
      ]}

      behavior={
        Platform.OS === 'ios'
          ? 'padding'

          : undefined
      }
    >
      {header}

      <ScrollView
        {...scrollViewProps}

        keyboardShouldPersistTaps="handled"

        keyboardDismissMode={
          Platform.OS === 'android'
            ? 'on-drag'

            : 'interactive'
        }

        style={styles.flex}

        contentContainerStyle={[
          styles.grow,

          contentContainerStyle,

          {
            paddingBottom:
              keyboardHeight +
              insets.bottom +
              24 +
              extraBottomPadding,
          },
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles =
  StyleSheet.create({
    flex: {
      flex:
        1,
    },

    grow: {
      flexGrow:
        1,
    },
  });
