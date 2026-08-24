import {
    useEffect,
    useState,
} from 'react';

import {
    router,
} from 'expo-router';

import {
    Alert as RNAlert,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    SafeAreaView,
} from 'react-native-safe-area-context';

import {
    deleteCategoryRule,
    getCategoryRules,
    setCategoryRuleEnabled,
} from '@/db/repositories/categoryRules';

import {
    FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
    FinanceCard,
} from '@/components/finance/FinanceCard';

import {
    FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
    FinanceEmptyState,
} from '@/components/states/FinanceEmptyState';

import {
    performFinanceHaptic,
} from '@/services/haptics';

import {
    debugLog,
} from '@/core/debugLog';

import {
    useFinanceTheme,
} from '@/hooks/use-finance-theme';

import {
    useFinanceStore,
} from '@/stores/useFinanceStore';

import type {
    CategoryRule,
} from '@/types/finance';

const MATCH_LABELS: Record<
  string,
  string
> = {
  merchant_contains:
    'Händler enthält',

  merchant_equals:
    'Händler genau',

  description_contains:
    'Beschreibung enthält',
};

export default function CategoryRulesScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } =
    useFinanceTheme();

  const categories =
    useFinanceStore(
      (state) =>
        state.categories
    );

  const [
    rules,
    setRules,
  ] =
    useState<CategoryRule[]>(
      [],
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  async function loadRules() {
    try {
      setRules(
        await getCategoryRules(),
      );
    } catch (error) {
      debugLog.error(
        'CAT',
        'CAT-RULE-001: Regeln konnten nicht geladen werden',
        error,
      );

      RNAlert.alert(
        'Kategorien',
        'Regeln konnten nicht geladen werden.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  function categoryNameFor(
    categoryId:
      string,
  ): string {
    return (
      categories.find(
        (category) =>
          category.id ===
          categoryId,
      )?.name ??
      categoryId
    );
  }

  function requestToggle(
    rule:
      CategoryRule,
  ) {
    void (async () => {
      try {
        await setCategoryRuleEnabled(
          rule.id,
          !rule.enabled,
        );

        await loadRules();
      } catch (error) {
        debugLog.error(
          'CAT',
          'CAT-RULE-002: Regel konnte nicht aktualisiert werden',
          error,
        );
      }
    })();
  }

  function requestDelete(
    rule:
      CategoryRule,
  ) {
    RNAlert.alert(
      'Regel löschen?',

      `„${rule.name}" wird entfernt. Bereits zugeordnete Umsätze bleiben unverändert.`,

      [
        {
          text: 'Abbrechen',

          style: 'cancel',
        },

        {
          text: 'Löschen',

          style: 'destructive',

          onPress: () => {
            void (async () => {
              try {
                await deleteCategoryRule(
                  rule.id,
                );

                void performFinanceHaptic('warning');

                await loadRules();
              } catch (error) {
                debugLog.error(
                  'CAT',
                  'CAT-RULE-003: Regel konnte nicht gelöscht werden',
                  error,
                );
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView
      edges={[
        'top',
        'bottom',
      ]}

      style={[
        styles.safeArea,

        {
          backgroundColor:
            colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.header,

          {
            paddingHorizontal:
              spacing.lg,

            paddingVertical:
              spacing.md,
          },
        ]}
      >
        <FinancePressable
          accessibilityRole="button"

          accessibilityLabel="Zurück"

          onPress={() =>
            router.back()
          }

          intent="navigation"

          style={[
            styles.backButton,

            {
              backgroundColor:
                colors.surface,

              borderRadius:
                radius.round,
            },
          ]}

          contentStyle={
            styles.backContent
          }
        >
          <Text
            style={[
              styles.backIcon,

              {
                color:
                  colors.text,
              },
            ]}
          >
            ‹
          </Text>
        </FinancePressable>

        <Text
          style={[
            typography.bodyMedium,

            {
              color:
                colors.text,
            },
          ]}
        >
          Kategorien & Regeln
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }

        contentContainerStyle={{
          paddingHorizontal:
            spacing.lg,

          paddingBottom:
            spacing.huge,
        }}
      >
        <Text
          style={[
            typography.caption,

            styles.sectionLabel,

            {
              color:
                colors.textMuted,

              marginBottom:
                spacing.sm,
            },
          ]}
        >
          KATEGORIE-REVIEW
        </Text>

        <FinanceCard
          variant="highlight"
        >
          <SettingsRowLike
            title="Offene Kategorisierung"

            description="Umsätze ohne sinnvolle Kategorie prüfen und zuordnen"


            onPress={() => {
              router.push('/uncategorized');
            }}
          />
        </FinanceCard>

        <Text
          style={[
            typography.caption,

            styles.sectionLabel,

            {
              color:
                colors.textMuted,

              marginTop:
                spacing.xxxl,

              marginBottom:
                spacing.sm,
            },
          ]}
        >
          REGELN ({rules.length})
        </Text>

        {isLoading ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          Lade Regeln…
        </Text>
      ) : null}

      {rules.length === 0 && !isLoading ? (
        <FinanceEmptyState
          title='Noch keine Regeln'

          description='Erstelle Regeln direkt aus einer Transaktion: Kategorie waehlen und mit >>Immer zuordnen<< bestaetigen.'
        />
      ) : null}

      {!isLoading &&
        rules.map((rule) => {
          const summary =
            (MATCH_LABELS[rule.matchType] ?? rule.matchType) +
            ': "' +
            rule.matchValue +
            '"';

          const targetName =
            categoryNameFor(rule.categoryId);

          return (
            <FinanceCard
              key={rule.id}
              padded={false}
              style={{ marginBottom: spacing.md }}
            >
              <View
                style={[
                  styles.ruleRow,
                  {
                    paddingHorizontal: spacing.xl,
                    paddingVertical: spacing.lg,
                  },
                ]}
              >
                <View style={styles.ruleText}>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.bodyMedium,
                      {
                        color: rule.enabled
                          ? colors.text
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {rule.name}
                  </Text>

                  <Text
                    numberOfLines={1}
                    style={[
                      typography.caption,
                      {
                        color: colors.textSecondary,
                        marginTop: spacing.xs,
                      },
                    ]}
                  >
                    {summary} → {targetName}
                  </Text>
                </View>

                <FinancePressable
                  accessibilityRole='switch'
                  accessibilityState={{ checked: rule.enabled }}
                  onPress={() => {
                    void performFinanceHaptic('selection');
                    requestToggle(rule);
                  }}
                  feedbackVariant='subtle'
                  tapScale={0.96}
                  style={[
                    styles.toggle,
                    {
                      backgroundColor: rule.enabled
                        ? colors.positiveSoft
                        : colors.surfaceSecondary,
                      borderColor: rule.enabled
                        ? colors.positive
                        : colors.border,
                      borderRadius: radius.round,
                    },
                  ]}
                  contentStyle={styles.toggleContent}
                >
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: rule.enabled
                          ? colors.positive
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {rule.enabled ? 'AN' : 'AUS'}
                  </Text>
                </FinancePressable>
              </View>

              <View
                style={[
                  styles.ruleFooter,
                  {
                    paddingHorizontal: spacing.xl,
                    paddingBottom: spacing.md,
                  },
                ]}
              >
                <FinanceButton
                  label='Loeschen'
                  size='small'
                  variant='danger'
                  onPress={() => {
                    void performFinanceHaptic('warning');
                    requestDelete(rule);
                  }}
                />
              </View>
            </FinanceCard>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRowLike({
  title,
  description,
  onPress,
}: {
  title: string;
  description?: string;
  onPress?: () => void;
}) {
  const {
    colors,
    typography,
  } =
    useFinanceTheme();

  return (
    <FinancePressable
      accessibilityRole="button"

      onPress={onPress}

      intent="navigation"

      style={{
        width: '100%',
      }}

      contentStyle={{
        minHeight: 56,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[
            typography.bodyMedium,

            {
              color: colors.text,
            },
          ]}
        >
          {title}
        </Text>

        {description ? (
          <Text
            style={[
              typography.small,

              {
                color:
                  colors.textSecondary,

                marginTop:
                  4,
              },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>

      <Text
        style={{
          fontSize: 26,

          fontWeight:
            '300',

          color:
            colors.textMuted,

          marginLeft:
            10,
        }}
      >
        ›
      </Text>
    </FinancePressable>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex:
        1,
    },

    header: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',
    },

    backButton: {
      width:
        42,

      height:
        42,
    },

    backContent: {
      width:
        42,

      height:
        42,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    backIcon: {
      fontSize:
        34,

      lineHeight:
        37,

      fontWeight:
        '300',

      marginTop:
        -3,
    },

    headerSpacer: {
      width:
        42,

      height:
        42,
    },

    sectionLabel: {
      letterSpacing:
        1.2,
    },

    ruleRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        12,
    },

    ruleText: {
      flex:
        1,
    },

    toggle: {
      minWidth:
        52,

      minHeight:
        30,

      borderWidth:
        1,
    },

    toggleContent: {
      minWidth:
        52,

      minHeight:
        28,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    ruleFooter: {
      flexDirection:
        'row',

      justifyContent:
        'flex-end',
    },
  });
