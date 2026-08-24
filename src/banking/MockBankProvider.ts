import type {
  BankInstitution,
  ProviderAccount,
  ProviderTransaction,
} from '@/types/banking';

import type {
  BankProvider,
  BankProviderConnectionResult,
} from './BankProvider';

const MOCK_INSTITUTIONS:
  BankInstitution[] = [
    {
      id: 'sparkasse-demo',

      providerId: 'mock',

      name: 'Sparkasse',

      shortName: 'SPK',

      countryCode: 'DE',

      authenticationMethod:
        'mock',

      demoOnly: true,

      description:
        'Demo-Institut für den Entwicklungsmodus.',
    },

    {
      id: 'volksbank-demo',

      providerId: 'mock',

      name:
        'Volksbank / Raiffeisenbank',

      shortName: 'VR',

      countryCode: 'DE',

      authenticationMethod:
        'mock',

      demoOnly: true,

      description:
        'Demo-Institut für den Entwicklungsmodus.',
    },

    {
      id: 'ing-demo',

      providerId: 'mock',

      name: 'ING',

      shortName: 'ING',

      countryCode: 'DE',

      authenticationMethod:
        'mock',

      demoOnly: true,

      description:
        'Demo-Institut für den Entwicklungsmodus.',
    },

    {
      id: 'dkb-demo',

      providerId: 'mock',

      name: 'DKB',

      shortName: 'DKB',

      countryCode: 'DE',

      authenticationMethod:
        'mock',

      demoOnly: true,

      description:
        'Demo-Institut für den Entwicklungsmodus.',
    },

    {
      id: 'n26-demo',

      providerId: 'mock',

      name: 'N26',

      shortName: 'N26',

      countryCode: 'DE',

      authenticationMethod:
        'mock',

      demoOnly: true,

      description:
        'Demo-Institut für den Entwicklungsmodus.',
    },

    {
      id: 'comdirect-demo',

      providerId: 'mock',

      name: 'Comdirect',

      shortName: 'CD',

      countryCode: 'DE',

      authenticationMethod:
        'mock',

      demoOnly: true,

      description:
        'Demo-Institut für den Entwicklungsmodus.',
    },
  ];

