import {
  type Href,
  router,
} from 'expo-router';

import {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  getBankProvider,
  searchBankInstitutions,
} from '@/banking/providerRegistry';

import {
  FinanceCard,
} from '@/components/finance/FinanceCard';

import {
  FinanceButton,
} from '@/components/interaction/FinanceButton';

import {
  FinancePressable,
} from '@/components/interaction/FinancePressable';

import {
  FinanceSearchField,
} from '@/components/search/FinanceSearchField';

import {
  FinanceErrorState,
} from '@/components/states/FinanceErrorState';

import {
  FinanceLoadingState,
} from '@/components/states/FinanceLoadingState';

import {
  createBankConnection,
} from '@/db/repositories/bankConnections';

import {
  useFinanceTheme,
} from '@/hooks/use-finance-theme';

import type {
  BankConnection,
  BankInstitution,
} from '@/types/banking';

type ConnectPhase =
  | 'select'
  | 'review'
  | 'connecting'
  | 'success';

export default function ConnectBankScreen() {
  const {
    colors,
    radius,
    spacing,
    typography,
  } = useFinanceTheme();

  const [
    phase,
    setPhase,
  ] =
    useState<ConnectPhase>(
      'select'
    );

  const [
    query,
    setQuery,
  ] =
    useState('');

  const [
    institutions,
    setInstitutions,
  ] =
    useState<
      BankInstitution[]
    >([]);

  const [
    selectedInstitution,
    setSelectedInstitution,
  ] =
    useState<
      BankInstitution | null
    >(null);

  const [
    savedConnection,
    setSavedConnection,
  ] =
    useState<
      BankConnection | null
    >(null);

  const [
    isSearching,
    setIsSearching,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState<
      string | null
    >(null);

  useEffect(() => {
    let cancelled =
      false;

    async function loadInstitutions() {
      setIsSearching(
        true
      );

      try {
        const results =
          await searchBankInstitutions(
            query
          );

        if (!cancelled) {
          setInstitutions(
            results
          );
        }
      } catch (error) {
        console.error(
          'Institution search failed:',
          error
        );

        if (!cancelled) {
          setInstitutions(
            []
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearching(
            false
          );
        }
      }
    }

    void loadInstitutions();

    return () => {
      cancelled =
        true;
    };
  }, [
    query,
  ]);

  function handleBack() {
    if (
      phase ===
        'review' ||

      phase ===
        'connecting'
    ) {
      setPhase(
        'select'
      );

      return;
    }

    if (
      phase ===
      'success'
    ) {
      router.replace(
        '/' as Href
      );

      return;
    }

    router.back();
  }

  function selectInstitution(
    institution:
      BankInstitution
  ) {
    setSelectedInstitution(
      institution
    );

    setErrorMessage(
      null
    );

    setPhase(
      'review'
    );
  }

  async function connectBank() {
    if (
      !selectedInstitution
    ) {
      return;
    }

    setErrorMessage(
      null
    );

    setPhase(
      'connecting'
    );

    try {
      const provider =
        getBankProvider(
          selectedInstitution
            .providerId
        );

      const result =
        await provider.connect(
          selectedInstitution
        );

      const connection =
        await createBankConnection({
          providerId:
            selectedInstitution
              .providerId,

          externalConnectionId:
            result
              .externalConnectionId,

          institutionId:
            selectedInstitution
              .id,

          institutionName:
            selectedInstitution
              .name,

          status:
            result.status,

          isDemo:
            selectedInstitution
              .demoOnly,
        });

      setSavedConnection(
        connection
      );

      setPhase(
        'success'
      );
    } catch (error) {
      console.error(
        'Bank connection failed:',
        error
      );

      setErrorMessage(
        'Die Verbindung konnte nicht angelegt werden.'
      );

      setPhase(
        'review'
      );
    }
  }

  function renderInstitutionContent(
    institution:
      BankInstitution
  ) {
    return (
      <View
        style={
          styles.institutionContent
        }
      >
        <View
          style={[
            styles.bankInitial,

            {
              backgroundColor:
                colors.primarySoft,

              borderRadius:
                radius.lg,
            },
          ]}
        >
          <Text
            style={[
              typography.smallMedium,

              {
                color:
                  colors.primary,
              },
            ]}
          >
            {institution
              .shortName}
          </Text>
        </View>

        <View
          style={
            styles.institutionText
          }
        >
          <Text
            style={[
              typography.bodyMedium,

              {
                color:
                  colors.text,
              },
            ]}
          >
            {institution.name}
          </Text>

          <Text
            style={[
              typography.caption,

              {
                color:
                  colors.textSecondary,

                marginTop:
                  spacing.xs,
              },
            ]}
          >
            Deutschland · Demo
          </Text>
        </View>

        <Text
          style={[
            styles.chevron,

            {
              color:
                colors.textMuted,
            },
          ]}
        >
          ›
        </Text>
      </View>
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

          onPress={
            handleBack
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
          Bankkonto verbinden
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      {phase ===
        'select' && (
        <ScrollView
          keyboardShouldPersistTaps="handled"

          showsVerticalScrollIndicator={
            false
          }

          contentContainerStyle={{
            paddingHorizontal:
              spacing.lg,

            paddingTop:
              spacing.lg,

            paddingBottom:
              spacing.huge,
          }}
        >
          <Text
            style={[
              typography.caption,

              styles.eyebrow,

              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            BANK AUSWÄHLEN
          </Text>

          <Text
            style={[
              typography.screenTitle,

              {
                color:
                  colors.text,

                marginTop:
                  spacing.xs,
              },
            ]}
          >
            Welche Bank nutzt du?
          </Text>

          <Text
            style={[
              typography.body,

              {
                color:
                  colors.textSecondary,

                marginTop:
                  spacing.sm,
              },
            ]}
          >
            Suche nach deinem Institut. Die Suche öffnet sich bewusst über dem restlichen Inhalt, damit Ergebnisse und Tastatur sich nicht gegenseitig verdecken.
          </Text>

          <FinanceCard
            style={{
              marginTop:
                spacing.xl,
            }}
          >
            <View
              style={[
                styles.demoRow,

                {
                  gap:
                    spacing.md,
                },
              ]}
            >
              <View
                style={[
                  styles.demoIcon,

                  {
                    backgroundColor:
                      colors.warningSoft,

                    borderRadius:
                      radius.lg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.demoIconText,

                    {
                      color:
                        colors.warning,
                    },
                  ]}
                >
                  D
                </Text>
              </View>

              <View
                style={
                  styles.demoText
                }
              >
                <Text
                  style={[
                    typography.bodyMedium,

                    {
                      color:
                        colors.text,
                    },
                  ]}
                >
                  Demo-Modus
                </Text>

                <Text
                  style={[
                    typography.small,

                    {
                      color:
                        colors.textSecondary,

                      marginTop:
                        spacing.xs,
                    },
                  ]}
                >
                  Keine echten Zugangsdaten und keine Bankanmeldung.
                </Text>
              </View>
            </View>
          </FinanceCard>

          <View
            style={{
              marginTop:
                spacing.xl,
            }}
          >
            <FinanceSearchField<BankInstitution>
              value={
                query
              }

              onChangeText={
                setQuery
              }

              placeholder="Bank suchen"

              results={
                institutions
              }

              isLoading={
                isSearching
              }

              keyExtractor={(
                institution
              ) =>
                institution.id
              }

              onSelect={
                selectInstitution
              }

              resultsTitle="Banken"

              emptyTitle="Keine Bank gefunden"

              emptyDescription="Für den Demo-Modus ist dieses Institut noch nicht hinterlegt."

              renderResult={
                renderInstitutionContent
              }
            />
          </View>

          <Text
            style={[
              typography.caption,

              styles.sectionLabel,

              {
                color:
                  colors.textMuted,

                marginTop:
                  spacing.xxl,

                marginBottom:
                  spacing.sm,
              },
            ]}
          >
            SCHNELLAUSWAHL
          </Text>

          {isSearching &&
          institutions.length ===
            0 ? (
            <FinanceLoadingState
              label="Banken werden geladen…"
            />
          ) : (
            institutions
              .slice(
                0,
                6
              )
              .map(
                (
                  institution
                ) => (
                  <FinancePressable
                    key={
                      institution.id
                    }

                    onPress={() => {
                      selectInstitution(
                        institution
                      );
                    }}

                    intent="navigation"

                    style={[
                      styles.institutionCard,

                      {
                        backgroundColor:
                          colors.surface,

                        borderColor:
                          colors.border,

                        borderRadius:
                          radius.xl,

                        marginBottom:
                          spacing.sm,
                      },
                    ]}

                    contentStyle={
                      styles.institutionCardContent
                    }
                  >
                    {renderInstitutionContent(
                      institution
                    )}
                  </FinancePressable>
                )
              )
          )}
        </ScrollView>
      )}

      {phase ===
        'review' &&
        selectedInstitution && (
          <ScrollView
            showsVerticalScrollIndicator={
              false
            }

            contentContainerStyle={{
              paddingHorizontal:
                spacing.lg,

              paddingTop:
                spacing.xl,

              paddingBottom:
                spacing.huge,
            }}
          >
            <View
              style={[
                styles.largeBankIcon,

                {
                  backgroundColor:
                    colors.primarySoft,

                  borderRadius:
                    radius.xxl,
                },
              ]}
            >
              <Text
                style={[
                  styles.largeBankInitial,

                  {
                    color:
                      colors.primary,
                  },
                ]}
              >
                {selectedInstitution
                  .shortName}
              </Text>
            </View>

            <Text
              style={[
                typography.screenTitle,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.xl,
                },
              ]}
            >
              {selectedInstitution
                .name}
            </Text>

            <Text
              style={[
                typography.body,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              Der Verbindungsablauf ist bereits so aufgebaut, dass später ein echter Provider an derselben Stelle übernehmen kann.
            </Text>

            <FinanceCard
              style={{
                marginTop:
                  spacing.xxl,
              }}
            >
              <InfoRow
                label="Modus"
                value="Demo"
              />

              <InfoDivider />

              <InfoRow
                label="Zugriff"
                value="Nur Lesen"
              />

              <InfoDivider />

              <InfoRow
                label="Überweisungen"
                value="Nicht möglich"
              />

              <InfoDivider />

              <InfoRow
                label="Speicherung"
                value="Lokal verschlüsselt"
              />
            </FinanceCard>

            <FinanceCard
              style={{
                marginTop:
                  spacing.md,
              }}
            >
              <Text
                style={[
                  typography.bodyMedium,

                  {
                    color:
                      colors.text,
                  },
                ]}
              >
                Was passiert jetzt?
              </Text>

              <Text
                style={[
                  typography.small,

                  {
                    color:
                      colors.textSecondary,

                    marginTop:
                      spacing.sm,
                  },
                ]}
              >
                Es wird ausschließlich eine lokale Demo-Verbindung angelegt. Benutzername, PIN, Passwort oder TAN werden nicht abgefragt.
              </Text>
            </FinanceCard>

            {errorMessage && (
              <FinanceErrorState
                message={
                  errorMessage
                }

                style={{
                  marginTop:
                    spacing.md,
                }}
              />
            )}

            <FinanceButton
              label="Demo-Verbindung anlegen"

              onPress={() => {
                void connectBank();
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.xxl,
              }}
            />

            <FinanceButton
              label="Andere Bank wählen"

              variant="secondary"

              onPress={() => {
                setPhase(
                  'select'
                );
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.sm,
              }}
            />
          </ScrollView>
        )}

      {phase ===
        'connecting' &&
        selectedInstitution && (
          <View
            style={[
              styles.centerState,

              {
                paddingHorizontal:
                  spacing.xxxl,
              },
            ]}
          >
            <View
              style={[
                styles.loadingCircle,

                {
                  backgroundColor:
                    colors.primarySoft,

                  borderRadius:
                    radius.round,
                },
              ]}
            >
              <ActivityIndicator
                size="large"

                color={
                  colors.primary
                }
              />
            </View>

            <Text
              style={[
                typography.title,

                styles.centerText,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.xl,
                },
              ]}
            >
              Verbindung wird angelegt
            </Text>

            <Text
              style={[
                typography.body,

                styles.centerText,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              {selectedInstitution
                .name}
            </Text>
          </View>
        )}

      {phase ===
        'success' &&
        selectedInstitution &&
        savedConnection && (
          <View
            style={[
              styles.centerState,

              {
                paddingHorizontal:
                  spacing.lg,
              },
            ]}
          >
            <View
              style={[
                styles.successCircle,

                {
                  backgroundColor:
                    colors.positiveSoft,

                  borderRadius:
                    radius.round,
                },
              ]}
            >
              <Text
                style={[
                  styles.successCheck,

                  {
                    color:
                      colors.positive,
                  },
                ]}
              >
                ✓
              </Text>
            </View>

            <Text
              style={[
                typography.screenTitle,

                styles.centerText,

                {
                  color:
                    colors.text,

                  marginTop:
                    spacing.xl,
                },
              ]}
            >
              Verbindung gespeichert
            </Text>

            <Text
              style={[
                typography.body,

                styles.centerText,

                {
                  color:
                    colors.textSecondary,

                  marginTop:
                    spacing.sm,
                },
              ]}
            >
              {selectedInstitution.name} wurde als Demo-Verbindung in deiner lokalen Finanzdatenbank gespeichert.
            </Text>

            <View
              style={[
                styles.demoSuccessBadge,

                {
                  backgroundColor:
                    colors.warningSoft,

                  borderRadius:
                    radius.round,

                  marginTop:
                    spacing.xl,
                },
              ]}
            >
              <Text
                style={[
                  typography.smallMedium,

                  {
                    color:
                      colors.warning,
                  },
                ]}
              >
                Demo-Verbindung
              </Text>
            </View>

            <FinanceButton
              label="Meine Bankkonten"

              onPress={() => {
                router.replace(
                  '/bank-connections' as Href
                );
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.xxxl,
              }}
            />

            <FinanceButton
              label="Zur Übersicht"

              variant="secondary"

              onPress={() => {
                router.replace(
                  '/' as Href
                );
              }}

              style={{
                width:
                  '100%',

                marginTop:
                  spacing.sm,
              }}
            />
          </View>
        )}
    </SafeAreaView>
  );
}

type InfoRowProps = {
  label:
    string;

  value:
    string;
};

function InfoRow({
  label,
  value,
}: InfoRowProps) {
  const {
    colors,
    typography,
  } = useFinanceTheme();

  return (
    <View
      style={
        styles.infoRow
      }
    >
      <Text
        style={[
          typography.small,

          {
            color:
              colors.textSecondary,
          },
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          typography.smallMedium,

          {
            color:
              colors.text,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function InfoDivider() {
  const {
    colors,
    spacing,
  } = useFinanceTheme();

  return (
    <View
      style={[
        styles.infoDivider,

        {
          backgroundColor:
            colors.border,

          marginVertical:
            spacing.md,
        },
      ]}
    />
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

    eyebrow: {
      letterSpacing:
        1.4,
    },

    sectionLabel: {
      letterSpacing:
        1.2,
    },

    demoRow: {
      flexDirection:
        'row',

      alignItems:
        'center',
    },

    demoIcon: {
      width:
        48,

      height:
        48,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    demoIconText: {
      fontSize:
        18,

      fontWeight:
        '800',
    },

    demoText: {
      flex:
        1,
    },

    institutionCard: {
      minHeight:
        76,

      borderWidth:
        StyleSheet
          .hairlineWidth,
    },

    institutionCardContent: {
      minHeight:
        74,

      paddingHorizontal:
        16,

      paddingVertical:
        10,

      justifyContent:
        'center',
    },

    institutionContent: {
      width:
        '100%',

      flexDirection:
        'row',

      alignItems:
        'center',
    },

    bankInitial: {
      width:
        48,

      height:
        48,

      paddingHorizontal:
        5,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    institutionText: {
      flex:
        1,

      marginLeft:
        14,
    },

    chevron: {
      fontSize:
        32,

      fontWeight:
        '300',

      marginLeft:
        10,
    },

    largeBankIcon: {
      width:
        78,

      height:
        78,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    largeBankInitial: {
      fontSize:
        22,

      fontWeight:
        '800',
    },

    infoRow: {
      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',
    },

    infoDivider: {
      width:
        '100%',

      height:
        StyleSheet
          .hairlineWidth,
    },

    centerState: {
      flex:
        1,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    centerText: {
      textAlign:
        'center',

      maxWidth:
        330,
    },

    loadingCircle: {
      width:
        84,

      height:
        84,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    successCircle: {
      width:
        86,

      height:
        86,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    successCheck: {
      fontSize:
        42,

      fontWeight:
        '800',
    },

    demoSuccessBadge: {
      paddingHorizontal:
        14,

      paddingVertical:
        8,
    },
  });