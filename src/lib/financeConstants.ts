import type {
  AccountTypeOption,
  CadenceOption,
  CustomCadenceUnitOption,
  GoalPriorityOption,
  Summary,
  TabKey,
} from '../components/financeTypes'

export const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'income', label: 'Income' },
  { key: 'bills', label: 'Bills' },
  { key: 'cards', label: 'Cards' },
  { key: 'loans', label: 'Loans' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'goals', label: 'Goals' },
]

export const cadenceOptions: CadenceOption[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
  { value: 'one_time', label: 'One Time' },
]

export const customCadenceUnitOptions: CustomCadenceUnitOption[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
]

export const accountTypeOptions: AccountTypeOption[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'debt', label: 'Debt' },
]

export const goalPriorityOptions: GoalPriorityOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const defaultPreference = {
  currency: 'USD',
  locale: 'en-US',
}

export const emptySummary: Summary = {
  monthlyIncome: 0,
  monthlyBills: 0,
  monthlyCardSpend: 0,
  monthlyLoanPayments: 0,
  monthlyLoanBasePayments: 0,
  monthlyLoanSubscriptionCosts: 0,
  monthlyCommitments: 0,
  runwayAvailablePool: 0,
  runwayMonthlyPressure: 0,
  cardLimitTotal: 0,
  cardUsedTotal: 0,
  totalLoanBalance: 0,
  cardUtilizationPercent: 0,
  purchasesThisMonth: 0,
  projectedMonthlyNet: 0,
  savingsRatePercent: 0,
  totalAssets: 0,
  totalLiabilities: 0,
  netWorth: 0,
  liquidReserves: 0,
  runwayMonths: 0,
  healthScore: 0,
  goalsFundedPercent: 0,
}

export const fallbackCurrencyOptions = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'SEK',
  'NOK',
  'NZD',
  'MXN',
  'SGD',
  'HKD',
  'INR',
  'BRL',
  'ZAR',
  'AED',
  'SAR',
]

export const fallbackLocaleOptions = [
  'en-US',
  'en-GB',
  'en-AU',
  'en-CA',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'pt-BR',
  'ja-JP',
  'zh-CN',
  'zh-HK',
  'ko-KR',
  'hi-IN',
  'ar-AE',
]

export const currencyOptions = (() => {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (input: 'currency') => string[]
  }).supportedValuesOf

  if (supportedValuesOf) {
    const supported = supportedValuesOf('currency').map((code) => code.toUpperCase())
    return Array.from(new Set(supported)).sort((a, b) => a.localeCompare(b))
  }

  return fallbackCurrencyOptions
})()

export const dateLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
