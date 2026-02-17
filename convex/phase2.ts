import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { requireIdentity } from './lib/authz'

const ruleMatchTypeValidator = v.union(v.literal('contains'), v.literal('exact'), v.literal('starts_with'))
const reconciliationStatusValidator = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))
const incomeAllocationTargetValidator = v.union(
  v.literal('bills'),
  v.literal('savings'),
  v.literal('goals'),
  v.literal('debt_overpay'),
)

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'

type PurchaseDoc = Doc<'purchases'>
type TransactionRuleDoc = Doc<'transactionRules'>
type IncomeDoc = Doc<'incomes'>
type IncomePaymentCheckDoc = Doc<'incomePaymentChecks'>

type BillRiskLevel = 'good' | 'warning' | 'critical'
type ForecastRiskLevel = 'healthy' | 'warning' | 'critical'
type IncomeAllocationTarget = 'bills' | 'savings' | 'goals' | 'debt_overpay'
type AutoAllocationActionType = 'reserve_bills' | 'move_to_savings' | 'fund_goals' | 'debt_overpay'

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

type AutoAllocationBucket = {
  target: IncomeAllocationTarget
  label: string
  percentage: number
  monthlyAmount: number
  active: boolean
}

type AutoAllocationPlan = {
  monthlyIncome: number
  totalAllocatedPercent: number
  totalAllocatedAmount: number
  residualAmount: number
  unallocatedPercent: number
  overAllocatedPercent: number
  buckets: AutoAllocationBucket[]
}

type AutoAllocationSuggestion = {
  id: string
  target: IncomeAllocationTarget
  actionType: AutoAllocationActionType
  title: string
  detail: string
  percentage: number
  amount: number
  status: 'suggested' | 'completed' | 'dismissed'
  month: string
  runId: string
  createdAt: number
}

const validateRequiredText = (value: string, label: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`)
  }

  if (trimmed.length > 140) {
    throw new Error(`${label} must be 140 characters or less.`)
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

const validatePercentage = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`)
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
const roundPercent = (value: number) => Math.round(value * 100) / 100

const incomeAllocationTargetLabel: Record<IncomeAllocationTarget, string> = {
  bills: 'Bills',
  savings: 'Savings',
  goals: 'Goals',
  debt_overpay: 'Debt Overpay',
}

const allocationTargets: IncomeAllocationTarget[] = ['bills', 'savings', 'goals', 'debt_overpay']

const buildAutoAllocationPlan = (
  monthlyIncome: number,
  incomeAllocationRules: Array<{ target: IncomeAllocationTarget; percentage: number; active: boolean }>,
): AutoAllocationPlan => {
  const allocationPercentByTarget = new Map<IncomeAllocationTarget, number>(
    allocationTargets.map((target) => [target, 0]),
  )

  incomeAllocationRules.forEach((rule) => {
    if (!rule.active) {
      return
    }
    allocationPercentByTarget.set(
      rule.target,
      roundPercent((allocationPercentByTarget.get(rule.target) ?? 0) + rule.percentage),
    )
  })

  const buckets: AutoAllocationBucket[] = allocationTargets.map((target) => {
    const percentage = roundPercent(allocationPercentByTarget.get(target) ?? 0)
    return {
      target,
      label: incomeAllocationTargetLabel[target],
      percentage,
      monthlyAmount: roundCurrency((monthlyIncome * percentage) / 100),
      active: percentage > 0,
    }
  })

  const totalAllocatedPercent = roundPercent(buckets.reduce((sum, bucket) => sum + bucket.percentage, 0))
  const totalAllocatedAmount = roundCurrency((monthlyIncome * totalAllocatedPercent) / 100)

  return {
    monthlyIncome: roundCurrency(monthlyIncome),
    totalAllocatedPercent,
    totalAllocatedAmount,
    residualAmount: roundCurrency(monthlyIncome - totalAllocatedAmount),
    unallocatedPercent: roundPercent(Math.max(100 - totalAllocatedPercent, 0)),
    overAllocatedPercent: roundPercent(Math.max(totalAllocatedPercent - 100, 0)),
    buckets,
  }
}

