import {
    createContext,
    useContext,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type MutableRefObject,
} from 'react';

import type {
    StyleProp,
    ViewStyle,
} from 'react-native';

import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
} from 'react-native';

import {
    useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * FINANCE KEYBOARD-SAFE SCREEN ARCHITEKTUR
 * ========================================
 *
 * Globale Invariante (PLAN.md):
 *   Das FOKUSIERTE Eingabefeld bleibt immer
 *   deutlich ueber der Tastatur sichtbar.
 *
 * Funktionsweise:
 * 1. Tatsaechliche Keyboard-Hoehe wird ueber
 *    Keyboard-Events gemessen (unabhaengig von
 *    windowSoftInputMode / Edge-to-Edge).
 * 2. Der zentrale ScrollView erhaelt dynamisches
 *    unteres Padding in Hoehe der Tastatur.
 * 3. Eingabefelder melden sich per Hook an:
 *      useAutoScrollOnFocus(fieldWrapperRef)
 *    Beim Fokus misst die Flaeche das Feld und
 *    scrollt es sanft oberhalb der Tastatur.
 * 4. keyboardShouldPersistTaps="handled": Buttons
 *    (z.B. Passwort-Augen-Symbol) brauchen keinen
 *    Doppel-Tap und rauben nicht den Fokus.
 */

type ScrollIntoViewFn = (
  fieldRef:
    MutableRefObject<
      | import('react-native').View
      | null
    >,
) => void;

type KeyboardScrollContextValue =
  | {
      scrollFieldIntoView:
        ScrollIntoViewFn;

      keyboardVisible:
        boolean;
    }
  | null;

const KeyboardScrollContext =
  createContext<KeyboardScrollContextValue>(
    null,
  );

export function useFinanceKeyboardScroll():
  KeyboardScrollContextValue {
  return useContext(
    KeyboardScrollContext,
  );
}

/**
 * Hook fuer Eingabefelder:
 * Wrapper-Ref uebergeben; beim Fokus
 * scrollt der Screen das Feld automatisch
 * ins sichtbare Bereich oberhalb der Tastatur.
 */
export function useAutoScrollOnFocus(
  fieldWrapperRef:
    MutableRefObject<
      import('react-native').View
      | null
    >,

): {
  onFocus:
    () => void;
} {
  const context =
    useContext(
      KeyboardScrollContext,
    );

  const [
    focused,
    setFocused,
  ] =
    useState(false);

  useEffect(() => {
    if (
      focused &&
      context
    ) {
      /*
       * Nach dem Layout-Pass messen, damit
       * evtl. eingeblendete Labels korrekt
       * beruecksichtigt werden.
       */
      const timer =
        setTimeout(() => {
          context.scrollFieldIntoView(
            fieldWrapperRef,
          );
        }, 60);

      return () =>
        clearTimeout(timer);
    }

    return undefined;
  }, [
    focused,
    context,
    fieldWrapperRef,
  ]);

  return {
    onFocus: () =>
      setFocused(true),
  };
}

export function useKeyboardVisible(): boolean {
  const [
    visible,
    setVisible,
  ] =
    useState(false);

  useEffect(() => {
    const show =
      Keyboard.addListener(
        Platform.OS === 'ios'
          ? 'keyboardWillShow'
          : 'keyboardDidShow',

        () =>
          setVisible(true),
      );

    const hide =
      Keyboard.addListener(
        Platform.OS === 'ios'
          ? 'keyboardWillHide'
          : 'keyboardDidHide',

        () =>
          setVisible(false),
      );

    return () => {
      show.remove();

      hide.remove();
    };
  }, []);

  return visible;
}

type FinanceKeyboardScreenProps = {
  children:
    ReactNode;

  /**
   * Fixierter Kopfbereich (z.B. Header
   * mit Zurueck-Button).
   */
  header?:
    ReactNode;

  backgroundColor?:
    string;

  style?:
    StyleProp<ViewStyle>;

  /**
   * Extra-Padding unten
   * (z.B. Tab-Bar-Hoehe).
   */
  extraBottomPadding?:
    number;

  contentContainerStyle?:
    StyleProp<ViewStyle>;
};

export function FinanceKeyboardScreen({
  children,

  header,

  backgroundColor,

  style,

  extraBottomPadding = 0,

  contentContainerStyle,
}: FinanceKeyboardScreenProps) {
  const insets =
    useSafeAreaInsets();

  const [
    keyboardHeight,
    setKeyboardHeight,
  ] =
    useState(0);

  const scrollerRef =
    useRef<ScrollView | null>(
      null,
    );

  const scrollerHeightRef =
    useRef(0);

  const scrollerYRef =
    useRef(0);

  useEffect(() => {
    const show =
      Keyboard.addListener(
        Platform.OS === 'ios'
          ? 'keyboardWillShow'
          : 'keyboardDidShow',

        (event) => {
          setKeyboardHeight(
            event.endCoordinates?.height ??
              0,
          );
        },
      );

    const hide =
      Keyboard.addListener(
        Platform.OS === 'ios'
          ? 'keyboardWillHide'
          : 'keyboardDidHide',

        () => {
          setKeyboardHeight(0);
        },
      );

    return () => {
      show.remove();

      hide.remove();
    };
  }, []);

  const scrollFieldIntoView =
    useCallback<ScrollIntoViewFn>((fieldRef) => {
      const scroller =
        scrollerRef.current;

      const field =
        fieldRef.current;

      if (!scroller || !field) {
        return;
      }

      field.measureLayout(
        scroller as never,

        (_x, y, _w, h) => {
          const keyboardTop =
            scrollerHeightRef.current -
            keyboardHeight;

          const fieldBottom =
            y + h + 12;

          if (
            fieldBottom >
            keyboardTop
          ) {
            scroller.scrollTo({
              y:
                Math.max(
                  0,
                  scrollerYRef.current +
                    fieldBottom -
                    keyboardTop,
                ),

              animated: true,
            });
          }
        },

        () => undefined,
      );
    }, [keyboardHeight]);

  const contextValue =
    useMemo<KeyboardScrollContextValue>(() => ({
      scrollFieldIntoView,

      keyboardVisible:
        keyboardHeight >
        0,
    }), [scrollFieldIntoView, keyboardHeight]);

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

      <KeyboardScrollContext.Provider
        value={contextValue}
      >
        <ScrollView
          ref={(instance) => {
            scrollerRef.current = instance;
          }}

          keyboardShouldPersistTaps="handled"

          keyboardDismissMode={
            Platform.OS === 'android'
              ? 'on-drag'

              : 'interactive'
          }

          style={styles.flex}

          scrollEventThrottle={16}

          onLayout={(event) => {
            scrollerHeightRef.current =
              event.nativeEvent.layout.height;
          }}

          onScroll={(event) => {
            scrollerYRef.current =
              event.nativeEvent.contentOffset.y;
          }}

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
      </KeyboardScrollContext.Provider>
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
