import { v } from 'convex/values'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'

const cadenceValidator = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly'),
  v.literal('quarterly'),
  v.literal('yearly'),
  v.literal('one_time'),
)

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time'

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('You must be signed in to manage finance data.')
  }
  return identity
}

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
      return amount
    default:
      return amount
  }
}

const validatePositive = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`)
  }
}

const validateRequiredText = (value: string, fieldName: string) => {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`)
  }
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
          summary: {
            monthlyIncome: 0,
            monthlyBills: 0,
            monthlyCardSpend: 0,
            cardLimitTotal: 0,
            cardUsedTotal: 0,
            cardUtilizationPercent: 0,
            purchasesThisMonth: 0,
            projectedMonthlyNet: 0,
          },
        },
      }
    }

    const [incomes, bills, cards, purchases] = await Promise.all([
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
    ])

    const monthlyIncome = incomes.reduce((sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence), 0)
    const monthlyBills = bills.reduce((sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence), 0)
    const monthlyCardSpend = cards.reduce((sum, entry) => sum + entry.spendPerMonth, 0)
    const cardLimitTotal = cards.reduce((sum, entry) => sum + entry.creditLimit, 0)
    const cardUsedTotal = cards.reduce((sum, entry) => sum + entry.usedLimit, 0)

    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const purchasesThisMonth = purchases
      .filter((entry) => entry.purchaseDate.startsWith(monthKey))
      .reduce((sum, entry) => sum + entry.amount, 0)

    const projectedMonthlyNet = monthlyIncome - monthlyBills - monthlyCardSpend

    const timestamps = [
      ...incomes.map((entry) => entry.createdAt),
      ...bills.map((entry) => entry.createdAt),
      ...cards.map((entry) => entry.createdAt),
      ...purchases.map((entry) => entry.createdAt),
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
        summary: {
          monthlyIncome,
          monthlyBills,
          monthlyCardSpend,
          cardLimitTotal,
          cardUsedTotal,
          cardUtilizationPercent: cardLimitTotal > 0 ? (cardUsedTotal / cardLimitTotal) * 100 : 0,
          purchasesThisMonth,
          projectedMonthlyNet,
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

    if (!Number.isFinite(args.usedLimit) || args.usedLimit < 0) {
      throw new Error('Used limit cannot be negative.')
    }

    if (!Number.isFinite(args.minimumPayment) || args.minimumPayment < 0) {
      throw new Error('Minimum payment cannot be negative.')
    }

    if (!Number.isFinite(args.spendPerMonth) || args.spendPerMonth < 0) {
      throw new Error('Spend per month cannot be negative.')
    }

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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.purchaseDate)) {
      throw new Error('Purchase date must use YYYY-MM-DD format.')
    }

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
