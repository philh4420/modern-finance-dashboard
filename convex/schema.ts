import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const legacyMetric = v.object({
  id: v.string(),
  label: v.string(),
  value: v.string(),
  change: v.string(),
  period: v.string(),
  trend: v.union(v.literal('up'), v.literal('down'), v.literal('flat')),
})

const legacyWatchlistItem = v.object({
  id: v.string(),
  symbol: v.string(),
  price: v.string(),
  change: v.string(),
  trend: v.union(v.literal('up'), v.literal('down')),
  volume: v.string(),
})

const legacyAllocationSlice = v.object({
  id: v.string(),
  label: v.string(),
  weight: v.string(),
  color: v.string(),
})

const legacyActivity = v.object({
  id: v.string(),
  title: v.string(),
  detail: v.string(),
  timestamp: v.string(),
})

const summaryMetric = v.object({
  id: v.string(),
  label: v.string(),
  value: v.string(),
  changeLabel: v.string(),
  period: v.string(),
  trend: v.union(v.literal('up'), v.literal('down'), v.literal('flat')),
})

const cashflowPoint = v.object({
  id: v.string(),
  label: v.string(),
  value: v.number(),
})

const budgetCategory = v.object({
  id: v.string(),
  category: v.string(),
  spent: v.number(),
  budget: v.number(),
  status: v.union(v.literal('on_track'), v.literal('warning'), v.literal('over')),
  color: v.string(),
})

const accountBalance = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  balance: v.string(),
  delta: v.string(),
  trend: v.union(v.literal('up'), v.literal('down'), v.literal('flat')),
})

const transaction = v.object({
  id: v.string(),
  description: v.string(),
  category: v.string(),
  date: v.string(),
  amount: v.string(),
  kind: v.union(v.literal('income'), v.literal('expense')),
})

const upcomingBill = v.object({
  id: v.string(),
  name: v.string(),
  dueDate: v.string(),
  amount: v.string(),
  autopay: v.boolean(),
})

const insight = v.object({
  id: v.string(),
  title: v.string(),
  detail: v.string(),
})

const cadence = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly'),
  v.literal('quarterly'),
  v.literal('yearly'),
  v.literal('custom'),
  v.literal('one_time'),
)

const customCadenceUnit = v.union(v.literal('days'), v.literal('weeks'), v.literal('months'), v.literal('years'))

const accountType = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('investment'),
  v.literal('cash'),
  v.literal('debt'),
)

const goalPriority = v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
const cycleRunSource = v.union(v.literal('manual'), v.literal('automatic'))
const cycleRunStatus = v.union(v.literal('completed'), v.literal('failed'))
const reconciliationStatus = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))
const ruleMatchType = v.union(v.literal('contains'), v.literal('exact'), v.literal('starts_with'))
const ledgerLineType = v.union(v.literal('debit'), v.literal('credit'))
const ledgerEntryType = v.union(
  v.literal('purchase'),
  v.literal('purchase_reversal'),
  v.literal('cycle_card_spend'),
  v.literal('cycle_card_interest'),
  v.literal('cycle_card_payment'),
  v.literal('cycle_loan_interest'),
  v.literal('cycle_loan_payment'),
)

const cycleSummarySnapshot = v.object({
  monthlyIncome: v.number(),
  monthlyCommitments: v.number(),
  totalLiabilities: v.number(),
  netWorth: v.number(),
  runwayMonths: v.number(),
})

const consentType = v.union(v.literal('diagnostics'), v.literal('analytics'))

const exportStatus = v.union(v.literal('processing'), v.literal('ready'), v.literal('failed'), v.literal('expired'))
const deletionJobStatus = v.union(v.literal('running'), v.literal('completed'), v.literal('failed'))

