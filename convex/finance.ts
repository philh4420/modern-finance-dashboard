import { v } from 'convex/values'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

const cadenceValidator = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly'),
  v.literal('quarterly'),
  v.literal('yearly'),
  v.literal('one_time'),
)

const accountTypeValidator = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('investment'),
  v.literal('cash'),
  v.literal('debt'),
)

const goalPriorityValidator = v.union(v.literal('low'), v.literal('medium'), v.literal('high'))

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time'
type InsightSeverity = 'good' | 'warning' | 'critical'

type IncomeDoc = Doc<'incomes'>
type BillDoc = Doc<'bills'>

const defaultSummary = {
  monthlyIncome: 0,
  monthlyBills: 0,
  monthlyCardSpend: 0,
  monthlyCommitments: 0,
  cardLimitTotal: 0,
  cardUsedTotal: 0,
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

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('You must be signed in to manage finance data.')
  }
  return identity
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toMonthlyAmount = (amount: number, cadence: Cadence) => {
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
    case 'one_time':
      return 0
    default:
      return amount
  }
}

const validatePositive = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`)
  }
}

const validateNonNegative = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} cannot be negative.`)
  }
}

const validateFinite = (value: number, fieldName: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a valid number.`)
  }
}

const validateRequiredText = (value: string, fieldName: string) => {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`)
  }
}