const computeIncomeDeductionsTotal = (entry: {
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) =>
  finiteOrZero(entry.taxAmount) +
  finiteOrZero(entry.nationalInsuranceAmount) +
  finiteOrZero(entry.pensionAmount)

const resolveIncomeNetAmount = (entry: {
  amount: number
  grossAmount?: number | null
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) => {
  const grossAmount = finiteOrZero(entry.grossAmount)
  const deductionTotal = computeIncomeDeductionsTotal(entry)

  if (grossAmount > 0 || deductionTotal > 0) {
    return Math.max(grossAmount - deductionTotal, 0)
  }

  return Math.max(finiteOrZero(entry.amount), 0)
}

const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const normalizeText = (value: string) => value.trim().toLowerCase()

const monthKeyToDate = (monthKey: string) => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return null
  }
  const year = Number.parseInt(monthKey.slice(0, 4), 10)
  const month = Number.parseInt(monthKey.slice(5, 7), 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return new Date(year, month - 1, 1)
}

const clampForecastSmoothingMonths = (value: number | undefined | null) => {
  const normalized = Math.round(finiteOrZero(value))
  return normalized >= 2 && normalized <= 24 ? normalized : 6
}

const buildLookbackMonthKeys = (anchorMonthKey: string, months: number) => {
  const anchorDate = monthKeyToDate(anchorMonthKey) ?? new Date()
  const keys: string[] = []
  let cursor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  for (let index = 0; index < months; index += 1) {
    keys.push(toMonthKey(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
  }
  return keys
}

const resolveIncomePaymentCheckAmountForForecast = (
  paymentCheck: IncomePaymentCheckDoc,
  fallbackAmount: number,
) => {
  if (paymentCheck.status === 'missed') {
    return 0
  }

  if (typeof paymentCheck.receivedAmount === 'number' && Number.isFinite(paymentCheck.receivedAmount)) {
    return Math.max(paymentCheck.receivedAmount, 0)
  }

  if (typeof paymentCheck.expectedAmount === 'number' && Number.isFinite(paymentCheck.expectedAmount)) {
    return Math.max(paymentCheck.expectedAmount, 0)
  }

  return Math.max(fallbackAmount, 0)
}

const resolveIncomeForecastMonthlyAmount = (args: {
  income: IncomeDoc
  anchorMonthKey: string
  paymentChecksByMonth: Map<string, IncomePaymentCheckDoc>
}) => {
  const baselineCycleAmount = resolveIncomeNetAmount(args.income)
  const baselineMonthlyAmount = roundCurrency(
    toMonthlyAmount(
      baselineCycleAmount,
      args.income.cadence,
      args.income.customInterval ?? undefined,
      args.income.customUnit ?? undefined,
    ),
  )

  if (!args.income.forecastSmoothingEnabled) {
    return baselineMonthlyAmount
  }

  const lookbackMonths = clampForecastSmoothingMonths(args.income.forecastSmoothingMonths)
  const monthKeys = buildLookbackMonthKeys(args.anchorMonthKey, lookbackMonths)
  const smoothedMonthlyTotal = monthKeys.reduce((sum, monthKey) => {
    const paymentCheck = args.paymentChecksByMonth.get(monthKey)
    if (!paymentCheck) {
      return sum + baselineMonthlyAmount
    }

    const cycleAmount = resolveIncomePaymentCheckAmountForForecast(paymentCheck, baselineCycleAmount)
    const monthlyAmount = toMonthlyAmount(
      cycleAmount,
      args.income.cadence,
      args.income.customInterval ?? undefined,
      args.income.customUnit ?? undefined,
    )
    return sum + monthlyAmount
  }, 0)

  return roundCurrency(smoothedMonthlyTotal / monthKeys.length)
}

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

const nextOneTimeDate = (day: number, anchorDate: Date, now: Date) => {
  const candidate = dateWithClampedDay(anchorDate.getFullYear(), anchorDate.getMonth(), day)
  const scheduled = candidate < anchorDate ? anchorDate : candidate
  return scheduled >= now ? scheduled : null
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
  const anchorDate = startOfDay(new Date(createdAt))
  if (cadence === 'one_time') {
    const normalizedDay = Math.min(Math.max(dayOfMonth ?? anchorDate.getDate(), 1), 31)
    return nextOneTimeDate(normalizedDay, anchorDate, today)
  }

  if (cadence === 'weekly' || cadence === 'biweekly') {
    const interval = cadence === 'weekly' ? 7 : 14
    const base = new Date(anchorDate.getTime())
    while (base < today) {
      base.setDate(base.getDate() + interval)
    }
    return base
  }

  if (cadence === 'custom') {
    if (!customInterval || !customUnit) {
      return null
    }

    const base = new Date(anchorDate.getTime())
    if (customUnit === 'days' || customUnit === 'weeks') {
      const interval = customUnit === 'days' ? customInterval : customInterval * 7
      while (base < today) {
        base.setDate(base.getDate() + interval)
      }
      return base
    }

    const cycleMonths = customUnit === 'months' ? customInterval : customInterval * 12
    return nextDateByMonthCycle(dayOfMonth ?? anchorDate.getDate(), cycleMonths, anchorDate, today)
  }

  const cycleMonths = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
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

type AutoAllocationSuggestionDraft = {
  target: IncomeAllocationTarget
  actionType: AutoAllocationActionType
  title: string
  detail: string
  percentage: number
  amount: number
}

const goalPriorityRank: Record<'low' | 'medium' | 'high', number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const buildAutoAllocationSuggestionDrafts = (args: {
  autoAllocationPlan: AutoAllocationPlan
  monthlyCommitments: number
  cards: Array<{ name: string; usedLimit: number; interestRate?: number | null }>
  loans: Array<{ name: string; balance: number; interestRate?: number | null }>
  goals: Array<{ title: string; priority: 'low' | 'medium' | 'high'; targetAmount: number; currentAmount: number }>
  accounts: Array<{ name: string; type: 'checking' | 'savings' | 'investment' | 'cash' | 'debt'; balance: number }>
}) => {
  const drafts: AutoAllocationSuggestionDraft[] = []

  const savingsAccount = [...args.accounts]
    .filter((account) => account.type === 'savings')
    .sort((a, b) => b.balance - a.balance)[0]

  const goalTarget = [...args.goals]
    .map((goal) => ({ ...goal, remaining: Math.max(goal.targetAmount - goal.currentAmount, 0) }))
    .filter((goal) => goal.remaining > 0)
    .sort((a, b) => goalPriorityRank[a.priority] - goalPriorityRank[b.priority] || b.remaining - a.remaining)[0]

  const debtCandidates = [
    ...args.cards
      .filter((card) => card.usedLimit > 0)
      .map((card) => ({
        kind: 'card' as const,
        name: card.name,
        balance: card.usedLimit,
        apr: finiteOrZero(card.interestRate),
      })),
    ...args.loans
      .filter((loan) => loan.balance > 0)
      .map((loan) => ({
        kind: 'loan' as const,
        name: loan.name,
        balance: loan.balance,
        apr: finiteOrZero(loan.interestRate),
      })),
  ].sort((a, b) => b.apr - a.apr || b.balance - a.balance)
  const debtTarget = debtCandidates[0]

  args.autoAllocationPlan.buckets.forEach((bucket) => {
    if (!bucket.active || bucket.monthlyAmount <= 0) {
      return
    }

    if (bucket.target === 'bills') {
      drafts.push({
        target: bucket.target,
        actionType: 'reserve_bills',
        title: 'Reserve for bills and commitments',
        detail: `Set aside ${roundCurrency(bucket.monthlyAmount)} toward monthly commitments (${roundCurrency(args.monthlyCommitments)} baseline).`,
        percentage: bucket.percentage,
        amount: bucket.monthlyAmount,
      })
      return
    }

    if (bucket.target === 'savings') {
      drafts.push({
        target: bucket.target,
        actionType: 'move_to_savings',
        title: savingsAccount ? `Move into ${savingsAccount.name}` : 'Move to savings buffer',
        detail: savingsAccount
          ? `Transfer ${roundCurrency(bucket.monthlyAmount)} to ${savingsAccount.name} to strengthen reserves.`
          : `Transfer ${roundCurrency(bucket.monthlyAmount)} into a savings account reserve bucket.`,
        percentage: bucket.percentage,
        amount: bucket.monthlyAmount,
      })
      return
    }

    if (bucket.target === 'goals') {
      drafts.push({
        target: bucket.target,
        actionType: 'fund_goals',
        title: goalTarget ? `Fund goal: ${goalTarget.title}` : 'Fund active goals',
        detail: goalTarget
          ? `Allocate ${roundCurrency(bucket.monthlyAmount)} to ${goalTarget.title} (${goalTarget.remaining.toFixed(2)} remaining).`
          : `Allocate ${roundCurrency(bucket.monthlyAmount)} across your active goal balances.`,
        percentage: bucket.percentage,
        amount: bucket.monthlyAmount,
      })
      return
    }

    drafts.push({
      target: bucket.target,
      actionType: 'debt_overpay',
      title: debtTarget ? `Overpay debt: ${debtTarget.name}` : 'Overpay highest APR debt',
      detail: debtTarget
        ? `Use ${roundCurrency(bucket.monthlyAmount)} as extra payment on ${debtTarget.kind} ${debtTarget.name} (${debtTarget.apr.toFixed(2)}% APR).`
        : `Reserve ${roundCurrency(bucket.monthlyAmount)} for extra debt overpayment when debt exists.`,
      percentage: bucket.percentage,
      amount: bucket.monthlyAmount,
    })
  })

  return drafts
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
        incomeAllocationRules: [],
        incomeAllocationSuggestions: [],
        autoAllocationPlan: {
          monthlyIncome: 0,
          totalAllocatedPercent: 0,
          totalAllocatedAmount: 0,
          residualAmount: 0,
          unallocatedPercent: 100,
          overAllocatedPercent: 0,
          buckets: (['bills', 'savings', 'goals', 'debt_overpay'] as const).map((target) => ({
            target,
            label: incomeAllocationTargetLabel[target],
            percentage: 0,
            monthlyAmount: 0,
            active: false,
          })),
        } satisfies AutoAllocationPlan,
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
      incomeAllocationRules,
      incomeAllocationSuggestions,
      purchases,
      purchaseSplits,
      bills,
      incomes,
      incomePaymentChecks,
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
        .query('incomeAllocationRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('incomeAllocationSuggestions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .order('desc')
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
        .query('incomePaymentChecks')
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
      (sum, income) =>
        sum + toMonthlyAmount(resolveIncomeNetAmount(income), income.cadence, income.customInterval, income.customUnit),
      0,
    )

    const incomeChecksByIncomeId = new Map<string, Map<string, IncomePaymentCheckDoc>>()
    incomePaymentChecks.forEach((entry) => {
      const incomeId = String(entry.incomeId)
      const checksByMonth = incomeChecksByIncomeId.get(incomeId) ?? new Map<string, IncomePaymentCheckDoc>()
      const existing = checksByMonth.get(entry.cycleMonth)
      if (!existing || entry.updatedAt > existing.updatedAt) {
        checksByMonth.set(entry.cycleMonth, entry)
      }
      incomeChecksByIncomeId.set(incomeId, checksByMonth)
    })

    const monthlyIncomeForForecast = incomes.reduce((sum, income) => {
      const paymentChecksByMonth = incomeChecksByIncomeId.get(String(income._id)) ?? new Map<string, IncomePaymentCheckDoc>()
      return (
        sum +
        resolveIncomeForecastMonthlyAmount({
          income,
          anchorMonthKey: monthKey,
          paymentChecksByMonth,
        })
      )
    }, 0)
    const autoAllocationPlan = buildAutoAllocationPlan(monthlyIncome, incomeAllocationRules)
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
    const monthlyNet = monthlyIncomeForForecast - monthlyCommitments - monthlySpendEstimate

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

    const allocationSuggestions: AutoAllocationSuggestion[] = incomeAllocationSuggestions
      .map((entry) => ({
        id: String(entry._id),
        target: entry.target,
        actionType: entry.actionType,
        title: entry.title,
        detail: entry.detail,
        percentage: entry.percentage,
        amount: entry.amount,
        status: entry.status,
        month: entry.month,
        runId: entry.runId,
        createdAt: entry.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt || b.amount - a.amount)

    return {
      monthKey,
      transactionRules,
      envelopeBudgets,
      incomeAllocationRules,
      incomeAllocationSuggestions: allocationSuggestions,
      autoAllocationPlan,
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

export const addIncomeAllocationRule = mutation({
  args: {
    target: incomeAllocationTargetValidator,
    percentage: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePercentage(args.percentage, 'Allocation percentage')

    const existing = await ctx.db
      .query('incomeAllocationRules')
      .withIndex('by_userId_target', (q) => q.eq('userId', identity.subject).eq('target', args.target))
      .first()

    if (existing) {
      throw new Error('Allocation rule already exists for this target.')
    }

    await ctx.db.insert('incomeAllocationRules', {
      userId: identity.subject,
      target: args.target,
      percentage: roundPercent(args.percentage),
      active: args.active,
      createdAt: Date.now(),
    })
  },
})

export const updateIncomeAllocationRule = mutation({
  args: {
    id: v.id('incomeAllocationRules'),
    target: incomeAllocationTargetValidator,
    percentage: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Income allocation rule not found.')
    }

    validatePercentage(args.percentage, 'Allocation percentage')

    const duplicate = await ctx.db
      .query('incomeAllocationRules')
      .withIndex('by_userId_target', (q) => q.eq('userId', identity.subject).eq('target', args.target))
      .first()
    if (duplicate && duplicate._id !== args.id) {
      throw new Error('Allocation rule already exists for this target.')
    }

    await ctx.db.patch(args.id, {
      target: args.target,
      percentage: roundPercent(args.percentage),
      active: args.active,
    })
  },
})

export const removeIncomeAllocationRule = mutation({
  args: {
    id: v.id('incomeAllocationRules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Income allocation rule not found.')
    }
    await ctx.db.delete(args.id)
  },
})

export const applyIncomeAutoAllocationNow = mutation({
  args: {
    month: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const nowTimestamp = args.now ?? Date.now()
    const now = new Date(nowTimestamp)
    const monthKey = args.month ?? toMonthKey(now)
    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    const [
      incomeAllocationRules,
      incomes,
      bills,
      cards,
      loans,
      goals,
      accounts,
      existingSuggestions,
    ] = await Promise.all([
      ctx.db
        .query('incomeAllocationRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('bills')
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
        .query('goals')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('accounts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomeAllocationSuggestions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
    ])

    const activeRuleCount = incomeAllocationRules.filter((rule) => rule.active && rule.percentage > 0).length
    if (activeRuleCount === 0) {
      throw new Error('Add at least one active auto-allocation rule before applying suggestions.')
    }

    const monthlyIncome = incomes.reduce(
      (sum, income) =>
        sum + toMonthlyAmount(resolveIncomeNetAmount(income), income.cadence, income.customInterval, income.customUnit),
      0,
    )
    const autoAllocationPlan = buildAutoAllocationPlan(monthlyIncome, incomeAllocationRules)
    if (autoAllocationPlan.totalAllocatedAmount <= 0) {
      throw new Error('Auto-allocation totals are zero. Increase an active allocation percentage.')
    }

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
    const monthlyCommitments = roundCurrency(monthlyBills + monthlyCardPayments + monthlyLoanPayments)

    const drafts = buildAutoAllocationSuggestionDrafts({
      autoAllocationPlan,
      monthlyCommitments,
      cards,
      loans,
      goals,
      accounts,
    })

    if (drafts.length === 0) {
      throw new Error('No active auto-allocation buckets available to suggest.')
    }

    await Promise.all(existingSuggestions.map((entry) => ctx.db.delete(entry._id)))

    const runId = `manual:${nowTimestamp}`
    const created: AutoAllocationSuggestion[] = []

    for (const draft of drafts) {
      const id = await ctx.db.insert('incomeAllocationSuggestions', {
        userId: identity.subject,
        month: monthKey,
        runId,
        target: draft.target,
        actionType: draft.actionType,
        title: draft.title,
        detail: draft.detail,
        percentage: roundPercent(draft.percentage),
        amount: roundCurrency(draft.amount),
        status: 'suggested',
        createdAt: nowTimestamp,
      })

      created.push({
        id: String(id),
        target: draft.target,
        actionType: draft.actionType,
        title: draft.title,
        detail: draft.detail,
        percentage: roundPercent(draft.percentage),
        amount: roundCurrency(draft.amount),
        status: 'suggested',
        month: monthKey,
        runId,
        createdAt: nowTimestamp,
      })
    }

    return {
      monthKey,
      runId,
      suggestionsCreated: created.length,
      totalSuggestedAmount: roundCurrency(created.reduce((sum, entry) => sum + entry.amount, 0)),
      residualAmount: autoAllocationPlan.residualAmount,
      overAllocatedPercent: autoAllocationPlan.overAllocatedPercent,
      suggestions: created,
    }
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
