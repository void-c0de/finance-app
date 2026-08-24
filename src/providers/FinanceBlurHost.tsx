import {
    createContext,
    type PropsWithChildren,
    type RefObject,
    useContext,
    useRef,
} from 'react';

import {
    View,
} from 'react-native';

import {
    BlurTargetView,
} from 'expo-blur';

const FinanceBlurTargetContext =
  createContext<
    RefObject<
      View | null
    > | null
  >(null);

export function FinanceBlurHost({
  children,
}: PropsWithChildren) {
  const targetRef =
    useRef<
      View | null
    >(null);

  return (
    <FinanceBlurTargetContext.Provider
      value={
        targetRef
      }
    >
      <BlurTargetView
        ref={
          targetRef
        }

        style={{
          flex: 1,
        }}
      >
        {children}
      </BlurTargetView>
    </FinanceBlurTargetContext.Provider>
  );
}

export function useFinanceBlurTarget():
RefObject<View | null> | null {
  return useContext(
    FinanceBlurTargetContext
  );
}