export default defineSchema({
  dashboardStates: defineTable({
    userId: v.string(),
    metrics: v.array(legacyMetric),
    watchlist: v.array(legacyWatchlistItem),
    allocations: v.array(legacyAllocationSlice),
    activities: v.array(legacyActivity),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  personalFinanceStates: defineTable({
    userId: v.string(),
    summaryMetrics: v.array(summaryMetric),
    cashflow: v.array(cashflowPoint),
    budgets: v.array(budgetCategory),
    accounts: v.array(accountBalance),
    transactions: v.array(transaction),
    upcomingBills: v.array(upcomingBill),
    insights: v.array(insight),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  incomes: defineTable({
    userId: v.string(),
    source: v.string(),
    amount: v.number(),
    cadence,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    receivedDay: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  bills: defineTable({
    userId: v.string(),
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    autopay: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  cards: defineTable({
    userId: v.string(),
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    minimumPayment: v.number(),
    spendPerMonth: v.number(),
    interestRate: v.optional(v.number()),
    lastCycleAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  loans: defineTable({
    userId: v.string(),
    name: v.string(),
    balance: v.number(),
    minimumPayment: v.number(),
    subscriptionCost: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    lastCycleAt: v.optional(v.number()),
    dueDay: v.number(),
    cadence,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  purchases: defineTable({
    userId: v.string(),
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    reconciliationStatus: v.optional(reconciliationStatus),
    statementMonth: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    reconciledAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  financeAuditEvents: defineTable({
    userId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    beforeJson: v.optional(v.string()),
    afterJson: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  ledgerEntries: defineTable({
    userId: v.string(),
    entryType: ledgerEntryType,
    description: v.string(),
    occurredAt: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    cycleKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_cycleKey', ['userId', 'cycleKey']),
  ledgerLines: defineTable({
    userId: v.string(),
    entryId: v.id('ledgerEntries'),
    lineType: ledgerLineType,
    accountCode: v.string(),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_entryId', ['entryId']),
  monthlyCycleRuns: defineTable({
    userId: v.string(),
    cycleKey: v.string(),
    source: cycleRunSource,
    status: cycleRunStatus,
    idempotencyKey: v.optional(v.string()),
    auditLogId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    ranAt: v.number(),
    updatedCards: v.number(),
    updatedLoans: v.number(),
    cardCyclesApplied: v.number(),
    loanCyclesApplied: v.number(),
    cardInterestAccrued: v.number(),
    cardPaymentsApplied: v.number(),
    cardSpendAdded: v.number(),
    loanInterestAccrued: v.number(),
    loanPaymentsApplied: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_cycleKey', ['userId', 'cycleKey'])
    .index('by_userId_idempotencyKey', ['userId', 'idempotencyKey']),
  monthCloseSnapshots: defineTable({
    userId: v.string(),
    cycleKey: v.string(),
    ranAt: v.number(),
    summary: cycleSummarySnapshot,
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_cycleKey', ['userId', 'cycleKey'])
    .index('by_userId_ranAt', ['userId', 'ranAt']),
  accounts: defineTable({
    userId: v.string(),
    name: v.string(),
    type: accountType,
    balance: v.number(),
    liquid: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  goals: defineTable({
    userId: v.string(),
    title: v.string(),
    targetAmount: v.number(),
    currentAmount: v.number(),
    targetDate: v.string(),
    priority: goalPriority,
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  transactionRules: defineTable({
    userId: v.string(),
    name: v.string(),
    matchType: ruleMatchType,
    merchantPattern: v.string(),
    category: v.string(),
    reconciliationStatus: v.optional(reconciliationStatus),
    priority: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  purchaseSplits: defineTable({
    userId: v.string(),
    purchaseId: v.id('purchases'),
    category: v.string(),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_purchaseId', ['purchaseId']),
  envelopeBudgets: defineTable({
    userId: v.string(),
    month: v.string(),
    category: v.string(),
    targetAmount: v.number(),
    rolloverEnabled: v.boolean(),
    carryoverAmount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_month', ['userId', 'month']),
  cycleAuditLogs: defineTable({
    userId: v.string(),
    source: cycleRunSource,
    cycleKey: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    ranAt: v.number(),
    updatedCards: v.number(),
    updatedLoans: v.number(),
    cardCyclesApplied: v.number(),
    loanCyclesApplied: v.number(),
    cardInterestAccrued: v.number(),
    cardPaymentsApplied: v.number(),
    cardSpendAdded: v.number(),
    loanInterestAccrued: v.number(),
    loanPaymentsApplied: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_ranAt', ['userId', 'ranAt']),
  financePreferences: defineTable({
    userId: v.string(),
    currency: v.string(),
    locale: v.string(),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  consentSettings: defineTable({
    userId: v.string(),
    diagnosticsEnabled: v.boolean(),
    analyticsEnabled: v.boolean(),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  consentLogs: defineTable({
    userId: v.string(),
    consentType,
    enabled: v.boolean(),
    version: v.string(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  userExports: defineTable({
    userId: v.string(),
    storageId: v.optional(v.id('_storage')),
    status: exportStatus,
    byteSize: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    formatVersion: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_status', ['userId', 'status']),
  deletionJobs: defineTable({
    userId: v.string(),
    status: deletionJobStatus,
    progressJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  retentionPolicies: defineTable({
    userId: v.string(),
    policyKey: v.string(),
    retentionDays: v.number(),
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_policyKey', ['userId', 'policyKey']),
  clientOpsMetrics: defineTable({
    userId: v.string(),
    event: v.string(),
    queuedCount: v.optional(v.number()),
    conflictCount: v.optional(v.number()),
    flushAttempted: v.optional(v.number()),
    flushSucceeded: v.optional(v.number()),
    payloadJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
})
