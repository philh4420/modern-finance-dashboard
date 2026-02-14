import { v } from 'convex/values'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

const ruleMatchTypeValidator = v.union(v.literal('contains'), v.literal('exact'), v.literal('starts_with'))
const reconciliationStatusValidator = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'

type PurchaseDoc = Doc<'purchases'>
type TransactionRuleDoc = Doc<'transactionRules'>

type BillRiskLevel = 'good' | 'warning' | 'critical'
type ForecastRiskLevel = 'healthy' | 'warning' | 'critical'

type ForecastWindow = {
  days: 30 | 90 | 365
  projectedNet: number
  projectedCash: number
  coverageMonths: number
  risk: ForecastRiskLevel
}

type BillRiskAlert = {
  id: string
  name: string
  dueDate: string
  amount: number
  daysAway: number
  expectedAvailable: number
  risk: BillRiskLevel
  autopay: boolean
}

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('You must be signed in.')
  }
  return identity
}

const validateRequiredText = (value: string, label: string) => {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`)
  }
}

const validatePositive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than 0.`)
  }
}

const validateNonNegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} cannot be negative.`)
  }
}

const validateMonthKey = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM format.`)
  }
}

const finiteOrZero = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const normalizeText = (value: string) => value.trim().toLowerCase()

const toMonthlyAmount = (
  amount: number,
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  switch (cadence) {
    case 'weekly':
      return (amount * 52) / 12
    case 'biweekly':
      return (amount * 26) / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }
      if (customUnit === 'days') return (amount * 365.2425) / (customInterval * 12)
      if (customUnit === 'weeks') return (amount * 365.2425) / (customInterval * 7 * 12)
      if (customUnit === 'months') return amount / customInterval
      return amount / (customInterval * 12)
    default:
      return 0
  }
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(Math.max(day, 1), daysInMonth))
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const nextDateByMonthCycle = (day: number, cycleMonths: number, anchorDate: Date, now: Date) => {
  const anchorMonthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  let probeYear = now.getFullYear()
  let probeMonth = now.getMonth()

  for (let i = 0; i < 36; i += 1) {
    const candidate = dateWithClampedDay(probeYear, probeMonth, day)
    const candidateMonthStart = new Date(candidate.getFullYear(), candidate.getMonth(), 1)
    const monthDiff = monthsBetween(anchorMonthStart, candidateMonthStart)
    if (candidate >= now && monthDiff >= 0 && monthDiff % cycleMonths === 0) {
      return candidate
    }
    probeMonth += 1
    if (probeMonth > 11) {
      probeMonth = 0
      probeYear += 1
    }
  }

  return null
}

const nextDateForCadence = (
  cadence: Cadence,
  createdAt: number,
  now: Date,
  dayOfMonth?: number,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
): Date | null => {
  const today = startOfDay(now)
  if (cadence === 'one_time') {
    return null
  }

  if (cadence === 'weekly' || cadence === 'biweekly') {
    const interval = cadence === 'weekly' ? 7 : 14
    const base = startOfDay(new Date(createdAt))
    while (base < today) {
      base.setDate(base.getDate() + interval)
    }
    return base
  }

  if (cadence === 'custom') {
    if (!customInterval || !customUnit) {
      return null
    }

    const base = startOfDay(new Date(createdAt))
    if (customUnit === 'days' || customUnit === 'weeks') {
      const interval = customUnit === 'days' ? customInterval : customInterval * 7
      while (base < today) {
        base.setDate(base.getDate() + interval)
      }
      return base
    }

    const cycleMonths = customUnit === 'months' ? customInterval : customInterval * 12
    const anchorDate = new Date(createdAt)
    return nextDateByMonthCycle(dayOfMonth ?? anchorDate.getDate(), cycleMonths, anchorDate, today)
  }

  const cycleMonths = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
  const anchorDate = new Date(createdAt)
  return nextDateByMonthCycle(dayOfMonth ?? anchorDate.getDate(), cycleMonths, anchorDate, today)
}