const validateIsoDate = (value: string, fieldName: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`)
  }
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, daysInMonth))
}

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

  const anchorDate = new Date(createdAt)
  const cycleMonths = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
  const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)

  return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
}

const buildUpcomingCashEvents = (incomes: IncomeDoc[], bills: BillDoc[], now: Date) => {
  const events: Array<{
    id: string
    label: string
    type: 'income' | 'bill'
    date: string
    amount: number
    daysAway: number
    cadence: Cadence
  }> = []

  incomes.forEach((entry) => {
    const nextDate = nextDateForCadence(entry.cadence, entry.createdAt, now, entry.receivedDay)

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > 60) {
      return
    }

    events.push({
      id: `income-${entry._id}`,
      label: entry.source,
      type: 'income',
      date: nextDate.toISOString().slice(0, 10),
      amount: entry.amount,
      daysAway,
      cadence: entry.cadence,
    })
  })

  bills.forEach((entry) => {
    const nextDate = nextDateForCadence(entry.cadence, entry.createdAt, now, entry.dueDay)

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > 60) {
      return
    }

    events.push({
      id: `bill-${entry._id}`,
      label: entry.name,
      type: 'bill',
      date: nextDate.toISOString().slice(0, 10),
      amount: -entry.amount,
      daysAway,
      cadence: entry.cadence,
    })
  })

  return events.sort((a, b) => a.daysAway - b.daysAway || a.amount - b.amount).slice(0, 12)
}

const buildInsights = (args: {
  monthlyIncome: number
  projectedMonthlyNet: number
  cardUtilizationPercent: number
  runwayMonths: number
  goalsFundedPercent: number
  topCategoryShare: number
}): Array<{ id: string; title: string; detail: string; severity: InsightSeverity }> => {
  const insights: Array<{ id: string; title: string; detail: string; severity: InsightSeverity }> = []

  if (args.monthlyIncome <= 0) {
    insights.push({
      id: 'income-missing',
      title: 'Income setup needed',
      detail: 'Add at least one income source to activate forecasting and runway metrics.',
      severity: 'critical',
    })
  }

  if (args.projectedMonthlyNet < 0) {
    insights.push({
      id: 'net-negative',
      title: 'Monthly net is negative',
      detail: 'Bills and card spend are above income. Reduce commitments or increase income inputs.',
      severity: 'critical',
    })
  } else if (args.projectedMonthlyNet > 0) {
    insights.push({
      id: 'net-positive',
      title: 'Positive monthly net',
      detail: 'Current plan projects surplus cash each month. Route this to priorities or goals.',
      severity: 'good',
    })
  }

  if (args.cardUtilizationPercent >= 70) {
    insights.push({
      id: 'utilization-high',
      title: 'High credit utilization',
      detail: 'Utilization above 70% increases risk. Target below 30% for healthier balance usage.',
      severity: 'critical',
    })
  } else if (args.cardUtilizationPercent >= 35) {
    insights.push({
      id: 'utilization-watch',
      title: 'Credit utilization watch',
      detail: 'Utilization is elevated. Small principal reductions can quickly improve flexibility.',
      severity: 'warning',
    })
  } else {
    insights.push({
      id: 'utilization-good',
      title: 'Credit utilization healthy',
      detail: 'Card usage is in a healthy band and supports stronger month-to-month resilience.',
      severity: 'good',
    })
  }

  if (args.runwayMonths < 1) {
    insights.push({
      id: 'runway-critical',
      title: 'Limited cash runway',
      detail: 'Liquid reserves cover less than one month of commitments. Build liquidity buffer next.',
      severity: 'critical',
    })
  } else if (args.runwayMonths < 3) {
    insights.push({
      id: 'runway-warning',
      title: 'Runway can be improved',
      detail: 'Current liquidity covers under three months. Consider increasing reserve allocation.',
      severity: 'warning',
    })
  }

  if (args.topCategoryShare > 45) {
    insights.push({
      id: 'category-concentration',
      title: 'Spending concentration detected',
      detail: 'One category dominates this month. Review transactions to reduce concentration risk.',
      severity: 'warning',
    })
  }

  if (args.goalsFundedPercent >= 75) {
    insights.push({
      id: 'goals-ahead',
      title: 'Goals are progressing fast',
      detail: 'Average goal funding is above 75%. You are ahead of pace on long-term targets.',
      severity: 'good',
    })
  }

  return insights.slice(0, 6)
}

export const getFinanceData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return {
        isAuthenticated: false,
        updatedAt: Date.now(),
        data: {
          incomes: [],
          bills: [],
          cards: [],
          purchases: [],
          accounts: [],
          goals: [],
          topCategories: [],
          upcomingCashEvents: [],
          insights: [],
          summary: defaultSummary,
        },
      }
    }

    const [incomes, bills, cards, purchases, accounts, goals] = await Promise.all([
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('accounts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('goals')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
    ])

    const monthlyIncome = incomes.reduce((sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence), 0)
    const monthlyBills = bills.reduce((sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence), 0)
    const monthlyCardSpend = cards.reduce((sum, entry) => sum + entry.spendPerMonth, 0)
    const monthlyCommitments = monthlyBills + monthlyCardSpend

    const cardLimitTotal = cards.reduce((sum, entry) => sum + entry.creditLimit, 0)
    const cardUsedTotal = cards.reduce((sum, entry) => sum + entry.usedLimit, 0)
    const cardUtilizationPercent = cardLimitTotal > 0 ? (cardUsedTotal / cardLimitTotal) * 100 : 0

    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthPurchases = purchases.filter((entry) => entry.purchaseDate.startsWith(monthKey))
    const purchasesThisMonth = monthPurchases.reduce((sum, entry) => sum + entry.amount, 0)

    const projectedMonthlyNet = monthlyIncome - monthlyCommitments
    const savingsRatePercent = monthlyIncome > 0 ? (projectedMonthlyNet / monthlyIncome) * 100 : 0

    const totalAssets = accounts.reduce((sum, entry) => {
      if (entry.type === 'debt') {
        return sum
      }
      return sum + Math.max(entry.balance, 0)
    }, 0)

    const accountDebts = accounts.reduce((sum, entry) => {
      if (entry.type === 'debt') {
        return sum + Math.abs(entry.balance)
      }
      return entry.balance < 0 ? sum + Math.abs(entry.balance) : sum
    }, 0)

    const totalLiabilities = accountDebts + cardUsedTotal
    const netWorth = totalAssets - totalLiabilities

    const liquidReserves = accounts.reduce((sum, entry) => {
      if (!entry.liquid) {
        return sum
      }
      return sum + Math.max(entry.balance, 0)
    }, 0)

    const runwayMonths = monthlyCommitments > 0 ? liquidReserves / monthlyCommitments : liquidReserves > 0 ? 99 : 0

    const goalsFundedPercent =
      goals.length > 0
        ? goals.reduce((sum, goal) => sum + clamp((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100, 0, 100), 0) /
          goals.length
        : 0

    const savingsComponent = clamp((savingsRatePercent + 10) * 1.8, 0, 40)
    const utilizationComponent = clamp((35 - cardUtilizationPercent) * 0.9, 0, 25)
    const runwayComponent = clamp(runwayMonths * 6, 0, 25)
    const goalsComponent = clamp(goalsFundedPercent * 0.1, 0, 10)
    const healthScore = Math.round(clamp(savingsComponent + utilizationComponent + runwayComponent + goalsComponent, 0, 100))

    const categoryMap = new Map<string, { total: number; count: number }>()
    monthPurchases.forEach((entry) => {
      const current = categoryMap.get(entry.category) ?? { total: 0, count: 0 }
      categoryMap.set(entry.category, {
        total: current.total + entry.amount,
        count: current.count + 1,
      })
    })

    const topCategories = [...categoryMap.entries()]
      .map(([category, value]) => ({
        category,
        total: value.total,
        count: value.count,
        sharePercent: purchasesThisMonth > 0 ? (value.total / purchasesThisMonth) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const upcomingCashEvents = buildUpcomingCashEvents(incomes, bills, now)

    const insights = buildInsights({
      monthlyIncome,
      projectedMonthlyNet,
      cardUtilizationPercent,
      runwayMonths,
      goalsFundedPercent,
      topCategoryShare: topCategories[0]?.sharePercent ?? 0,
    })

    const timestamps = [
      ...incomes.map((entry) => entry.createdAt),
      ...bills.map((entry) => entry.createdAt),
      ...cards.map((entry) => entry.createdAt),
      ...purchases.map((entry) => entry.createdAt),
      ...accounts.map((entry) => entry.createdAt),
      ...goals.map((entry) => entry.createdAt),
    ]

    const updatedAt = timestamps.length > 0 ? Math.max(...timestamps) : Date.now()

    return {
      isAuthenticated: true,
      updatedAt,
      data: {
        incomes,
        bills,
        cards,
        purchases,
        accounts,
        goals,
        topCategories,
        upcomingCashEvents,
        insights,
        summary: {
          monthlyIncome,
          monthlyBills,
          monthlyCardSpend,
          monthlyCommitments,
          cardLimitTotal,
          cardUsedTotal,
          cardUtilizationPercent,
          purchasesThisMonth,
          projectedMonthlyNet,
          savingsRatePercent,
          totalAssets,
          totalLiabilities,
          netWorth,
          liquidReserves,
          runwayMonths,
          healthScore,
          goalsFundedPercent,
        },
      },
    }
  },
})

export const addIncome = mutation({
  args: {
    source: v.string(),
    amount: v.number(),
    cadence: cadenceValidator,
    receivedDay: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.source, 'Income source')
    validatePositive(args.amount, 'Income amount')

    if (args.receivedDay !== undefined && (args.receivedDay < 1 || args.receivedDay > 31)) {
      throw new Error('Received day must be between 1 and 31.')
    }

    await ctx.db.insert('incomes', {
      userId: identity.subject,
      source: args.source.trim(),
      amount: args.amount,
      cadence: args.cadence,
      receivedDay: args.receivedDay,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })
  },
})

export const removeIncome = mutation({
  args: {
    id: v.id('incomes'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)

    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Income record not found.')
    }

    await ctx.db.delete(args.id)
  },
})

export const addBill = mutation({
  args: {
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence: cadenceValidator,
    autopay: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Bill name')
    validatePositive(args.amount, 'Bill amount')

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    await ctx.db.insert('bills', {
      userId: identity.subject,
      name: args.name.trim(),
      amount: args.amount,
      dueDay: args.dueDay,
      cadence: args.cadence,
      autopay: args.autopay,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })
  },
})

export const removeBill = mutation({
  args: {
    id: v.id('bills'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)

    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Bill record not found.')
    }

    await ctx.db.delete(args.id)
  },
})

export const addCard = mutation({
  args: {
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    minimumPayment: v.number(),
    spendPerMonth: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Card name')
    validatePositive(args.creditLimit, 'Credit limit')
    validateNonNegative(args.usedLimit, 'Used limit')
    validateNonNegative(args.minimumPayment, 'Minimum payment')
    validateNonNegative(args.spendPerMonth, 'Spend per month')

    await ctx.db.insert('cards', {
      userId: identity.subject,
      name: args.name.trim(),
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      minimumPayment: args.minimumPayment,
      spendPerMonth: args.spendPerMonth,
      createdAt: Date.now(),
    })
  },
})

export const removeCard = mutation({
  args: {
    id: v.id('cards'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)

    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Card record not found.')
    }

    await ctx.db.delete(args.id)
  },
})

export const addPurchase = mutation({
  args: {
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.item, 'Purchase item')
    validateRequiredText(args.category, 'Purchase category')
    validatePositive(args.amount, 'Purchase amount')
    validateIsoDate(args.purchaseDate, 'Purchase date')

    await ctx.db.insert('purchases', {
      userId: identity.subject,
      item: args.item.trim(),
      amount: args.amount,
      category: args.category.trim(),
      purchaseDate: args.purchaseDate,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })
  },
})

export const removePurchase = mutation({
  args: {
    id: v.id('purchases'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)

    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Purchase record not found.')
    }

    await ctx.db.delete(args.id)
  },
})

export const addAccount = mutation({
  args: {
    name: v.string(),
    type: accountTypeValidator,
    balance: v.number(),
    liquid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Account name')
    validateFinite(args.balance, 'Account balance')

    await ctx.db.insert('accounts', {
      userId: identity.subject,
      name: args.name.trim(),
      type: args.type,
      balance: args.balance,
      liquid: args.liquid,
      createdAt: Date.now(),
    })
  },
})

export const removeAccount = mutation({
  args: {
    id: v.id('accounts'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)

    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Account record not found.')
    }

    await ctx.db.delete(args.id)
  },
})

export const addGoal = mutation({
  args: {
    title: v.string(),
    targetAmount: v.number(),
    currentAmount: v.number(),
    targetDate: v.string(),
    priority: goalPriorityValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.title, 'Goal title')
    validatePositive(args.targetAmount, 'Target amount')
    validateNonNegative(args.currentAmount, 'Current amount')
    validateIsoDate(args.targetDate, 'Target date')

    await ctx.db.insert('goals', {
      userId: identity.subject,
      title: args.title.trim(),
      targetAmount: args.targetAmount,
      currentAmount: args.currentAmount,
      targetDate: args.targetDate,
      priority: args.priority,
      createdAt: Date.now(),
    })
  },
})

export const updateGoalProgress = mutation({
  args: {
    id: v.id('goals'),
    currentAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateNonNegative(args.currentAmount, 'Current amount')

    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Goal record not found.')
    }

    await ctx.db.patch(args.id, {
      currentAmount: args.currentAmount,
    })
  },
})

export const removeGoal = mutation({
  args: {
    id: v.id('goals'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)

    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Goal record not found.')
    }

    await ctx.db.delete(args.id)
  },
})

export const cleanupLegacySeedData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)

    const [legacyDashboard, legacyPersonal] = await Promise.all([
      ctx.db
        .query('dashboardStates')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('personalFinanceStates')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
    ])

    await Promise.all([
      ...legacyDashboard.map((doc) => ctx.db.delete(doc._id)),
      ...legacyPersonal.map((doc) => ctx.db.delete(doc._id)),
    ])

    return {
      deletedDashboardStates: legacyDashboard.length,
      deletedPersonalFinanceStates: legacyPersonal.length,
    }
  },
})
