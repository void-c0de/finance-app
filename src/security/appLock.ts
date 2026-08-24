import * as LocalAuthentication from 'expo-local-authentication';

export async function authenticateForAppAccess(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();

  if (!hasHardware) {
    return true;
  }

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!isEnrolled) {
    return true;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Finance App entsperren',
    cancelLabel: 'Abbrechen',
    disableDeviceFallback: false,
  });

  return result.success;
}