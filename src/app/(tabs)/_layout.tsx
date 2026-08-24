import {
  Tabs,
} from 'expo-router';

import {
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

type TabIconKind =
  | 'home'
  | 'transactions'
  | 'planning'
  | 'more';

type TabIconProps = {
  kind: TabIconKind;

  color: ColorValue;

  focused: boolean;

  size: number;
};

function TabIcon({
  kind,
  color,
  focused,
  size,
}: TabIconProps) {
  const iconSize =
    Math.max(
      22,
      size
    );

  if (
    kind ===
    'home'
  ) {
    return (
      <View
        style={[
          styles.iconStage,

          {
            width:
              iconSize,

            height:
              iconSize,
          },
        ]}
      >
        <View
          style={[
            styles.homeRoof,

            {
              borderColor:
                color,

              backgroundColor:
                focused
                  ? color
                  : 'transparent',
            },
          ]}
        />

        <View
          style={[
            styles.homeBody,

            {
              borderColor:
                color,

              backgroundColor:
                focused
                  ? color
                  : 'transparent',
            },
          ]}
        />
      </View>
    );
  }

  if (
    kind ===
    'transactions'
  ) {
    return (
      <View
        style={[
          styles.iconStage,

          {
            width:
              iconSize,

            height:
              iconSize,
          },
        ]}
      >
        <View
          style={
            styles.transactionGroup
          }
        >
          <View
            style={[
              styles.transactionRow,

              {
                backgroundColor:
                  color,

                opacity:
                  focused
                    ? 1
                    : 0.72,
              },
            ]}
          />

          <View
            style={[
              styles.transactionRow,

              styles.transactionRowMiddle,

              {
                backgroundColor:
                  color,

                opacity:
                  focused
                    ? 1
                    : 0.72,
              },
            ]}
          />

          <View
            style={[
              styles.transactionRow,

              styles.transactionRowShort,

              {
                backgroundColor:
                  color,

                opacity:
                  focused
                    ? 1
                    : 0.72,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  if (
    kind ===
    'planning'
  ) {
    return (
      <View
        style={[
          styles.iconStage,

          {
            width:
              iconSize,

            height:
              iconSize,
          },
        ]}
      >
        <View
          style={[
            styles.planningRing,

            {
              borderColor:
                color,

              borderWidth:
                focused
                  ? 3
                  : 2,
            },
          ]}
        >
          <View
            style={[
              styles.planningBarTall,

              {
                backgroundColor:
                  color,
              },
            ]}
          />

          <View
            style={[
              styles.planningBarShort,

              {
                backgroundColor:
                  color,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.iconStage,

        {
          width:
            iconSize,

          height:
            iconSize,
        },
      ]}
    >
      <View
        style={
          styles.moreDots
        }
      >
        <View
          style={[
            styles.moreDot,

            {
              backgroundColor:
                color,

              transform: [
                {
                  scale:
                    focused
                      ? 1.12
                      : 1,
                },
              ],
            },
          ]}
        />

        <View
          style={[
            styles.moreDot,

            {
              backgroundColor:
                color,

              transform: [
                {
                  scale:
                    focused
                      ? 1.12
                      : 1,
                },
              ],
            },
          ]}
        />

        <View
          style={[
            styles.moreDot,

            {
              backgroundColor:
                color,

              transform: [
                {
                  scale:
                    focused
                      ? 1.12
                      : 1,
                },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const {
    colors,
  } =
    useFinanceTheme();

  return (
    <Tabs
      initialRouteName="index"

      screenOptions={{
        headerShown:
          false,

        sceneStyle: {
          backgroundColor:
            colors.background,
        },

        tabBarActiveTintColor:
          colors.primary,

        tabBarInactiveTintColor:
          colors.textMuted,

        tabBarHideOnKeyboard:
          true,

        tabBarStyle: {
          backgroundColor:
            colors.surface,

          borderTopColor:
            colors.border,

          borderTopWidth:
            StyleSheet
              .hairlineWidth,

          elevation:
            0,

          shadowOpacity:
            0,

          height:
            70,

          paddingTop:
            7,

          paddingBottom:
            7,
        },

        tabBarItemStyle: {
          paddingVertical:
            2,
        },

        tabBarLabelStyle: {
          fontSize:
            11,

          lineHeight:
            14,

          fontWeight:
            '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"

        options={{
          title:
            'Übersicht',

          tabBarIcon: ({
            color,
            focused,
            size,
          }) => (
            <TabIcon
              kind="home"

              color={
                color
              }

              focused={
                focused
              }

              size={
                size
              }
            />
          ),
        }}
      />

      <Tabs.Screen
        name="transactions"

        options={{
          title:
            'Umsätze',

          tabBarIcon: ({
            color,
            focused,
            size,
          }) => (
            <TabIcon
              kind="transactions"

              color={
                color
              }

              focused={
                focused
              }

              size={
                size
              }
            />
          ),
        }}
      />

      <Tabs.Screen
        name="planning"

        options={{
          title:
            'Planung',

          tabBarIcon: ({
            color,
            focused,
            size,
          }) => (
            <TabIcon
              kind="planning"

              color={
                color
              }

              focused={
                focused
              }

              size={
                size
              }
            />
          ),
        }}
      />

      <Tabs.Screen
        name="more"

        options={{
          title:
            'Mehr',

          tabBarIcon: ({
            color,
            focused,
            size,
          }) => (
            <TabIcon
              kind="more"

              color={
                color
              }

              focused={
                focused
              }

              size={
                size
              }
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles =
  StyleSheet.create({
    iconStage: {
      alignItems:
        'center',

      justifyContent:
        'center',
    },

    homeRoof: {
      position:
        'absolute',

      width:
        13,

      height:
        13,

      top:
        3,

      borderWidth:
        2,

      borderRadius:
        3,

      transform: [
        {
          rotate:
            '45deg',
        },
      ],
    },

    homeBody: {
      position:
        'absolute',

      width:
        15,

      height:
        13,

      bottom:
        2,

      borderWidth:
        2,

      borderRadius:
        4,
    },

    transactionGroup: {
      width:
        20,

      gap:
        4,
    },

    transactionRow: {
      width:
        20,

      height:
        3,

      borderRadius:
        2,
    },

    transactionRowMiddle: {
      width:
        15,
    },

    transactionRowShort: {
      width:
        10,
    },

    planningRing: {
      width:
        22,

      height:
        22,

      borderRadius:
        11,

      alignItems:
        'center',

      justifyContent:
        'center',

      flexDirection:
        'row',

      gap:
        3,
    },

    planningBarTall: {
      width:
        3,

      height:
        10,

      borderRadius:
        2,
    },

    planningBarShort: {
      width:
        3,

      height:
        6,

      borderRadius:
        2,

      marginTop:
        4,
    },

    moreDots: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        4,
    },

    moreDot: {
      width:
        5,

      height:
        5,

      borderRadius:
        3,
    },
  });