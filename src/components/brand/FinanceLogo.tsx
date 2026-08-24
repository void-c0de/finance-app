import type {
    StyleProp,
    ViewStyle,
} from 'react-native';
import {
    View,
} from 'react-native';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

type FinanceLogoProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function FinanceLogo({
  size = 84,
  style,
}: FinanceLogoProps) {
  const {
    colors,
  } = useFinanceTheme();

  const outerRadius =
    size * 0.28;

  const contentWidth =
    size * 0.52;

  const contentHeight =
    size * 0.46;

  const gap =
    size * 0.055;

  const barWidth =
    size * 0.09;

  return (
    <View
      accessibilityLabel="Finance App Logo"
      style={[
        {
          width: size,
          height: size,

          borderRadius:
            outerRadius,

          backgroundColor:
            colors.primary,

          alignItems:
            'center',

          justifyContent:
            'center',
        },

        style,
      ]}
    >
      <View
        style={{
          width:
            contentWidth,

          height:
            contentHeight,

          flexDirection:
            'row',

          alignItems:
            'flex-end',

          justifyContent:
            'center',

          gap,
        }}
      >
        <View
          style={{
            width:
              barWidth,

            height:
              contentHeight *
              0.42,

            borderRadius:
              barWidth / 2,

            backgroundColor:
              '#FFFFFF',

            opacity:
              0.78,
          }}
        />

        <View
          style={{
            width:
              barWidth,

            height:
              contentHeight *
              0.68,

            borderRadius:
              barWidth / 2,

            backgroundColor:
              '#FFFFFF',

            opacity:
              0.9,
          }}
        />

        <View
          style={{
            width:
              barWidth,

            height:
              contentHeight,

            borderRadius:
              barWidth / 2,

            backgroundColor:
              '#FFFFFF',
          }}
        />
      </View>

      <View
        style={{
          position:
            'absolute',

          top:
            size * 0.2,

          right:
            size * 0.2,

          width:
            size * 0.105,

          height:
            size * 0.105,

          borderRadius:
            size * 0.053,

          backgroundColor:
            '#FFFFFF',
        }}
      />
    </View>
  );
}