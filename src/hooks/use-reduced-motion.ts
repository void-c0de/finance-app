import {
  useEffect,
  useState,
} from 'react';

import {
  AccessibilityInfo,
} from 'react-native';

/**
 * Respektiert die Android-Einstellung
 * "Animationen entfernen" / reduzierte Motion.
 */
export function usePrefersReducedMotion(): boolean {
  const [
    reducedMotion,
    setReducedMotion,
  ] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setReducedMotion(enabled);
        }
      })
      .catch(() => {
        /*
         * Wenn die Plattform-Antwort fehlt,
         * bleibt Motion aktiv - das ist der
         * sichere Fallback für diese App.
         */
      });

    const subscription =
      AccessibilityInfo.addEventListener(
        'reduceMotionChanged',
        (enabled) => {
          if (isMounted) {
            setReducedMotion(enabled);
          }
        }
      );

    return () => {
      isMounted = false;

      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
