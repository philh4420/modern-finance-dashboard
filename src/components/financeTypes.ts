import type { Doc, Id } from '../../convex/_generated/dataModel'

export type TabKey = 'dashboard' | 'income' | 'bills' | 'cards' | 'loans' | 'purchases' | 'accounts' | 'goals'

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
export type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'
export type AccountType = 'checking' | 'savings' | 'investment' | 'cash' | 'debt'
export type GoalPriority = 'low' | 'medium' | 'high'
export type InsightSeverity = 'good' | 'warning' | 'critical'

export type FinancePreference = {
  currency: string
  locale: string
}

export type Summary = {
  monthlyIncome: number
  monthlyBills: number
  monthlyCardSpend: number
  monthlyLoanPayments: number
  monthlyLoanBasePayments: number
  monthlyLoanSubscriptionCosts: number
  monthlyCommitments: number
  runwayAvailablePool: number
  runwayMonthlyPressure: number
  cardLimitTotal: number
  cardUsedTotal: number
  totalLoanBalance: number
  cardUtilizationPercent: number
  purchasesThisMonth: number
  projectedMonthlyNet: number
  savingsRatePercent: number
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  liquidReserves: number
  runwayMonths: number
  healthScore: number
  goalsFundedPercent: number
}

export type IncomeEntry = Doc<'incomes'>
export type BillEntry = Doc<'bills'>
export type CardEntry = Doc<'cards'>
export type LoanEntry = Doc<'loans'>
export type PurchaseEntry = Doc<'purchases'>
export type AccountEntry = Doc<'accounts'>
export type GoalEntry = Doc<'goals'>
export type CycleAuditLogEntry = Doc<'cycleAuditLogs'>

export type IncomeForm = {
  source: string
  amount: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  receivedDay: string
  notes: string
}

export type BillForm = {
  name: string
  amount: string
  dueDay: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  autopay: boolean
  notes: string
}

export type CardForm = {
  name: string
  creditLimit: string
  usedLimit: string
  minimumPayment: string
  spendPerMonth: string
  interestRate: string
}

export type LoanForm = {
  name: string
  balance: string
  minimumPayment: string
  subscriptionCost: string
  interestRate: string
  dueDay: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  notes: string
}

export type PurchaseForm = {
  item: string
  amount: string
  category: string
  purchaseDate: string
  notes: string
}

export type PurchaseFilter = {
  query: string
  category: string
  month: string
}

export type AccountForm = {
  name: string
  type: AccountType
  balance: string
  liquid: boolean
}

export type GoalForm = {
  title: string
  targetAmount: string
  currentAmount: string
  targetDate: string
  priority: GoalPriority
}

export type IncomeEditDraft = IncomeForm
export type BillEditDraft = BillForm
export type CardEditDraft = CardForm
export type LoanEditDraft = LoanForm
export type PurchaseEditDraft = PurchaseForm
export type AccountEditDraft = AccountForm
export type GoalEditDraft = GoalForm

export type DashboardCard = {
  id: string
  label: string
  value: string
  note: string
  trend: string
}

export type TopCategory = {
  category: string
  total: number
  count: number
  sharePercent: number
}

export type UpcomingCashEvent = {
  id: string
  label: string
  type: 'income' | 'bill' | 'loan'
  date: string
  amount: number
  daysAway: number
  cadence: Cadence
  customInterval?: number
  customUnit?: CustomCadenceUnit
}

export type Insight = {
  id: string
  title: string
  detail: string
  severity: InsightSeverity
}

export type GoalWithMetrics = GoalEntry & {
  progressPercent: number
  remaining: number
  daysLeft: number
}

export type CadenceOption = {
  value: Cadence
  label: string
}

export type CustomCadenceUnitOption = {
  value: CustomCadenceUnit
  label: string
}

export type AccountTypeOption = {
  value: AccountType
  label: string
}

export type GoalPriorityOption = {
  value: GoalPriority
  label: string
}

export type IncomeId = Id<'incomes'>
export type BillId = Id<'bills'>
export type CardId = Id<'cards'>
export type LoanId = Id<'loans'>
export type PurchaseId = Id<'purchases'>
export type AccountId = Id<'accounts'>
export type GoalId = Id<'goals'>