const ruleMatchesPurchase = (rule: TransactionRuleDoc, item: string) => {
  const value = normalizeText(item)
  const pattern = normalizeText(rule.merchantPattern)
  if (pattern.length === 0) {
    return false
  }

  if (rule.matchType === 'exact') {
    return value === pattern
  }

  if (rule.matchType === 'starts_with') {
    return value.startsWith(pattern)
  }

  return value.includes(pattern)
}

const pickMatchingRule = (rules: TransactionRuleDoc[], item: string) => {
  const sorted = [...rules]
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
  return sorted.find((rule) => ruleMatchesPurchase(rule, item)) ?? null
}

export const applyRulesPreview = query({
  args: {
    item: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const rules = await ctx.db
      .query('transactionRules')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
      .collect()

    const matched = pickMatchingRule(rules, args.item)
    return matched
      ? {
          matched: true,
          ruleId: String(matched._id),
          category: matched.category,
          reconciliationStatus: matched.reconciliationStatus ?? 'posted',
        }
      : {
          matched: false,
        }
  },
})

export const getPhase2Data = query({
  args: {
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const now = new Date()
    const monthKey = args.month ?? toMonthKey(now)

    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    if (!identity) {
      return {
        monthKey,
        transactionRules: [],
        envelopeBudgets: [],
        budgetPerformance: [],
        recurringCandidates: [],
        billRiskAlerts: [],
        forecastWindows: [],
        monthCloseChecklist: [],
        dataQuality: {
          duplicateCount: 0,
          anomalyCount: 0,
          missingCategoryCount: 0,
          pendingReconciliationCount: 0,
          splitMismatchCount: 0,
        },
      }
    }

    const [
      transactionRules,
      envelopeBudgets,
      purchases,
      purchaseSplits,
      bills,
      incomes,
      cards,
      loans,
      accounts,
      monthlyCycleRuns,
    ] = await Promise.all([
      ctx.db
        .query('transactionRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('envelopeBudgets')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseSplits')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('accounts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
    ])

    const splitMap = new Map<string, Array<{ category: string; amount: number }>>()
    purchaseSplits.forEach((split) => {
      const key = String(split.purchaseId)
      const current = splitMap.get(key) ?? []
      current.push({
        category: split.category,
        amount: split.amount,
      })
      splitMap.set(key, current)
    })

    const monthPurchases = purchases.filter((purchase) => purchase.purchaseDate.startsWith(monthKey))
    const monthSpendByCategory = new Map<string, number>()
    monthPurchases.forEach((purchase) => {
      const splits = splitMap.get(String(purchase._id))
      if (splits && splits.length > 0) {
        splits.forEach((split) => {
          monthSpendByCategory.set(split.category, (monthSpendByCategory.get(split.category) ?? 0) + split.amount)
        })
      } else {
        monthSpendByCategory.set(purchase.category, (monthSpendByCategory.get(purchase.category) ?? 0) + purchase.amount)
      }
    })

    const monthDate = new Date(`${monthKey}-01T00:00:00`)
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const isCurrentMonth = monthKey === toMonthKey(now)
    const elapsedDays = isCurrentMonth ? Math.max(now.getDate(), 1) : daysInMonth

    const budgetPerformance = envelopeBudgets
      .map((budget) => {
        const spent = roundCurrency(monthSpendByCategory.get(budget.category) ?? 0)
        const effectiveTarget = roundCurrency(budget.targetAmount + finiteOrZero(budget.carryoverAmount))
        const variance = roundCurrency(effectiveTarget - spent)
        const projectedMonthEnd = roundCurrency((spent / elapsedDays) * daysInMonth)

        let status: 'on_track' | 'warning' | 'over' = 'on_track'
        if (projectedMonthEnd > effectiveTarget) {
          status = 'over'
        } else if (projectedMonthEnd > effectiveTarget * 0.9) {
          status = 'warning'
        }

        return {
          id: String(budget._id),
          category: budget.category,
          targetAmount: budget.targetAmount,
          carryoverAmount: finiteOrZero(budget.carryoverAmount),
          effectiveTarget,
          spent,
          variance,
          projectedMonthEnd,
          rolloverEnabled: budget.rolloverEnabled,
          suggestedRollover: budget.rolloverEnabled ? roundCurrency(Math.max(variance, 0)) : 0,
          status,
        }
      })
      .sort((a, b) => b.spent - a.spent)

    const recurringWindowStart = new Date(now.getTime() - 210 * 86400000)
    const recurringPurchases = purchases.filter((purchase) => new Date(`${purchase.purchaseDate}T00:00:00`) >= recurringWindowStart)
    const recurringGroups = new Map<string, PurchaseDoc[]>()
    recurringPurchases.forEach((purchase) => {
      const key = normalizeText(purchase.item)
      const current = recurringGroups.get(key) ?? []
      current.push(purchase)
      recurringGroups.set(key, current)
    })

    const recurringCandidates = [...recurringGroups.entries()]
      .map(([key, group]) => {
        if (group.length < 3) {
          return null
        }

        const sorted = [...group].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
        const intervals: number[] = []
        for (let i = 1; i < sorted.length; i += 1) {
          const from = new Date(`${sorted[i - 1].purchaseDate}T00:00:00`).getTime()
          const to = new Date(`${sorted[i].purchaseDate}T00:00:00`).getTime()
          intervals.push((to - from) / 86400000)
        }

        const avgInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        if (avgInterval < 5 || avgInterval > 45) {
          return null
        }

        const avgAmount = sorted.reduce((sum, purchase) => sum + purchase.amount, 0) / sorted.length
        const lastPurchase = sorted[sorted.length - 1]
        const nextExpected = new Date(new Date(`${lastPurchase.purchaseDate}T00:00:00`).getTime() + avgInterval * 86400000)
        const variance = intervals.reduce((sum, value) => sum + Math.abs(value - avgInterval), 0) / intervals.length
        const confidence = Math.max(0, Math.min(1, 1 - variance / 20 + sorted.length * 0.04))

        return {
          id: key,
          label: lastPurchase.item,
          category: lastPurchase.category,
          count: sorted.length,
          averageAmount: roundCurrency(avgAmount),
          averageIntervalDays: roundCurrency(avgInterval),
          nextExpectedDate: nextExpected.toISOString().slice(0, 10),
          confidence: roundCurrency(confidence * 100),
        }
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => b.confidence - a.confidence || b.count - a.count)
      .slice(0, 8)

    const monthlyIncome = incomes.reduce(
      (sum, income) => sum + toMonthlyAmount(income.amount, income.cadence, income.customInterval, income.customUnit),
      0,
    )
    const monthlyBills = bills.reduce(
      (sum, bill) => sum + toMonthlyAmount(bill.amount, bill.cadence, bill.customInterval, bill.customUnit),
      0,
    )
    const monthlyCardPayments = cards.reduce((sum, card) => sum + finiteOrZero(card.minimumPayment), 0)
    const monthlyLoanPayments = loans.reduce(
      (sum, loan) =>
        sum +
        toMonthlyAmount(finiteOrZero(loan.minimumPayment), loan.cadence, loan.customInterval, loan.customUnit) +
        finiteOrZero(loan.subscriptionCost),
      0,
    )
    const monthlyCommitments = monthlyBills + monthlyCardPayments + monthlyLoanPayments

    const ninetyDayWindowStart = new Date(now.getTime() - 90 * 86400000)
    const recentPurchases = purchases.filter((purchase) => new Date(`${purchase.purchaseDate}T00:00:00`) >= ninetyDayWindowStart)
    const averageDailySpend = recentPurchases.reduce((sum, purchase) => sum + purchase.amount, 0) / 90
    const monthlySpendEstimate = averageDailySpend * 30
    const monthlyNet = monthlyIncome - monthlyCommitments - monthlySpendEstimate

    const liquidReserves = accounts.reduce((sum, account) => {
      if (!account.liquid) {
        return sum
      }
      return sum + Math.max(account.balance, 0)
    }, 0)

    const forecastWindows: ForecastWindow[] = ([30, 90, 365] as const).map((days) => {
      const projectedNet = roundCurrency(monthlyNet * (days / 30))
      const projectedCash = roundCurrency(liquidReserves + projectedNet)
      const coverageMonths = monthlyCommitments > 0 ? roundCurrency(projectedCash / monthlyCommitments) : 99
      const risk: ForecastRiskLevel =
        projectedCash < 0 ? 'critical' : projectedCash < monthlyCommitments ? 'warning' : 'healthy'
      return {
        days,
        projectedNet,
        projectedCash,
        coverageMonths,
        risk,
      }
    })

    const billRiskAlerts: BillRiskAlert[] = bills
      .map((bill): BillRiskAlert | null => {
        const nextDate = nextDateForCadence(
          bill.cadence,
          bill.createdAt,
          now,
          bill.dueDay,
          bill.customInterval,
          bill.customUnit,
        )
        if (!nextDate) {
          return null
        }
        const daysAway = Math.round((startOfDay(nextDate).getTime() - startOfDay(now).getTime()) / 86400000)
        if (daysAway < 0 || daysAway > 45) {
          return null
        }
        const expectedAvailable = roundCurrency(liquidReserves + (monthlyNet / 30) * daysAway)
        const risk: BillRiskLevel =
          expectedAvailable < bill.amount ? 'critical' : expectedAvailable < bill.amount * 1.25 ? 'warning' : 'good'
        return {
          id: String(bill._id),
          name: bill.name,
          dueDate: nextDate.toISOString().slice(0, 10),
          amount: bill.amount,
          daysAway,
          expectedAvailable,
          risk,
          autopay: bill.autopay,
        }
      })
      .filter((entry): entry is BillRiskAlert => Boolean(entry))
      .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount)

    const duplicateMap = new Map<string, number>()
    purchases.forEach((purchase) => {
      const key = `${normalizeText(purchase.item)}::${roundCurrency(purchase.amount)}::${purchase.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = [...duplicateMap.values()].filter((count) => count > 1).length

    const amounts = recentPurchases.map((purchase) => purchase.amount)
    const amountMean = amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : 0
    const amountStd =
      amounts.length > 1
        ? Math.sqrt(amounts.reduce((sum, value) => sum + (value - amountMean) ** 2, 0) / (amounts.length - 1))
        : 0

    const anomalyCount = recentPurchases.filter((purchase) => purchase.amount > amountMean + amountStd * 2.5 && purchase.amount > 50).length
    const missingCategoryCount = purchases.filter((purchase) => {
      const value = normalizeText(purchase.category)
      return value.length === 0 || value === 'uncategorized' || value === 'other' || value === 'misc'
    }).length
    const pendingReconciliationCount = purchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending').length

    let splitMismatchCount = 0
    purchases.forEach((purchase) => {
      const splits = splitMap.get(String(purchase._id))
      if (!splits || splits.length === 0) {
        return
      }
      const total = splits.reduce((sum, split) => sum + split.amount, 0)
      if (Math.abs(roundCurrency(total) - roundCurrency(purchase.amount)) > 0.01) {
        splitMismatchCount += 1
      }
    })

    const topSpendingCategories = [...monthSpendByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category)
    const budgetCategories = new Set(envelopeBudgets.map((budget) => budget.category))

    const monthCloseChecklist = [
      {
        id: 'pending-reconciliation',
        label: 'Resolve pending purchase reconciliation',
        done: pendingReconciliationCount === 0,
        detail: `${pendingReconciliationCount} pending entries`,
      },
      {
        id: 'cycle-run',
        label: `Run monthly cycle for ${monthKey}`,
        done: monthlyCycleRuns.some((run) => run.cycleKey === monthKey),
        detail: monthlyCycleRuns.some((run) => run.cycleKey === monthKey) ? 'Cycle run recorded' : 'No cycle run recorded',
      },
      {
        id: 'anomalies-reviewed',
        label: 'Review spending anomalies',
        done: anomalyCount === 0,
        detail: `${anomalyCount} anomalies flagged`,
      },
      {
        id: 'budget-coverage',
        label: 'Cover top spending categories with budgets',
        done: topSpendingCategories.every((category) => budgetCategories.has(category)),
        detail: topSpendingCategories.length === 0 ? 'No spend categories yet' : `${topSpendingCategories.length} top categories checked`,
      },
      {
        id: 'categories-complete',
        label: 'Clear missing categories',
        done: missingCategoryCount === 0,
        detail: `${missingCategoryCount} uncategorized entries`,
      },
    ]

    return {
      monthKey,
      transactionRules,
      envelopeBudgets,
      budgetPerformance,
      recurringCandidates,
      billRiskAlerts,
      forecastWindows,
      monthCloseChecklist,
      dataQuality: {
        duplicateCount,
        anomalyCount,
        missingCategoryCount,
        pendingReconciliationCount,
        splitMismatchCount,
      },
    }
  },
})

export const addTransactionRule = mutation({
  args: {
    name: v.string(),
    matchType: ruleMatchTypeValidator,
    merchantPattern: v.string(),
    category: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    priority: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateRequiredText(args.name, 'Rule name')
    validateRequiredText(args.merchantPattern, 'Merchant pattern')
    validateRequiredText(args.category, 'Rule category')
    validateNonNegative(args.priority, 'Rule priority')

    await ctx.db.insert('transactionRules', {
      userId: identity.subject,
      name: args.name.trim(),
      matchType: args.matchType,
      merchantPattern: args.merchantPattern.trim(),
      category: args.category.trim(),
      reconciliationStatus: args.reconciliationStatus,
      priority: Math.floor(args.priority),
      active: args.active,
      createdAt: Date.now(),
    })
  },
})

export const updateTransactionRule = mutation({
  args: {
    id: v.id('transactionRules'),
    name: v.string(),
    matchType: ruleMatchTypeValidator,
    merchantPattern: v.string(),
    category: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    priority: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Transaction rule not found.')
    }

    validateRequiredText(args.name, 'Rule name')
    validateRequiredText(args.merchantPattern, 'Merchant pattern')
    validateRequiredText(args.category, 'Rule category')
    validateNonNegative(args.priority, 'Rule priority')

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      matchType: args.matchType,
      merchantPattern: args.merchantPattern.trim(),
      category: args.category.trim(),
      reconciliationStatus: args.reconciliationStatus,
      priority: Math.floor(args.priority),
      active: args.active,
    })
  },
})

export const removeTransactionRule = mutation({
  args: {
    id: v.id('transactionRules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Transaction rule not found.')
    }
    await ctx.db.delete(args.id)
  },
})

export const addEnvelopeBudget = mutation({
  args: {
    month: v.string(),
    category: v.string(),
    targetAmount: v.number(),
    rolloverEnabled: v.boolean(),
    carryoverAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateMonthKey(args.month, 'Budget month')
    validateRequiredText(args.category, 'Budget category')
    validatePositive(args.targetAmount, 'Target amount')
    if (args.carryoverAmount !== undefined) {
      validateNonNegative(args.carryoverAmount, 'Carryover amount')
    }

    const existing = await ctx.db
      .query('envelopeBudgets')
      .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', args.month))
      .collect()
    const duplicate = existing.find((budget) => normalizeText(budget.category) === normalizeText(args.category))
    if (duplicate) {
      throw new Error('Budget category already exists for this month.')
    }

    await ctx.db.insert('envelopeBudgets', {
      userId: identity.subject,
      month: args.month,
      category: args.category.trim(),
      targetAmount: args.targetAmount,
      rolloverEnabled: args.rolloverEnabled,
      carryoverAmount: args.carryoverAmount,
      createdAt: Date.now(),
    })
  },
})

export const updateEnvelopeBudget = mutation({
  args: {
    id: v.id('envelopeBudgets'),
    month: v.string(),
    category: v.string(),
    targetAmount: v.number(),
    rolloverEnabled: v.boolean(),
    carryoverAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Budget not found.')
    }

    validateMonthKey(args.month, 'Budget month')
    validateRequiredText(args.category, 'Budget category')
    validatePositive(args.targetAmount, 'Target amount')
    if (args.carryoverAmount !== undefined) {
      validateNonNegative(args.carryoverAmount, 'Carryover amount')
    }

    await ctx.db.patch(args.id, {
      month: args.month,
      category: args.category.trim(),
      targetAmount: args.targetAmount,
      rolloverEnabled: args.rolloverEnabled,
      carryoverAmount: args.carryoverAmount,
    })
  },
})

export const removeEnvelopeBudget = mutation({
  args: {
    id: v.id('envelopeBudgets'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Budget not found.')
    }
    await ctx.db.delete(args.id)
  },
})

export const upsertPurchaseSplits = mutation({
  args: {
    purchaseId: v.id('purchases'),
    splits: v.array(
      v.object({
        category: v.string(),
        amount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const purchase = await ctx.db.get(args.purchaseId)
    if (!purchase || purchase.userId !== identity.subject) {
      throw new Error('Purchase not found.')
    }
    if (args.splits.length === 0) {
      throw new Error('At least one split is required.')
    }

    const splitTotal = roundCurrency(args.splits.reduce((sum, split) => {
      validateRequiredText(split.category, 'Split category')
      validatePositive(split.amount, 'Split amount')
      return sum + split.amount
    }, 0))

    if (Math.abs(splitTotal - roundCurrency(purchase.amount)) > 0.01) {
      throw new Error('Split amounts must equal purchase total.')
    }

    const existingSplits = await ctx.db
      .query('purchaseSplits')
      .withIndex('by_purchaseId', (q) => q.eq('purchaseId', args.purchaseId))
      .collect()
    await Promise.all(existingSplits.map((split) => ctx.db.delete(split._id)))

    for (const split of args.splits) {
      await ctx.db.insert('purchaseSplits', {
        userId: identity.subject,
        purchaseId: args.purchaseId,
        category: split.category.trim(),
        amount: split.amount,
        createdAt: Date.now(),
      })
    }
  },
})

export const clearPurchaseSplits = mutation({
  args: {
    purchaseId: v.id('purchases'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const purchase = await ctx.db.get(args.purchaseId)
    if (!purchase || purchase.userId !== identity.subject) {
      throw new Error('Purchase not found.')
    }
    const existingSplits = await ctx.db
      .query('purchaseSplits')
      .withIndex('by_purchaseId', (q) => q.eq('purchaseId', args.purchaseId))
      .collect()
    await Promise.all(existingSplits.map((split) => ctx.db.delete(split._id)))
  },
})

export const bulkUpdatePurchaseReconciliation = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    reconciliationStatus: reconciliationStatusValidator,
    statementMonth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (args.ids.length === 0) {
      return { updated: 0 }
    }
    if (args.statementMonth) {
      validateMonthKey(args.statementMonth, 'Statement month')
    }

    let updated = 0
    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }

      const now = Date.now()
      const postedAt = args.reconciliationStatus === 'pending' ? undefined : purchase.postedAt ?? now
      const reconciledAt = args.reconciliationStatus === 'reconciled' ? purchase.reconciledAt ?? now : undefined

      await ctx.db.patch(id, {
        reconciliationStatus: args.reconciliationStatus,
        statementMonth: args.statementMonth ?? purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7),
        postedAt,
        reconciledAt,
      })
      updated += 1
    }

    return { updated }
  },
})

export const bulkUpdatePurchaseCategory = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateRequiredText(args.category, 'Category')

    let updated = 0
    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }
      await ctx.db.patch(id, {
        category: args.category.trim(),
      })
      updated += 1
    }

    return { updated }
  },
})

export const bulkDeletePurchases = mutation({
  args: {
    ids: v.array(v.id('purchases')),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    let deleted = 0

    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }

      const splits = await ctx.db
        .query('purchaseSplits')
        .withIndex('by_purchaseId', (q) => q.eq('purchaseId', id))
        .collect()

      await Promise.all(splits.map((split) => ctx.db.delete(split._id)))
      await ctx.db.delete(id)
      deleted += 1
    }

    return { deleted }
  },
})

export const bulkApplyTransactionRule = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    ruleId: v.id('transactionRules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const rule = await ctx.db.get(args.ruleId)
    if (!rule || rule.userId !== identity.subject) {
      throw new Error('Rule not found.')
    }

    let updated = 0
    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }

      if (!ruleMatchesPurchase(rule, purchase.item)) {
        continue
      }

      await ctx.db.patch(id, {
        category: rule.category,
        reconciliationStatus: rule.reconciliationStatus ?? purchase.reconciliationStatus ?? 'posted',
      })
      updated += 1
    }

    return { updated }
  },
})
