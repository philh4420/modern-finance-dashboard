import type { Doc, Id } from '../../convex/_generated/dataModel'

export type TabKey =
  | 'dashboard'
  | 'income'
  | 'bills'
  | 'cards'
  | 'loans'
  | 'purchases'
  | 'reconcile'
  | 'planning'
  | 'settings'
  | 'accounts'
  | 'goals'

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
export type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'
export type AccountType = 'checking' | 'savings' | 'investment' | 'cash' | 'debt'
export type GoalPriority = 'low' | 'medium' | 'high'
export type InsightSeverity = 'good' | 'warning' | 'critical'
export type ReconciliationStatus = 'pending' | 'posted' | 'reconciled'
export type RuleMatchType = 'contains' | 'exact' | 'starts_with'
export type CardMinimumPaymentType = 'fixed' | 'percent_plus_interest'

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
  pendingPurchases: number
  postedPurchases: number
  reconciledPurchases: number
}

export type IncomeEntry = Doc<'incomes'>
export type BillEntry = Doc<'bills'>
export type CardEntry = Doc<'cards'>
export type LoanEntry = Doc<'loans'>
export type PurchaseEntry = Doc<'purchases'>
export type AccountEntry = Doc<'accounts'>
export type GoalEntry = Doc<'goals'>
export type CycleAuditLogEntry = Doc<'cycleAuditLogs'>
export type MonthlyCycleRunEntry = Doc<'monthlyCycleRuns'>
export type MonthCloseSnapshotEntry = Doc<'monthCloseSnapshots'>
export type FinanceAuditEventEntry = Doc<'financeAuditEvents'>
export type LedgerEntry = Doc<'ledgerEntries'>
export type TransactionRuleEntry = Doc<'transactionRules'>
export type EnvelopeBudgetEntry = Doc<'envelopeBudgets'>
export type PurchaseSplitEntry = Doc<'purchaseSplits'>
export type ConsentLogEntry = Doc<'consentLogs'>
export type UserExportEntry = Doc<'userExports'>
export type DeletionJobEntry = Doc<'deletionJobs'>
export type RetentionPolicyEntry = Doc<'retentionPolicies'>
export type ClientOpsMetricEntry = Doc<'clientOpsMetrics'>

export type RetentionPolicyKey =
  | 'exports'
  | 'client_ops_metrics'
  | 'cycle_audit_ledger'
  | 'consent_logs'
  | 'deletion_jobs'

export type ConsentSettingsView = {
  diagnosticsEnabled: boolean
  analyticsEnabled: boolean
  updatedAt: number
}

export type PrivacyData = {
  consentSettings: ConsentSettingsView
  consentLogs: ConsentLogEntry[]
  retentionPolicies: RetentionPolicyEntry[]
  latestExport: UserExportEntry | null
  latestDeletionJob: DeletionJobEntry | null
}

export type KpiSnapshot = {
  windowDays: number
  updatedAt: number
  accuracyRate: number
  syncFailureRate: number | null
  cycleSuccessRate: number
  reconciliationCompletionRate: number
  counts: {
    purchases: number
    pending: number
    missingCategory: number
    duplicates: number
    anomalies: number
    splitMismatches: number
  }
}

export type RetentionPolicyRow = {
  policyKey: RetentionPolicyKey
  retentionDays: number
  enabled: boolean
}

export type IncomeForm = {
  source: string
  amount: string
  actualAmount: string
  grossAmount: string
  taxAmount: string
  nationalInsuranceAmount: string
  pensionAmount: string
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
  allowOverLimitOverride: boolean
  statementBalance: string
  pendingCharges: string
  minimumPaymentType: CardMinimumPaymentType
  minimumPayment: string
  minimumPaymentPercent: string
  extraPayment: string
  spendPerMonth: string
  interestRate: string
  statementDay: string
  dueDay: string
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
  reconciliationStatus: ReconciliationStatus
  statementMonth: string
  notes: string
}

export type PurchaseFilter = {
  query: string
  category: string
  month: string
  reconciliationStatus: 'all' | ReconciliationStatus
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
  type: 'income' | 'bill' | 'card' | 'loan'
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

export type RecurringCandidate = {
  id: string
  label: string
  category: string
  count: number
  averageAmount: number
  averageIntervalDays: number
  nextExpectedDate: string
  confidence: number
}

export type BillRiskAlert = {
  id: string
  name: string
  dueDate: string
  amount: number
  daysAway: number
  expectedAvailable: number
  risk: 'good' | 'warning' | 'critical'
  autopay: boolean
}

export type ForecastWindow = {
  days: 30 | 90 | 365
  projectedNet: number
  projectedCash: number
  coverageMonths: number
  risk: 'healthy' | 'warning' | 'critical'
}

export type BudgetPerformance = {
  id: string
  category: string
  targetAmount: number
  carryoverAmount: number
  effectiveTarget: number
  spent: number
  variance: number
  projectedMonthEnd: number
  rolloverEnabled: boolean
  suggestedRollover: number
  status: 'on_track' | 'warning' | 'over'
}

export type MonthCloseChecklistItem = {
  id: string
  label: string
  done: boolean
  detail: string
}

export type Phase2Data = {
  monthKey: string
  transactionRules: TransactionRuleEntry[]
  envelopeBudgets: EnvelopeBudgetEntry[]
  budgetPerformance: BudgetPerformance[]
  recurringCandidates: RecurringCandidate[]
  billRiskAlerts: BillRiskAlert[]
  forecastWindows: ForecastWindow[]
  monthCloseChecklist: MonthCloseChecklistItem[]
  dataQuality: {
    duplicateCount: number
    anomalyCount: number
    missingCategoryCount: number
    pendingReconciliationCount: number
    splitMismatchCount: number
  }
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
export type TransactionRuleId = Id<'transactionRules'>
export type EnvelopeBudgetId = Id<'envelopeBudgets'>
