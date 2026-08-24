import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type FinanceHapticKind =
  | 'action'
  | 'selection'
  | 'success'
  | 'warning';

async function runAndroidHaptic(
  kind: FinanceHapticKind
): Promise<void> {
  const type =
    kind === 'success'
      ? Haptics.AndroidHaptics.Confirm
      : kind === 'warning'
        ? Haptics.AndroidHaptics.Reject
        : kind === 'selection'
          ? Haptics.AndroidHaptics.Segment_Tick
          : Haptics.AndroidHaptics.Context_Click;

  await Haptics.performAndroidHapticsAsync(
    type
  );
}

async function runFallbackHaptic(
  kind: FinanceHapticKind
): Promise<void> {
  if (kind === 'success') {
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    );

    return;
  }

  if (kind === 'warning') {
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning
    );

    return;
  }

  if (kind === 'selection') {
    await Haptics.selectionAsync();

    return;
  }

  await Haptics.impactAsync(
    Haptics.ImpactFeedbackStyle.Medium
  );
}

export async function performFinanceHaptic(
  kind: FinanceHapticKind = 'action'
): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await runAndroidHaptic(kind);

      return;
    }

    await runFallbackHaptic(kind);
  } catch (error) {
    try {
      await runFallbackHaptic(kind);
    } catch {
      if (__DEV__) {
        console.warn(
          'Haptic feedback unavailable:',
          error
        );
      }
    }
  }
}