function wait(
  milliseconds: number
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

function getInstitutionForConnection(
  externalConnectionId: string
): BankInstitution {
  const institution =
    MOCK_INSTITUTIONS.find(
      (candidate) =>
        externalConnectionId.includes(
          `-${candidate.id}-`
        )
    );

  return (
    institution ??
    MOCK_INSTITUTIONS[0]!
  );
}

function pad2(
  value: number
): string {
  return String(value).padStart(
    2,
    '0'
  );
}

function getCurrentMonthKey():
string {
  const now =
    new Date();

  return `${now.getFullYear()}-${pad2(
    now.getMonth() + 1
  )}`;
}

function dateInCurrentMonth(
  day: number
): string {
  const now =
    new Date();

  const currentDay =
    now.getDate();

  const safeDay =
    Math.max(
      1,
      Math.min(
        day,
        currentDay
      )
    );

  return `${getCurrentMonthKey()}-${pad2(
    safeDay
  )}`;
}

type DemoTransactionTemplate = {
  id: string;

  day: number;

  amountMinor: number;

  direction:
    | 'income'
    | 'expense';

  description: string;

  counterpartyName?: string;

  isRecurring?: boolean;
};

const DEMO_TRANSACTION_TEMPLATES:
  DemoTransactionTemplate[] = [
    {
      id: 'salary',

      day: 1,

      amountMinor: 285000,

      direction: 'income',

      description:
        'Gehalt',

      counterpartyName:
        'Demo Arbeitgeber GmbH',

      isRecurring: true,
    },

    {
      id: 'rent',

      day: 2,

      amountMinor: 79000,

      direction: 'expense',

      description:
        'Miete',

      counterpartyName:
        'Demo Hausverwaltung',

      isRecurring: true,
    },

    {
      id: 'rewe',

      day: 4,

      amountMinor: 6842,

      direction: 'expense',

      description:
        'Lebensmittel',

      counterpartyName:
        'REWE',

      isRecurring: false,
    },

    {
      id: 'spotify',

      day: 5,

      amountMinor: 1099,

      direction: 'expense',

      description:
        'Spotify Premium',

      counterpartyName:
        'Spotify',

      isRecurring: true,
    },

    {
      id: 'dm',

      day: 7,

      amountMinor: 2387,

      direction: 'expense',

      description:
        'Drogerie',

      counterpartyName:
        'dm-drogerie markt',

      isRecurring: false,
    },

    {
      id: 'fuel',

      day: 9,

      amountMinor: 7421,

      direction: 'expense',

      description:
        'Tanken',

      counterpartyName:
        'Demo Tankstelle',

      isRecurring: false,
    },

    {
      id: 'amazon',

      day: 11,

      amountMinor: 4599,

      direction: 'expense',

      description:
        'Online-Einkauf',

      counterpartyName:
        'Amazon',

      isRecurring: false,
    },

    {
      id: 'refund',

      day: 13,

      amountMinor: 3299,

      direction: 'income',

      description:
        'Rückerstattung',

      counterpartyName:
        'Online-Shop',

      isRecurring: false,
    },

    {
      id: 'mobile',

      day: 15,

      amountMinor: 2999,

      direction: 'expense',

      description:
        'Mobilfunk',

      counterpartyName:
        'Demo Mobilfunk',

      isRecurring: true,
    },

    {
      id: 'electricity',

      day: 18,

      amountMinor: 7400,

      direction: 'expense',

      description:
        'Stromabschlag',

      counterpartyName:
        'Demo Energie',

      isRecurring: true,
    },

    {
      id: 'bakery',

      day: 21,

      amountMinor: 1285,

      direction: 'expense',

      description:
        'Bäckerei',

      counterpartyName:
        'Bäckerei',

      isRecurring: false,
    },

    {
      id: 'restaurant',

      day: 22,

      amountMinor: 3890,

      direction: 'expense',

      description:
        'Restaurant',

      counterpartyName:
        'Demo Restaurant',

      isRecurring: false,
    },
  ];

class MockBankProvider
  implements BankProvider
{
  readonly id = 'mock';

  readonly name =
    'Finance Demo Provider';

  readonly mode =
    'demo' as const;

  async searchInstitutions(
    query = ''
  ): Promise<BankInstitution[]> {
    await wait(100);

    const normalizedQuery =
      query
        .trim()
        .toLocaleLowerCase(
          'de-DE'
        );

    if (!normalizedQuery) {
      return [
        ...MOCK_INSTITUTIONS,
      ];
    }

    return MOCK_INSTITUTIONS.filter(
      (institution) => {
        const name =
          institution.name
            .toLocaleLowerCase(
              'de-DE'
            );

        const shortName =
          institution.shortName
            .toLocaleLowerCase(
              'de-DE'
            );

        return (
          name.includes(
            normalizedQuery
          ) ||
          shortName.includes(
            normalizedQuery
          )
        );
      }
    );
  }

  async connect(
    institution:
      BankInstitution
  ): Promise<BankProviderConnectionResult> {
    await wait(900);

    return {
      externalConnectionId:
        `mock-${institution.id}-${Date.now()}`,

      institution,

      status: 'active',
    };
  }

  async disconnect(
    _externalConnectionId: string
  ): Promise<void> {
    await wait(200);
  }

  async getAccounts(
    externalConnectionId: string
  ): Promise<ProviderAccount[]> {
    await wait(250);

    const institution =
      getInstitutionForConnection(
        externalConnectionId
      );

    return [
      {
        externalAccountId:
          `${externalConnectionId}:checking`,

        name:
          'Girokonto',

        iban:
          'DEMO-GIROKONTO',

        currency:
          'EUR',

        balanceMinor:
          248732,

        type:
          'checking',

        institutionName:
          institution.name,
      },

      {
        externalAccountId:
          `${externalConnectionId}:savings`,

        name:
          'Tagesgeld',

        iban:
          'DEMO-TAGESGELD',

        currency:
          'EUR',

        balanceMinor:
          500000,

        type:
          'savings',

        institutionName:
          institution.name,
      },
    ];
  }

  async getTransactions(
    _externalConnectionId: string,
    externalAccountId: string,
    _from?: Date,
    _to?: Date
  ): Promise<ProviderTransaction[]> {
    await wait(300);

    if (
      !externalAccountId.endsWith(
        ':checking'
      )
    ) {
      return [];
    }

    const now =
      new Date();

    const currentDay =
      now.getDate();

    const monthKey =
      getCurrentMonthKey();

    return DEMO_TRANSACTION_TEMPLATES
      .filter(
        (template) =>
          template.day <=
          currentDay
      )
      .map(
        (
          template
        ): ProviderTransaction => ({
          externalTransactionId:
            `${externalAccountId}:${monthKey}:${template.id}`,

          amountMinor:
            template.amountMinor,

          currency:
            'EUR',

          direction:
            template.direction,

          bookingDate:
            dateInCurrentMonth(
              template.day
            ),

          description:
            template.description,

          counterpartyName:
            template.counterpartyName,

          isRecurring:
            template.isRecurring,
        })
      );
  }

  async refresh(
    _externalConnectionId: string
  ): Promise<void> {
    await wait(300);
  }
}

export const mockBankProvider =
  new MockBankProvider();