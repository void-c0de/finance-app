import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Modal,
} from 'react-native';

import type {
  ReactNode,
} from 'react';

import {
  FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
  FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

export type FinanceDialogConfig =
  {
    title:
      string;

    message?:
      string;

    /**
     * danger roetet die Bestaetigungs-
     * Aktion (Loeschen/Entfernen),
     * default bleibt primaer.
     */
    tone?:
      | 'default'
      | 'danger';

    confirmLabel?:
      string;

    cancelLabel?:
      string;

    onConfirm?:
      () => void;
  };

type FinanceDialogProps =
  {
    visible:
      boolean;

    config:
      FinanceDialogConfig |
      null;

    onClose:
      () => void;
  };

/**
 * App-eigener Dialog statt des
 * Android-System-Alerts: gleiches
 * Design-System (Surface, Radius,
 * Typografie, Buttons), Scrim-Tap
 * schliesst, Bestaetigung immer eine
 * bewusste Aktion.
 */
export function FinanceDialog({
  visible,

  config,

  onClose,
}: FinanceDialogProps) {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  if (
    !config
  ) {
    return null;
  }

  const tone =
    config.tone ??
    'default';

  return (
    <Modal
      visible={
        visible &&
        config !==
          null
      }

      transparent

      animationType="fade"

      statusBarTranslucent

      onRequestClose={
        onClose
      }
    >
      <FinancePressable
        accessibilityRole="button"

        accessibilityLabel="Dialog schließen"

        onPress={
          onClose
        }

        intent="navigation"

        style={[
          styles.scrim,

          {
            backgroundColor:
              colors.scrim,
          },
        ]}
      >
        <PressableStopPropagation>
          <View
            style={[
              styles.card,

              {
                backgroundColor:
                  colors.surface,

                borderColor:
                  colors.border,

                borderRadius:
                  radius.xl,

                padding:
                  spacing.lg,
              },
            ]}
          >
            <Text
              style={[
                typography.title,

                {
                  color:
                    colors.text,
                },
              ]}
            >
              {config.title}
            </Text>

            {config.message ? (
              <Text
                style={[
                  typography.body,

                  styles.message,

                  {
                    color:
                      colors.textSecondary,

                    marginTop:
                      spacing.sm,
                  },
                ]}
              >
                {config.message}
              </Text>
            ) : null}

            <View
              style={[
                styles.actions,

                {
                  marginTop:
                    spacing.xl,

                  gap:
                    spacing.sm,
                },
              ]}
            >
              {config.cancelLabel ? (
                <FinanceButton
                  label={
                    config.cancelLabel
                  }

                  variant="secondary"

                  onPress={
                    onClose
                  }

                  style={
                    styles.actionButton
                  }
                />
              ) : null}

              <FinanceButton
                label={
                  config.confirmLabel ??
                  'OK'
                }

                variant={
                  tone ===
                  'danger'
                    ? 'danger'

                    : 'primary'
                }

                onPress={() => {
                  onClose();

                  config.onConfirm?.();
                }}

                style={
                  styles.actionButton
                }
              />
            </View>
          </View>
        </PressableStopPropagation>
      </FinancePressable>
    </Modal>
  );
}

/*
 * Hilfs-Wrapper: verhindert, dass
 * Tap-auf-Karte den Scrim-OnPress
 * ausloest (nested pressables).
 */
function PressableStopPropagation({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <View
      onStartShouldSetResponder={() =>
        true
      }

      style={
        styles.cardHost
      }
    >
      {children}
    </View>
  );
}

const styles =
  StyleSheet.create({
    scrim: {
      flex:
        1,

      alignItems:
        'center',

      justifyContent:
        'center',

      padding:
        24,
    },

    cardHost: {
      width:
        '100%',

      maxWidth:
        400,

      alignSelf:
        'center',
    },

    card: {
      width:
        '100%',

      borderWidth:
        StyleSheet.hairlineWidth,
    },

    message: {
      lineHeight:
        21,
    },

    actions: {
      flexDirection:
        'row',

      justifyContent:
        'flex-end',
    },

    actionButton: {
      minWidth:
        120,
    },
  });
