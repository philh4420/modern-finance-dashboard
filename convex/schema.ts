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
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
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
  financePreferences: defineTable({
    userId: v.string(),
    currency: v.string(),
    locale: v.string(),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
})
