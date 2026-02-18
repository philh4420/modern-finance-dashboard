import { v } from 'convex/values'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireIdentity as requireAuthIdentity } from './lib/authz'

const cadenceValidator = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly'),
  v.literal('quarterly'),
  v.literal('yearly'),
  v.literal('custom'),
  v.literal('one_time'),
)

const customCadenceUnitValidator = v.union(
  v.literal('days'),
  v.literal('weeks'),
  v.literal('months'),
  v.literal('years'),
)

const accountTypeValidator = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('investment'),
  v.literal('cash'),
  v.literal('debt'),
)

const goalPriorityValidator = v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
const cycleRunSourceValidator = v.union(v.literal('manual'), v.literal('automatic'))
const reconciliationStatusValidator = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))
const cardMinimumPaymentTypeValidator = v.union(v.literal('fixed'), v.literal('percent_plus_interest'))
const incomePaymentStatusValidator = v.union(v.literal('on_time'), v.literal('late'), v.literal('missed'))

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'
type InsightSeverity = 'good' | 'warning' | 'critical'
type CycleRunSource = 'manual' | 'automatic'
type ReconciliationStatus = 'pending' | 'posted' | 'reconciled'
type CardMinimumPaymentType = 'fixed' | 'percent_plus_interest'
type IncomePaymentStatus = 'on_time' | 'late' | 'missed'
type IncomeChangeDirection = 'increase' | 'decrease' | 'no_change'
type LedgerEntryType =
  | 'purchase'
  | 'purchase_reversal'
  | 'cycle_card_spend'
  | 'cycle_card_interest'
  | 'cycle_card_payment'
  | 'cycle_loan_interest'
  | 'cycle_loan_payment'
type LedgerLineType = 'debit' | 'credit'

type IncomeDoc = Doc<'incomes'>
type BillDoc = Doc<'bills'>
type CardDoc = Doc<'cards'>
type LoanDoc = Doc<'loans'>

const defaultPreference = {
  currency: 'USD',
  locale: 'en-US',
}

const defaultSummary = {
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
  pendingPurchases: 0,
  postedPurchases: 0,
  reconciledPurchases: 0,
}

const requireIdentity = async (ctx: QueryCtx | MutationCtx) =>
  requireAuthIdentity(ctx, 'You must be signed in to manage finance data.')

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

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

      switch (customUnit) {
        case 'days':
          return (amount * 365.2425) / (customInterval * 12)
        case 'weeks':
          return (amount * 365.2425) / (customInterval * 7 * 12)
        case 'months':
          return amount / customInterval
        case 'years':
          return amount / (customInterval * 12)
        default:
          return 0
      }
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

const validateDayOfMonth = (value: number, fieldName: string) => {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${fieldName} must be an integer between 1 and 31.`)
  }
}

const validateUsedLimitAgainstCreditLimit = (args: {
  creditLimit: number
  usedLimit: number
  allowOverLimitOverride?: boolean
}) => {
  if (args.usedLimit <= args.creditLimit + 0.000001) {
    return
  }

  if (!args.allowOverLimitOverride) {
    throw new Error('Current balance exceeds credit limit. Enable over-limit override to continue.')
  }
}

const finiteOrZero = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

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

const resolveIncomeChangeDirection = (deltaAmount: number): IncomeChangeDirection => {
  if (deltaAmount > 0.000001) {
    return 'increase'
  }
  if (deltaAmount < -0.000001) {
    return 'decrease'
  }
  return 'no_change'
}

const normalizeIncomeForecastSmoothing = (
  enabled: boolean | undefined | null,
  lookbackMonths: number | undefined | null,
) => {
  const forecastSmoothingEnabled = enabled === true
  if (!forecastSmoothingEnabled) {
    return {
      forecastSmoothingEnabled: false,
      forecastSmoothingMonths: undefined,
    }
  }

  const normalizedMonths = Math.round(finiteOrZero(lookbackMonths))
  if (!Number.isFinite(normalizedMonths) || normalizedMonths < 2 || normalizedMonths > 24) {
    throw new Error('Forecast smoothing lookback must be an integer between 2 and 24 months.')
  }

  return {
    forecastSmoothingEnabled: true,
    forecastSmoothingMonths: normalizedMonths,
  }
}

const normalizeCardMinimumPaymentType = (
  value: CardMinimumPaymentType | undefined | null,
): CardMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const clampPercent = (value: number) => clamp(value, 0, 100)

const validateRequiredText = (value: string, fieldName: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} is required.`)
  }

  if (trimmed.length > 140) {
    throw new Error(`${fieldName} must be 140 characters or less.`)
  }
}

const validateOptionalText = (value: string | undefined | null, fieldName: string, maxLength: number) => {
  if (value === undefined || value === null) {
    return
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or less.`)
  }
}

const parseIsoDateValue = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [yearText, monthText, dayText] = value.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return parsed
}

const validateIsoDate = (value: string, fieldName: string) => {
  if (!parseIsoDateValue(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`)
  }
}

const validateStatementMonth = (value: string, fieldName: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM format.`)
  }
}

const toCycleKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const sanitizeLedgerToken = (value: string) => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized.length > 0 ? normalized : 'UNSPECIFIED'
}

const stringifyForAudit = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

const isGenericCategory = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized.length === 0 || normalized === 'uncategorized' || normalized === 'other' || normalized === 'misc'
}

const matchesPurchasePattern = (value: string, pattern: string, matchType: 'contains' | 'exact' | 'starts_with') => {
  const normalizedValue = value.trim().toLowerCase()
  const normalizedPattern = pattern.trim().toLowerCase()
  if (normalizedPattern.length === 0) {
    return false
  }
  if (matchType === 'exact') {
    return normalizedValue === normalizedPattern
  }
  if (matchType === 'starts_with') {
    return normalizedValue.startsWith(normalizedPattern)
  }
  return normalizedValue.includes(normalizedPattern)
}

const resolvePurchaseRuleOverrides = async (ctx: MutationCtx, userId: string, item: string) => {
  const rules = await ctx.db
    .query('transactionRules')
    .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
    .collect()

  const matchedRule = [...rules]
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
    .find((rule) => matchesPurchasePattern(item, rule.merchantPattern, rule.matchType))

  if (!matchedRule) {
    return null
  }

  return {
    category: matchedRule.category.trim(),
    reconciliationStatus: matchedRule.reconciliationStatus,
    ruleId: String(matchedRule._id),
  }
}

const sanitizeCadenceDetails = (
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  if (cadence !== 'custom') {
    return {
      customInterval: undefined,
      customUnit: undefined,
    }
  }

  if (!customUnit) {
    throw new Error('Custom frequency unit is required.')
  }

  if (!customInterval || !Number.isInteger(customInterval) || customInterval < 1 || customInterval > 3650) {
    throw new Error('Custom frequency interval must be an integer between 1 and 3650.')
  }

  return {
    customInterval,
    customUnit,
  }
}

const sanitizeSubscriptionDetails = (isSubscription?: boolean, cancelReminderDays?: number) => {
  const enabled = isSubscription === true
  if (!enabled) {
    return {
      isSubscription: false,
      cancelReminderDays: undefined,
    }
  }

  if (cancelReminderDays === undefined) {
    return {
      isSubscription: true,
      cancelReminderDays: 7,
    }
  }

  if (!Number.isInteger(cancelReminderDays) || cancelReminderDays < 0 || cancelReminderDays > 365) {
    throw new Error('Cancel reminder must be an integer between 0 and 365 days.')
  }

  return {
    isSubscription: true,
    cancelReminderDays,
  }
}

const validateLocale = (locale: string) => {
  try {
    new Intl.NumberFormat(locale)
    return true
  } catch {
    return false
  }
}

const validateCurrencyCode = (currency: string) => {
  if (!/^[A-Z]{3}$/.test(currency)) {
    return false
  }

  try {
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    })
    return true
  } catch {
    return false
  }
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const roundCurrency = (value: number) => Math.round(value * 100) / 100

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, daysInMonth))
}

const addCalendarMonthsKeepingDay = (date: Date, months: number) =>
  dateWithClampedDay(date.getFullYear(), date.getMonth() + months, date.getDate())

const countCompletedMonthlyCycles = (fromTimestamp: number, now: Date) => {
  const today = startOfDay(now)
  let marker = startOfDay(new Date(fromTimestamp))
  let cycles = 0

  for (let i = 0; i < 600; i += 1) {
    const next = addCalendarMonthsKeepingDay(marker, 1)
    if (next > today) {
      break
    }
    marker = next
    cycles += 1
  }

  return cycles
}

const resolveCadenceAnchorDate = (createdAt: number, payDateAnchor?: string) => {
  if (payDateAnchor) {
    const parsed = parseIsoDateValue(payDateAnchor)
    if (parsed) {
      return startOfDay(parsed)
    }
  }
  return startOfDay(new Date(createdAt))
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
  payDateAnchor?: string,
): Date | null => {
  const today = startOfDay(now)
  const anchorDate = resolveCadenceAnchorDate(createdAt, payDateAnchor)

  if (cadence === 'one_time') {
    const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)
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
    const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)
    return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
  }

  const cycleMonths = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
  const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)

  return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
}

const resolveCardPaymentPlan = (args: {
  statementBalance: number
  dueBalance: number
  interestAmount: number
  minimumPayment: number
  minimumPaymentType?: CardMinimumPaymentType
  minimumPaymentPercent?: number
  extraPayment?: number
}) => {
  const minimumPaymentType = normalizeCardMinimumPaymentType(args.minimumPaymentType)
  const minimumPayment = finiteOrZero(args.minimumPayment)
  const minimumPaymentPercent = clampPercent(finiteOrZero(args.minimumPaymentPercent))
  const extraPayment = finiteOrZero(args.extraPayment)

  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? args.statementBalance * (minimumPaymentPercent / 100) + args.interestAmount
      : minimumPayment
  const minimumDue = Math.min(args.dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(args.dueBalance, minimumDue + extraPayment)

  return {
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    minimumDue,
    plannedPayment,
  }
}

const getCardWorkingBalances = (card: CardDoc) => {
  const statementBalance = Math.max(finiteOrZero(card.statementBalance ?? card.usedLimit), 0)
  const pendingCharges = Math.max(finiteOrZero(card.pendingCharges), 0)

  return {
    statementBalance,
    pendingCharges,
  }
}

const buildCardBalancePatch = (statementBalance: number, pendingCharges: number) => ({
  statementBalance: roundCurrency(Math.max(statementBalance, 0)),
  pendingCharges: roundCurrency(Math.max(pendingCharges, 0)),
  usedLimit: roundCurrency(Math.max(statementBalance + pendingCharges, 0)),
})

const applyChargeToCard = (card: CardDoc, amount: number) => {
  const balances = getCardWorkingBalances(card)
  return buildCardBalancePatch(balances.statementBalance, balances.pendingCharges + amount)
}

const applyPaymentToCard = (card: CardDoc, amount: number) => {
  const balances = getCardWorkingBalances(card)
  let remaining = Math.max(amount, 0)

  const statementPayment = Math.min(balances.statementBalance, remaining)
  const nextStatement = balances.statementBalance - statementPayment
  remaining -= statementPayment

  const pendingPayment = Math.min(balances.pendingCharges, remaining)
  const nextPending = balances.pendingCharges - pendingPayment
  remaining -= pendingPayment

  const appliedAmount = statementPayment + pendingPayment

  return {
    ...buildCardBalancePatch(nextStatement, nextPending),
    appliedAmount: roundCurrency(appliedAmount),
    unappliedAmount: roundCurrency(Math.max(remaining, 0)),
  }
}

const applyTransferIntoCard = (card: CardDoc, amount: number) => {
  const balances = getCardWorkingBalances(card)
  return buildCardBalancePatch(balances.statementBalance + amount, balances.pendingCharges)
}

const applyCardMonthlyLifecycle = (card: CardDoc, cycles: number) => {
  let balance = finiteOrZero(card.usedLimit)
  let statementBalance = finiteOrZero(card.statementBalance ?? card.usedLimit)
  let pendingCharges = finiteOrZero(card.pendingCharges)
  const spendPerMonth = finiteOrZero(card.spendPerMonth)
  const minimumPayment = finiteOrZero(card.minimumPayment)
  const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
  const minimumPaymentPercent = clampPercent(finiteOrZero(card.minimumPaymentPercent))
  const extraPayment = finiteOrZero(card.extraPayment)
  const apr = finiteOrZero(card.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  let interestAccrued = 0
  let paymentsApplied = 0
  let spendAdded = 0
  let latestStatementBalance = statementBalance

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const interest = statementBalance * monthlyRate
    interestAccrued += interest
    const dueBalance = statementBalance + interest
    latestStatementBalance = dueBalance
    const paymentPlan = resolveCardPaymentPlan({
      statementBalance,
      dueBalance,
      interestAmount: interest,
      minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
    })
    const payment = paymentPlan.plannedPayment
    const carriedAfterDue = dueBalance - payment
    paymentsApplied += payment

    pendingCharges += spendPerMonth
    spendAdded += spendPerMonth

    statementBalance = carriedAfterDue + pendingCharges
    balance = statementBalance
    pendingCharges = 0
  }

  return {
    balance: roundCurrency(Math.max(balance, 0)),
    statementBalance: roundCurrency(Math.max(statementBalance, 0)),
    pendingCharges: roundCurrency(Math.max(pendingCharges, 0)),
    dueBalance: roundCurrency(Math.max(latestStatementBalance, 0)),
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
    spendAdded: roundCurrency(spendAdded),
  }
}

const applyLoanMonthlyLifecycle = (loan: LoanDoc, cycles: number) => {
  let balance = finiteOrZero(loan.balance)
  const monthlyPayment = toMonthlyAmount(
    finiteOrZero(loan.minimumPayment),
    loan.cadence,
    loan.customInterval,
    loan.customUnit,
  )
  const apr = finiteOrZero(loan.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  let interestAccrued = 0
  let paymentsApplied = 0

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const interest = balance * monthlyRate
    balance += interest
    interestAccrued += interest
    const payment = Math.min(balance, monthlyPayment)
    balance -= payment
    paymentsApplied += payment
  }

  return {
    balance: roundCurrency(Math.max(balance, 0)),
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
  }
}

const estimateCardMonthlyPayment = (card: CardDoc) => {
  const statementBalance = finiteOrZero(card.statementBalance ?? card.usedLimit)
  const apr = finiteOrZero(card.interestRate)
  const interestAmount = statementBalance * (apr > 0 ? apr / 100 / 12 : 0)
  const dueBalance = statementBalance + interestAmount
  const paymentPlan = resolveCardPaymentPlan({
    statementBalance,
    dueBalance,
    interestAmount,
    minimumPayment: finiteOrZero(card.minimumPayment),
    minimumPaymentType: normalizeCardMinimumPaymentType(card.minimumPaymentType),
    minimumPaymentPercent: clampPercent(finiteOrZero(card.minimumPaymentPercent)),
    extraPayment: finiteOrZero(card.extraPayment),
  })

  return roundCurrency(paymentPlan.plannedPayment)
}

type CardCycleAggregate = {
  updatedCards: number
  cyclesApplied: number
  interestAccrued: number
  paymentsApplied: number
  spendAdded: number
}

type LoanCycleAggregate = {
  updatedLoans: number
  cyclesApplied: number
  interestAccrued: number
  paymentsApplied: number
}

const runCardMonthlyCycleForUser = async (
  ctx: MutationCtx,
  userId: string,
  now: Date,
  cycleKey: string,
): Promise<CardCycleAggregate> => {
  const cards = await ctx.db
    .query('cards')
    .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
    .collect()

  let updatedCards = 0
  let cyclesApplied = 0
  let interestAccrued = 0
  let paymentsApplied = 0
  let spendAdded = 0

  for (const card of cards) {
    const cycleAnchor = typeof card.lastCycleAt === 'number' ? card.lastCycleAt : card.createdAt
    const cycles = countCompletedMonthlyCycles(cycleAnchor, now)

    if (cycles <= 0) {
      continue
    }

    const summary = applyCardMonthlyLifecycle(card, cycles)
    const newCycleDate = addCalendarMonthsKeepingDay(startOfDay(new Date(cycleAnchor)), cycles).getTime()

    await ctx.db.patch(card._id, {
      usedLimit: summary.balance,
      statementBalance: summary.statementBalance,
      pendingCharges: summary.pendingCharges,
      lastCycleAt: newCycleDate,
    })

    const cardToken = sanitizeLedgerToken(card.name)
    const liabilityAccount = `LIABILITY:CARD:${cardToken}`
    const cashAccount = 'ASSET:CASH:UNASSIGNED'

    if (summary.spendAdded > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_card_spend',
        description: `Card monthly spend: ${card.name}`,
        occurredAt: newCycleDate,
        referenceType: 'card',
        referenceId: String(card._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: `EXPENSE:CARD_SPEND:${cardToken}`,
            amount: summary.spendAdded,
          },
          {
            lineType: 'credit',
            accountCode: liabilityAccount,
            amount: summary.spendAdded,
          },
        ],
      })
    }

    if (summary.interestAccrued > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_card_interest',
        description: `Card monthly interest: ${card.name}`,
        occurredAt: newCycleDate,
        referenceType: 'card',
        referenceId: String(card._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: `EXPENSE:CARD_INTEREST:${cardToken}`,
            amount: summary.interestAccrued,
          },
          {
            lineType: 'credit',
            accountCode: liabilityAccount,
            amount: summary.interestAccrued,
          },
        ],
      })
    }

    if (summary.paymentsApplied > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_card_payment',
        description: `Card monthly payment: ${card.name}`,
        occurredAt: newCycleDate,
        referenceType: 'card',
        referenceId: String(card._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: liabilityAccount,
            amount: summary.paymentsApplied,
          },
          {
            lineType: 'credit',
            accountCode: cashAccount,
            amount: summary.paymentsApplied,
          },
        ],
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId,
      entityType: 'card',
      entityId: String(card._id),
      action: 'monthly_cycle_applied',
      metadata: {
        cycleKey,
        cyclesApplied: cycles,
        summary,
      },
    })

    updatedCards += 1
    cyclesApplied += cycles
    interestAccrued += summary.interestAccrued
    paymentsApplied += summary.paymentsApplied
    spendAdded += summary.spendAdded
  }

  return {
    updatedCards,
    cyclesApplied,
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
    spendAdded: roundCurrency(spendAdded),
  }
}

const runLoanMonthlyCycleForUser = async (
  ctx: MutationCtx,
  userId: string,
  now: Date,
  cycleKey: string,
): Promise<LoanCycleAggregate> => {
  const loans = await ctx.db
    .query('loans')
    .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
    .collect()

  let updatedLoans = 0
  let cyclesApplied = 0
  let interestAccrued = 0
  let paymentsApplied = 0

  for (const loan of loans) {
    const cycleAnchor = typeof loan.lastCycleAt === 'number' ? loan.lastCycleAt : loan.createdAt
    const cycles = countCompletedMonthlyCycles(cycleAnchor, now)

    if (cycles <= 0) {
      continue
    }

    const summary = applyLoanMonthlyLifecycle(loan, cycles)
    const newCycleDate = addCalendarMonthsKeepingDay(startOfDay(new Date(cycleAnchor)), cycles).getTime()

    await ctx.db.patch(loan._id, {
      balance: summary.balance,
      lastCycleAt: newCycleDate,
    })

    const loanToken = sanitizeLedgerToken(loan.name)
    const liabilityAccount = `LIABILITY:LOAN:${loanToken}`
    const cashAccount = 'ASSET:CASH:UNASSIGNED'

    if (summary.interestAccrued > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_loan_interest',
        description: `Loan monthly interest: ${loan.name}`,
        occurredAt: newCycleDate,
        referenceType: 'loan',
        referenceId: String(loan._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: `EXPENSE:LOAN_INTEREST:${loanToken}`,
            amount: summary.interestAccrued,
          },
          {
            lineType: 'credit',
            accountCode: liabilityAccount,
            amount: summary.interestAccrued,
          },
        ],
      })
    }

    if (summary.paymentsApplied > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_loan_payment',
        description: `Loan monthly payment: ${loan.name}`,
        occurredAt: newCycleDate,
        referenceType: 'loan',
        referenceId: String(loan._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: liabilityAccount,
            amount: summary.paymentsApplied,
          },
          {
            lineType: 'credit',
            accountCode: cashAccount,
            amount: summary.paymentsApplied,
          },
        ],
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId,
      entityType: 'loan',
      entityId: String(loan._id),
      action: 'monthly_cycle_applied',
      metadata: {
        cycleKey,
        cyclesApplied: cycles,
        summary,
      },
    })

    updatedLoans += 1
    cyclesApplied += cycles
    interestAccrued += summary.interestAccrued
    paymentsApplied += summary.paymentsApplied
  }

  return {
    updatedLoans,
    cyclesApplied,
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
  }
}

const buildUpcomingCashEvents = (
  incomes: IncomeDoc[],
  bills: BillDoc[],
  cards: CardDoc[],
  loans: LoanDoc[],
  now: Date,
) => {
  const horizonDays = 14
  const events: Array<{
    id: string
    label: string
    type: 'income' | 'bill' | 'card' | 'loan'
    date: string
    amount: number
    daysAway: number
    cadence: Cadence
    customInterval?: number
    customUnit?: CustomCadenceUnit
  }> = []

  incomes.forEach((entry) => {
    const nextDate = nextDateForCadence(
      entry.cadence,
      entry.createdAt,
      now,
      entry.receivedDay,
      entry.customInterval,
      entry.customUnit,
      entry.payDateAnchor,
    )

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    events.push({
      id: `income-${entry._id}`,
      label: entry.source,
      type: 'income',
      date: nextDate.toISOString().slice(0, 10),
      amount: resolveIncomeNetAmount(entry),
      daysAway,
      cadence: entry.cadence,
      customInterval: entry.customInterval,
      customUnit: entry.customUnit,
    })
  })

  bills.forEach((entry) => {
    const nextDate = nextDateForCadence(
      entry.cadence,
      entry.createdAt,
      now,
      entry.dueDay,
      entry.customInterval,
      entry.customUnit,
    )

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
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
      customInterval: entry.customInterval,
      customUnit: entry.customUnit,
    })
  })

  cards.forEach((entry) => {
    const nextDate = nextDateForCadence('monthly', entry.createdAt, now, entry.dueDay ?? 21)

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    const projectedDue = estimateCardMonthlyPayment(entry)
    if (projectedDue <= 0) {
      return
    }

    events.push({
      id: `card-${entry._id}`,
      label: `${entry.name} due`,
      type: 'card',
      date: nextDate.toISOString().slice(0, 10),
      amount: -projectedDue,
      daysAway,
      cadence: 'monthly',
    })
  })

  loans.forEach((entry) => {
    const nextDate = nextDateForCadence(
      entry.cadence,
      entry.createdAt,
      now,
      entry.dueDay,
      entry.customInterval,
      entry.customUnit,
    )

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    events.push({
      id: `loan-${entry._id}`,
      label: `${entry.name} payment`,
      type: 'loan',
      date: nextDate.toISOString().slice(0, 10),
      amount: -(finiteOrZero(entry.minimumPayment) + finiteOrZero(entry.subscriptionCost)),
      daysAway,
      cadence: entry.cadence,
      customInterval: entry.customInterval,
      customUnit: entry.customUnit,
    })
  })

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.daysAway - b.daysAway || a.amount - b.amount)
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

const getUserPreference = async (ctx: QueryCtx, userId: string) => {
  const existing = await ctx.db
    .query('financePreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()

  if (!existing) {
    return defaultPreference
  }

  const currency = existing.currency.toUpperCase()

  return {
    currency: validateCurrencyCode(currency) ? currency : defaultPreference.currency,
    locale: validateLocale(existing.locale) ? existing.locale : defaultPreference.locale,
  }
}

function ensureOwned<T extends { userId: string }>(
  record: T | null,
  expectedUserId: string,
  missingError: string,
): asserts record is T {
  if (!record || record.userId !== expectedUserId) {
    throw new Error(missingError)
  }
}

const isPurchasePosted = (status?: ReconciliationStatus) => {
  if (!status) {
    return true
  }
  return status !== 'pending'
}

const resolvePurchaseReconciliation = (args: {
  purchaseDate: string
  requestedStatus?: ReconciliationStatus
  requestedStatementMonth?: string
  existing?: Doc<'purchases'>
  now: number
}) => {
  const status = args.requestedStatus ?? args.existing?.reconciliationStatus ?? 'posted'
  const statementMonth = args.requestedStatementMonth ?? args.existing?.statementMonth ?? args.purchaseDate.slice(0, 7)
  validateStatementMonth(statementMonth, 'Statement month')

  if (status === 'pending') {
    return {
      reconciliationStatus: status,
      statementMonth,
      postedAt: undefined,
      reconciledAt: undefined,
    }
  }

  if (status === 'posted') {
    return {
      reconciliationStatus: status,
      statementMonth,
      postedAt: args.existing?.postedAt ?? args.now,
      reconciledAt: undefined,
    }
  }

  return {
    reconciliationStatus: status,
    statementMonth,
    postedAt: args.existing?.postedAt ?? args.now,
    reconciledAt: args.existing?.reconciledAt ?? args.now,
  }
}

type LedgerLineDraft = {
  lineType: LedgerLineType
  accountCode: string
  amount: number
}

const insertLedgerEntry = async (ctx: MutationCtx, args: {
  userId: string
  entryType: LedgerEntryType
  description: string
  occurredAt: number
  referenceType?: string
  referenceId?: string
  cycleKey?: string
  lines: LedgerLineDraft[]
}) => {
  if (args.lines.length < 2) {
    throw new Error('Ledger entries require at least two lines.')
  }

  const debitTotal = args.lines
    .filter((line) => line.lineType === 'debit')
    .reduce((sum, line) => sum + line.amount, 0)
  const creditTotal = args.lines
    .filter((line) => line.lineType === 'credit')
    .reduce((sum, line) => sum + line.amount, 0)

  if (roundCurrency(debitTotal) !== roundCurrency(creditTotal)) {
    throw new Error('Ledger entry is imbalanced.')
  }

  const entryId = await ctx.db.insert('ledgerEntries', {
    userId: args.userId,
    entryType: args.entryType,
    description: args.description,
    occurredAt: args.occurredAt,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    cycleKey: args.cycleKey,
    createdAt: Date.now(),
  })

  for (const line of args.lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw new Error('Ledger line amount must be greater than 0.')
    }

    await ctx.db.insert('ledgerLines', {
      userId: args.userId,
      entryId,
      lineType: line.lineType,
      accountCode: line.accountCode,
      amount: roundCurrency(line.amount),
      createdAt: Date.now(),
    })
  }
}

const recordFinanceAuditEvent = async (ctx: MutationCtx, args: {
  userId: string
  entityType: string
  entityId: string
  action: string
  before?: unknown
  after?: unknown
  metadata?: unknown
}) => {
  await ctx.db.insert('financeAuditEvents', {
    userId: args.userId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    beforeJson: args.before === undefined ? undefined : stringifyForAudit(args.before),
    afterJson: args.after === undefined ? undefined : stringifyForAudit(args.after),
    metadataJson: args.metadata === undefined ? undefined : stringifyForAudit(args.metadata),
    createdAt: Date.now(),
  })
}

const resolveIncomeDestinationAccountId = async (
  ctx: MutationCtx,
  userId: string,
  destinationAccountId: Id<'accounts'> | undefined,
) => {
  if (!destinationAccountId) {
    return undefined
  }

  const destinationAccount = await ctx.db.get(destinationAccountId)
  ensureOwned(destinationAccount, userId, 'Destination account not found.')
  return destinationAccountId
}

const resolveBillLinkedAccountId = async (
  ctx: MutationCtx,
  userId: string,
  linkedAccountId: Id<'accounts'> | undefined,
) => {
  if (!linkedAccountId) {
    return undefined
  }

  const linkedAccount = await ctx.db.get(linkedAccountId)
  ensureOwned(linkedAccount, userId, 'Linked bill account not found.')
  return linkedAccountId
}

const getPurchaseExpenseAccountCode = (category: string) => `EXPENSE:PURCHASE:${sanitizeLedgerToken(category)}`

const recordPurchaseLedger = async (ctx: MutationCtx, args: {
  userId: string
  entryType: 'purchase' | 'purchase_reversal'
  item: string
  amount: number
  category: string
  purchaseDate: string
  purchaseId: string
}) => {
  const amount = roundCurrency(Math.abs(args.amount))
  if (amount <= 0) {
    return
  }

  const occurredAt = new Date(`${args.purchaseDate}T00:00:00`).getTime()
  const expenseAccount = getPurchaseExpenseAccountCode(args.category)
  const cashAccount = 'ASSET:CASH:UNASSIGNED'
  const isReversal = args.entryType === 'purchase_reversal'

  await insertLedgerEntry(ctx, {
    userId: args.userId,
    entryType: args.entryType,
    description: `${isReversal ? 'Reverse purchase' : 'Purchase'}: ${args.item}`,
    occurredAt,
    referenceType: 'purchase',
    referenceId: args.purchaseId,
    lines: [
      {
        lineType: isReversal ? 'credit' : 'debit',
        accountCode: expenseAccount,
        amount,
      },
      {
        lineType: isReversal ? 'debit' : 'credit',
        accountCode: cashAccount,
        amount,
      },
    ],
  })
}

const computeMonthCloseSnapshotSummary = async (ctx: MutationCtx, userId: string, now: Date) => {
  const [incomes, bills, cards, loans, purchases, accounts] = await Promise.all([
    ctx.db
      .query('incomes')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('bills')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('cards')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('loans')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('purchases')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('accounts')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
  ])

  const monthlyIncome = incomes.reduce(
    (sum, entry) =>
      sum + toMonthlyAmount(resolveIncomeNetAmount(entry), entry.cadence, entry.customInterval, entry.customUnit),
    0,
  )
  const monthlyBills = bills.reduce(
    (sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit),
    0,
  )
  const monthlyCardSpend = cards.reduce((sum, entry) => sum + estimateCardMonthlyPayment(entry), 0)
  const monthlyLoanBasePayments = loans.reduce(
    (sum, entry) =>
      sum + toMonthlyAmount(finiteOrZero(entry.minimumPayment), entry.cadence, entry.customInterval, entry.customUnit),
    0,
  )
  const monthlyLoanSubscriptionCosts = loans.reduce((sum, entry) => sum + finiteOrZero(entry.subscriptionCost), 0)
  const monthlyCommitments = monthlyBills + monthlyCardSpend + monthlyLoanBasePayments + monthlyLoanSubscriptionCosts

  const cardUsedTotal = cards.reduce((sum, entry) => sum + finiteOrZero(entry.usedLimit), 0)
  const totalLoanBalance = loans.reduce((sum, entry) => sum + finiteOrZero(entry.balance), 0)
  const accountDebts = accounts.reduce((sum, entry) => {
    if (entry.type === 'debt') {
      return sum + Math.abs(entry.balance)
    }
    return entry.balance < 0 ? sum + Math.abs(entry.balance) : sum
  }, 0)
  const totalLiabilities = accountDebts + cardUsedTotal + totalLoanBalance

  const totalAssets = accounts.reduce((sum, entry) => {
    if (entry.type === 'debt') {
      return sum
    }
    return sum + Math.max(entry.balance, 0)
  }, 0)
  const assetsByType = accounts.reduce(
    (acc, entry) => {
      const positiveBalance = Math.max(entry.balance, 0)
      if (entry.type === 'checking') acc.checking += positiveBalance
      if (entry.type === 'savings') acc.savings += positiveBalance
      if (entry.type === 'investment') acc.investment += positiveBalance
      if (entry.type === 'cash') acc.cash += positiveBalance
      return acc
    },
    { checking: 0, savings: 0, investment: 0, cash: 0 },
  )

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const purchasesThisMonth = purchases
    .filter((entry) => entry.purchaseDate.startsWith(monthKey))
    .reduce((sum, entry) => sum + entry.amount, 0)

  const netWorth = totalAssets + monthlyIncome - totalLiabilities - monthlyCommitments - purchasesThisMonth
  const liquidReserves = accounts.reduce((sum, entry) => {
    if (!entry.liquid) {
      return sum
    }
    return sum + Math.max(entry.balance, 0)
  }, 0)
  const runwayAvailablePool = Math.max(liquidReserves + totalAssets + monthlyIncome, 0)
  const runwayMonthlyPressure = monthlyCommitments + totalLiabilities + purchasesThisMonth
  const runwayMonths = runwayMonthlyPressure > 0 ? runwayAvailablePool / runwayMonthlyPressure : runwayAvailablePool > 0 ? 99 : 0

  return {
    monthlyIncome: roundCurrency(monthlyIncome),
    monthlyCommitments: roundCurrency(monthlyCommitments),
    monthlyBills: roundCurrency(monthlyBills),
    monthlyCardSpend: roundCurrency(monthlyCardSpend),
    monthlyLoanBasePayments: roundCurrency(monthlyLoanBasePayments),
    monthlyLoanSubscriptionCosts: roundCurrency(monthlyLoanSubscriptionCosts),
    assetsChecking: roundCurrency(assetsByType.checking),
    assetsSavings: roundCurrency(assetsByType.savings),
    assetsInvestment: roundCurrency(assetsByType.investment),
    assetsCash: roundCurrency(assetsByType.cash),
    liabilitiesAccountDebt: roundCurrency(accountDebts),
    liabilitiesCards: roundCurrency(cardUsedTotal),
    liabilitiesLoans: roundCurrency(totalLoanBalance),
    totalLiabilities: roundCurrency(totalLiabilities),
    netWorth: roundCurrency(netWorth),
    runwayMonths: roundCurrency(runwayMonths),
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
          preference: defaultPreference,
          incomes: [],
          incomePaymentChecks: [],
          incomeChangeEvents: [],
          bills: [],
          billPaymentChecks: [],
          subscriptionPriceChanges: [],
          cards: [],
          loans: [],
          purchases: [],
          accounts: [],
          goals: [],
          cycleAuditLogs: [],
          monthlyCycleRuns: [],
          monthCloseSnapshots: [],
          financeAuditEvents: [],
          ledgerEntries: [],
          topCategories: [],
          upcomingCashEvents: [],
          insights: [],
          summary: defaultSummary,
        },
      }
    }

    const [
      preference,
      incomes,
      incomePaymentChecks,
      incomeChangeEvents,
      bills,
      billPaymentChecks,
      subscriptionPriceChanges,
      cards,
      loans,
      purchases,
      accounts,
      goals,
      cycleAuditLogs,
      monthlyCycleRuns,
      monthCloseSnapshots,
      financeAuditEvents,
      ledgerEntries,
    ] = await Promise.all([
      getUserPreference(ctx, identity.subject),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('incomePaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(240),
      ctx.db
        .query('incomeChangeEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(320),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('billPaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(360),
      ctx.db
        .query('subscriptionPriceChanges')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(720),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('loans')
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
      ctx.db
        .query('cycleAuditLogs')
        .withIndex('by_userId_ranAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(20),
      ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(20),
      ctx.db
        .query('monthCloseSnapshots')
        .withIndex('by_userId_cycleKey', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(12),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(30),
      ctx.db
        .query('ledgerEntries')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(30),
    ])

    const monthlyIncome = incomes.reduce(
      (sum, entry) =>
        sum + toMonthlyAmount(resolveIncomeNetAmount(entry), entry.cadence, entry.customInterval, entry.customUnit),
      0,
    )
    const monthlyBills = bills.reduce(
      (sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit),
      0,
    )
    const monthlyLoanBasePayments = loans.reduce(
      (sum, entry) =>
        sum + toMonthlyAmount(finiteOrZero(entry.minimumPayment), entry.cadence, entry.customInterval, entry.customUnit),
      0,
    )
    const monthlyLoanSubscriptionCosts = loans.reduce((sum, entry) => sum + finiteOrZero(entry.subscriptionCost), 0)
    const monthlyLoanPayments = monthlyLoanBasePayments + monthlyLoanSubscriptionCosts
    const monthlyCardSpend = cards.reduce((sum, entry) => sum + estimateCardMonthlyPayment(entry), 0)
    const monthlyCommitments = monthlyBills + monthlyCardSpend + monthlyLoanPayments

    const cardLimitTotal = cards.reduce((sum, entry) => sum + entry.creditLimit, 0)
    const cardUsedTotal = cards.reduce((sum, entry) => sum + entry.usedLimit, 0)
    const totalLoanBalance = loans.reduce((sum, entry) => sum + finiteOrZero(entry.balance), 0)
    const cardUtilizationPercent = cardLimitTotal > 0 ? (cardUsedTotal / cardLimitTotal) * 100 : 0

    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthPurchases = purchases.filter((entry) => entry.purchaseDate.startsWith(monthKey))
    const purchasesThisMonth = monthPurchases.reduce((sum, entry) => sum + entry.amount, 0)
    const pendingPurchases = purchases.filter((entry) => entry.reconciliationStatus === 'pending').length
    const reconciledPurchases = purchases.filter((entry) => entry.reconciliationStatus === 'reconciled').length
    const postedPurchases = purchases.length - pendingPurchases

    const projectedMonthlyNet = monthlyIncome - monthlyCommitments - totalLoanBalance
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

    const totalLiabilities = accountDebts + cardUsedTotal + totalLoanBalance
    const netWorth = totalAssets + monthlyIncome - totalLiabilities - monthlyCommitments - purchasesThisMonth

    const liquidReserves = accounts.reduce((sum, entry) => {
      if (!entry.liquid) {
        return sum
      }
      return sum + Math.max(entry.balance, 0)
    }, 0)

    const runwayAvailablePool = Math.max(liquidReserves + totalAssets + monthlyIncome, 0)
    const runwayMonthlyPressure = monthlyCommitments + totalLiabilities + purchasesThisMonth
    const runwayMonths = runwayMonthlyPressure > 0 ? runwayAvailablePool / runwayMonthlyPressure : runwayAvailablePool > 0 ? 99 : 0

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

    const upcomingCashEvents = buildUpcomingCashEvents(incomes, bills, cards, loans, now)

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
      ...incomePaymentChecks.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...incomeChangeEvents.map((entry) => entry.createdAt),
      ...bills.map((entry) => entry.createdAt),
      ...billPaymentChecks.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...subscriptionPriceChanges.map((entry) => entry.createdAt),
      ...cards.map((entry) => entry.createdAt),
      ...loans.map((entry) => entry.createdAt),
      ...purchases.map((entry) => entry.createdAt),
      ...accounts.map((entry) => entry.createdAt),
      ...goals.map((entry) => entry.createdAt),
      ...cycleAuditLogs.map((entry) => entry.createdAt),
      ...monthlyCycleRuns.map((entry) => entry.createdAt),
      ...monthCloseSnapshots.map((entry) => entry.createdAt),
      ...financeAuditEvents.map((entry) => entry.createdAt),
      ...ledgerEntries.map((entry) => entry.createdAt),
    ]

    const updatedAt = timestamps.length > 0 ? Math.max(...timestamps) : Date.now()

    return {
      isAuthenticated: true,
      updatedAt,
      data: {
        preference,
        incomes,
        incomePaymentChecks,
        incomeChangeEvents,
        bills,
        billPaymentChecks,
        subscriptionPriceChanges,
        cards,
        loans,
        purchases,
        accounts,
        goals,
        cycleAuditLogs,
        monthlyCycleRuns,
        monthCloseSnapshots,
        financeAuditEvents,
        ledgerEntries,
        topCategories,
        upcomingCashEvents,
        insights,
        summary: {
          monthlyIncome,
          monthlyBills,
          monthlyCardSpend,
          monthlyLoanPayments,
          monthlyLoanBasePayments,
          monthlyLoanSubscriptionCosts,
          monthlyCommitments,
          runwayAvailablePool,
          runwayMonthlyPressure,
          cardLimitTotal,
          cardUsedTotal,
          totalLoanBalance,
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
          pendingPurchases,
          postedPurchases,
          reconciledPurchases,
        },
      },
    }
  },
})

export const upsertFinancePreference = mutation({
  args: {
    currency: v.string(),
    locale: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const currency = args.currency.trim().toUpperCase()
    const locale = args.locale.trim()

    if (!validateCurrencyCode(currency)) {
      throw new Error('Currency must be a valid ISO 4217 code supported by the runtime.')
    }

    if (!validateLocale(locale)) {
      throw new Error('Locale is not valid.')
    }

    const existing = await ctx.db
      .query('financePreferences')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        currency,
        locale,
        updatedAt: Date.now(),
      })
      return
    }

    await ctx.db.insert('financePreferences', {
      userId: identity.subject,
      currency,
      locale,
      updatedAt: Date.now(),
    })
  },
})

export const addIncome = mutation({
  args: {
    source: v.string(),
    amount: v.number(),
    actualAmount: v.optional(v.number()),
    grossAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    nationalInsuranceAmount: v.optional(v.number()),
    pensionAmount: v.optional(v.number()),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    forecastSmoothingEnabled: v.optional(v.boolean()),
    forecastSmoothingMonths: v.optional(v.number()),
    destinationAccountId: v.optional(v.id('accounts')),
    receivedDay: v.optional(v.number()),
    payDateAnchor: v.optional(v.string()),
    employerNote: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.source, 'Income source')
    validateFinite(args.amount, 'Income net amount')
    validateOptionalText(args.employerNote, 'Employer note', 800)
    validateOptionalText(args.notes, 'Notes', 2000)
    if (args.actualAmount !== undefined) {
      validateNonNegative(args.actualAmount, 'Income actual paid amount')
    }
    if (args.grossAmount !== undefined) {
      validateNonNegative(args.grossAmount, 'Income gross amount')
    }
    if (args.taxAmount !== undefined) {
      validateNonNegative(args.taxAmount, 'Income tax deduction')
    }
    if (args.nationalInsuranceAmount !== undefined) {
      validateNonNegative(args.nationalInsuranceAmount, 'Income NI deduction')
    }
    if (args.pensionAmount !== undefined) {
      validateNonNegative(args.pensionAmount, 'Income pension deduction')
    }

    if (args.receivedDay !== undefined && (args.receivedDay < 1 || args.receivedDay > 31)) {
      throw new Error('Received day must be between 1 and 31.')
    }
    if (args.payDateAnchor !== undefined) {
      validateIsoDate(args.payDateAnchor, 'Pay date anchor')
    }

    const deductionTotal = computeIncomeDeductionsTotal(args)
    if (deductionTotal > 0.000001 && args.grossAmount === undefined) {
      throw new Error('Gross amount is required when adding income deductions.')
    }

    if (args.grossAmount !== undefined && deductionTotal > args.grossAmount + 0.000001) {
      throw new Error('Income deductions cannot exceed gross amount.')
    }

    const resolvedNetAmount =
      args.grossAmount !== undefined || deductionTotal > 0
        ? Math.max(args.grossAmount ?? 0 - deductionTotal, 0)
        : Math.max(args.amount, 0)
    validatePositive(resolvedNetAmount, 'Income net amount')
    const payDateAnchor = args.payDateAnchor?.trim() || undefined
    const employerNote = args.employerNote?.trim() || undefined
    const forecastSmoothing = normalizeIncomeForecastSmoothing(
      args.forecastSmoothingEnabled,
      args.forecastSmoothingMonths ?? 6,
    )
    const destinationAccountId = await resolveIncomeDestinationAccountId(
      ctx,
      identity.subject,
      args.destinationAccountId,
    )

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)

    const createdIncomeId = await ctx.db.insert('incomes', {
      userId: identity.subject,
      source: args.source.trim(),
      amount: roundCurrency(resolvedNetAmount),
      actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
      grossAmount: args.grossAmount,
      taxAmount: args.taxAmount,
      nationalInsuranceAmount: args.nationalInsuranceAmount,
      pensionAmount: args.pensionAmount,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
      forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
      destinationAccountId,
      receivedDay: args.receivedDay,
      payDateAnchor,
      employerNote,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(createdIncomeId),
      action: 'created',
      after: {
        source: args.source.trim(),
        amount: roundCurrency(resolvedNetAmount),
        actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
        grossAmount: args.grossAmount,
        taxAmount: args.taxAmount,
        nationalInsuranceAmount: args.nationalInsuranceAmount,
        pensionAmount: args.pensionAmount,
        cadence: args.cadence,
        forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
        forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
        destinationAccountId: destinationAccountId ? String(destinationAccountId) : undefined,
        payDateAnchor,
        employerNote,
      },
    })
  },
})

export const updateIncome = mutation({
  args: {
    id: v.id('incomes'),
    source: v.string(),
    amount: v.number(),
    actualAmount: v.optional(v.number()),
    grossAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    nationalInsuranceAmount: v.optional(v.number()),
    pensionAmount: v.optional(v.number()),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    forecastSmoothingEnabled: v.optional(v.boolean()),
    forecastSmoothingMonths: v.optional(v.number()),
    destinationAccountId: v.optional(v.id('accounts')),
    receivedDay: v.optional(v.number()),
    payDateAnchor: v.optional(v.string()),
    employerNote: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.source, 'Income source')
    validateFinite(args.amount, 'Income net amount')
    validateOptionalText(args.employerNote, 'Employer note', 800)
    validateOptionalText(args.notes, 'Notes', 2000)
    if (args.actualAmount !== undefined) {
      validateNonNegative(args.actualAmount, 'Income actual paid amount')
    }
    if (args.grossAmount !== undefined) {
      validateNonNegative(args.grossAmount, 'Income gross amount')
    }
    if (args.taxAmount !== undefined) {
      validateNonNegative(args.taxAmount, 'Income tax deduction')
    }
    if (args.nationalInsuranceAmount !== undefined) {
      validateNonNegative(args.nationalInsuranceAmount, 'Income NI deduction')
    }
    if (args.pensionAmount !== undefined) {
      validateNonNegative(args.pensionAmount, 'Income pension deduction')
    }

    if (args.receivedDay !== undefined && (args.receivedDay < 1 || args.receivedDay > 31)) {
      throw new Error('Received day must be between 1 and 31.')
    }
    if (args.payDateAnchor !== undefined) {
      validateIsoDate(args.payDateAnchor, 'Pay date anchor')
    }

    const deductionTotal = computeIncomeDeductionsTotal(args)
    if (deductionTotal > 0.000001 && args.grossAmount === undefined) {
      throw new Error('Gross amount is required when adding income deductions.')
    }

    if (args.grossAmount !== undefined && deductionTotal > args.grossAmount + 0.000001) {
      throw new Error('Income deductions cannot exceed gross amount.')
    }

    const resolvedNetAmount =
      args.grossAmount !== undefined || deductionTotal > 0
        ? Math.max(args.grossAmount ?? 0 - deductionTotal, 0)
        : Math.max(args.amount, 0)
    validatePositive(resolvedNetAmount, 'Income net amount')
    const payDateAnchor = args.payDateAnchor?.trim() || undefined
    const employerNote = args.employerNote?.trim() || undefined
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income record not found.')
    const forecastSmoothing = normalizeIncomeForecastSmoothing(
      args.forecastSmoothingEnabled ?? existing.forecastSmoothingEnabled ?? false,
      args.forecastSmoothingMonths ?? existing.forecastSmoothingMonths ?? 6,
    )
    const destinationAccountId = await resolveIncomeDestinationAccountId(
      ctx,
      identity.subject,
      args.destinationAccountId,
    )

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)

    await ctx.db.patch(args.id, {
      source: args.source.trim(),
      amount: roundCurrency(resolvedNetAmount),
      actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
      grossAmount: args.grossAmount,
      taxAmount: args.taxAmount,
      nationalInsuranceAmount: args.nationalInsuranceAmount,
      pensionAmount: args.pensionAmount,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
      forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
      destinationAccountId,
      receivedDay: args.receivedDay,
      payDateAnchor,
      employerNote,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(args.id),
      action: 'updated',
      before: {
        source: existing.source,
        amount: existing.amount,
        actualAmount: existing.actualAmount,
        grossAmount: existing.grossAmount,
        taxAmount: existing.taxAmount,
        nationalInsuranceAmount: existing.nationalInsuranceAmount,
        pensionAmount: existing.pensionAmount,
        cadence: existing.cadence,
        forecastSmoothingEnabled: existing.forecastSmoothingEnabled ?? false,
        forecastSmoothingMonths: existing.forecastSmoothingMonths,
        destinationAccountId: existing.destinationAccountId ? String(existing.destinationAccountId) : undefined,
        payDateAnchor: existing.payDateAnchor,
        employerNote: existing.employerNote,
      },
      after: {
        source: args.source.trim(),
        amount: roundCurrency(resolvedNetAmount),
        actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
        grossAmount: args.grossAmount,
        taxAmount: args.taxAmount,
        nationalInsuranceAmount: args.nationalInsuranceAmount,
        pensionAmount: args.pensionAmount,
        cadence: args.cadence,
        forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
        forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
        destinationAccountId: destinationAccountId ? String(destinationAccountId) : undefined,
        payDateAnchor,
        employerNote,
      },
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
    ensureOwned(existing, identity.subject, 'Income record not found.')

    const existingPaymentChecks = await ctx.db
      .query('incomePaymentChecks')
      .withIndex('by_userId_incomeId_cycleMonth', (q) => q.eq('userId', identity.subject).eq('incomeId', args.id))
      .collect()

    const existingChangeEvents = await ctx.db
      .query('incomeChangeEvents')
      .withIndex('by_userId_incomeId_effectiveDate', (q) => q.eq('userId', identity.subject).eq('incomeId', args.id))
      .collect()

    await Promise.all(existingPaymentChecks.map((entry) => ctx.db.delete(entry._id)))
    await Promise.all(existingChangeEvents.map((entry) => ctx.db.delete(entry._id)))

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(args.id),
      action: 'removed',
      before: {
        source: existing.source,
        amount: existing.amount,
        cadence: existing.cadence,
        employerNote: existing.employerNote,
        removedPaymentChecks: existingPaymentChecks.length,
        removedChangeEvents: existingChangeEvents.length,
      },
    })
  },
})

export const addIncomeChangeEvent = mutation({
  args: {
    incomeId: v.id('incomes'),
    effectiveDate: v.string(),
    newAmount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateIsoDate(args.effectiveDate, 'Effective date')
    validatePositive(args.newAmount, 'New salary amount')
    validateOptionalText(args.note, 'Change note', 800)

    const todayIso = new Date().toISOString().slice(0, 10)
    if (args.effectiveDate > todayIso) {
      throw new Error('Effective date cannot be in the future.')
    }

    const income = await ctx.db.get(args.incomeId)
    ensureOwned(income, identity.subject, 'Income record not found.')

    const previousAmount = roundCurrency(resolveIncomeNetAmount(income))
    const newAmount = roundCurrency(args.newAmount)
    const deltaAmount = roundCurrency(newAmount - previousAmount)
    const direction = resolveIncomeChangeDirection(deltaAmount)

    const deductionTotal = computeIncomeDeductionsTotal(income)
    const hasBreakdown = finiteOrZero(income.grossAmount) > 0 || deductionTotal > 0

    await ctx.db.patch(args.incomeId, {
      amount: newAmount,
      grossAmount: hasBreakdown ? roundCurrency(newAmount + deductionTotal) : income.grossAmount,
    })

    const createdId = await ctx.db.insert('incomeChangeEvents', {
      userId: identity.subject,
      incomeId: args.incomeId,
      effectiveDate: args.effectiveDate,
      previousAmount,
      newAmount,
      deltaAmount,
      direction,
      note: args.note?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_change_event',
      entityId: String(createdId),
      action: 'created',
      after: {
        incomeId: String(args.incomeId),
        effectiveDate: args.effectiveDate,
        previousAmount,
        newAmount,
        deltaAmount,
        direction,
        note: args.note?.trim() || undefined,
      },
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(args.incomeId),
      action: 'change_tracked',
      metadata: {
        effectiveDate: args.effectiveDate,
        previousAmount,
        newAmount,
        deltaAmount,
        direction,
      },
    })

    return {
      id: createdId,
      direction,
      deltaAmount,
    }
  },
})

export const removeIncomeChangeEvent = mutation({
  args: {
    id: v.id('incomeChangeEvents'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income change event not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_change_event',
      entityId: String(args.id),
      action: 'removed',
      before: {
        incomeId: String(existing.incomeId),
        effectiveDate: existing.effectiveDate,
        previousAmount: existing.previousAmount,
        newAmount: existing.newAmount,
        deltaAmount: existing.deltaAmount,
        direction: existing.direction,
        note: existing.note,
      },
    })
  },
})

const upsertIncomePaymentCheckRecord = async (
  ctx: MutationCtx,
  args: {
    userId: string
    input: {
      incomeId: Id<'incomes'>
      cycleMonth: string
      status: IncomePaymentStatus
      receivedDay?: number
      receivedAmount?: number
      paymentReference?: string
      payslipReference?: string
      note?: string
    }
    metadata?: unknown
  },
) => {
  const cycleMonth = args.input.cycleMonth.trim()
  validateStatementMonth(cycleMonth, 'Cycle month')
  validateOptionalText(args.input.paymentReference, 'Payment reference', 120)
  validateOptionalText(args.input.payslipReference, 'Payslip reference', 120)
  validateOptionalText(args.input.note, 'Payment note', 800)

  if (args.input.receivedDay !== undefined) {
    validateDayOfMonth(args.input.receivedDay, 'Received day')
  }
  if (args.input.receivedAmount !== undefined) {
    validateNonNegative(args.input.receivedAmount, 'Received amount')
  }

  if (args.input.status === 'missed' && (args.input.receivedDay !== undefined || args.input.receivedAmount !== undefined)) {
    throw new Error('Missed payments cannot include received day or amount.')
  }

  const income = await ctx.db.get(args.input.incomeId)
  ensureOwned(income, args.userId, 'Income record not found.')

  const expectedDay = income.receivedDay
  const normalizedStatus: IncomePaymentStatus =
    args.input.status === 'on_time' &&
    expectedDay !== undefined &&
    args.input.receivedDay !== undefined &&
    args.input.receivedDay > expectedDay
      ? 'late'
      : args.input.status

  const now = Date.now()
  const expectedAmount = roundCurrency(resolveIncomeNetAmount(income))
  const existing = await ctx.db
    .query('incomePaymentChecks')
    .withIndex('by_userId_incomeId_cycleMonth', (q) =>
      q.eq('userId', args.userId).eq('incomeId', args.input.incomeId).eq('cycleMonth', cycleMonth),
    )
    .first()

  const nextData = {
    cycleMonth,
    status: normalizedStatus,
    expectedDay,
    receivedDay: args.input.status === 'missed' ? undefined : args.input.receivedDay,
    expectedAmount,
    receivedAmount: args.input.status === 'missed' ? undefined : args.input.receivedAmount,
    paymentReference: args.input.status === 'missed' ? undefined : args.input.paymentReference?.trim() || undefined,
    payslipReference: args.input.status === 'missed' ? undefined : args.input.payslipReference?.trim() || undefined,
    note: args.input.note?.trim() || undefined,
    updatedAt: now,
  }

  if (existing) {
    await ctx.db.patch(existing._id, nextData)

    await recordFinanceAuditEvent(ctx, {
      userId: args.userId,
      entityType: 'income_payment_check',
      entityId: String(existing._id),
      action: 'updated',
      before: {
        cycleMonth: existing.cycleMonth,
        status: existing.status,
        receivedDay: existing.receivedDay,
        receivedAmount: existing.receivedAmount,
        paymentReference: existing.paymentReference,
        payslipReference: existing.payslipReference,
        note: existing.note,
      },
      after: nextData,
      metadata: args.metadata,
    })

    return {
      id: existing._id,
      status: normalizedStatus,
      action: 'updated' as const,
      lateNormalized: normalizedStatus === 'late' && args.input.status === 'on_time',
    }
  }

  const createdId = await ctx.db.insert('incomePaymentChecks', {
    userId: args.userId,
    incomeId: args.input.incomeId,
    createdAt: now,
    ...nextData,
  })

  await recordFinanceAuditEvent(ctx, {
    userId: args.userId,
    entityType: 'income_payment_check',
    entityId: String(createdId),
    action: 'created',
    after: {
      incomeId: String(args.input.incomeId),
      ...nextData,
    },
    metadata: args.metadata,
  })

  return {
    id: createdId,
    status: normalizedStatus,
    action: 'created' as const,
    lateNormalized: normalizedStatus === 'late' && args.input.status === 'on_time',
  }
}

export const upsertIncomePaymentCheck = mutation({
  args: {
    incomeId: v.id('incomes'),
    cycleMonth: v.string(),
    status: incomePaymentStatusValidator,
    receivedDay: v.optional(v.number()),
    receivedAmount: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    payslipReference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const result = await upsertIncomePaymentCheckRecord(ctx, {
      userId: identity.subject,
      input: args,
      metadata: { mode: 'single' },
    })

    return {
      id: result.id,
      status: result.status,
    }
  },
})

export const bulkUpsertIncomePaymentChecks = mutation({
  args: {
    cycleMonth: v.string(),
    entries: v.array(
      v.object({
        incomeId: v.id('incomes'),
        status: incomePaymentStatusValidator,
        receivedDay: v.optional(v.number()),
        receivedAmount: v.optional(v.number()),
        paymentReference: v.optional(v.string()),
        payslipReference: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateStatementMonth(args.cycleMonth, 'Cycle month')

    if (args.entries.length === 0) {
      throw new Error('Add at least one income entry for bulk import.')
    }
    if (args.entries.length > 200) {
      throw new Error('Bulk import supports up to 200 entries per run.')
    }

    const seenIncomeIds = new Set<string>()
    args.entries.forEach((entry) => {
      const key = String(entry.incomeId)
      if (seenIncomeIds.has(key)) {
        throw new Error('Bulk import cannot include the same income source more than once.')
      }
      seenIncomeIds.add(key)
    })

    const batchId = `bulk-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const results = []
    for (let index = 0; index < args.entries.length; index += 1) {
      const entry = args.entries[index]
      const result = await upsertIncomePaymentCheckRecord(ctx, {
        userId: identity.subject,
        input: {
          ...entry,
          cycleMonth: args.cycleMonth,
        },
        metadata: {
          mode: 'bulk',
          batchId,
          row: index + 1,
          totalRows: args.entries.length,
        },
      })
      results.push(result)
    }

    const createdCount = results.filter((entry) => entry.action === 'created').length
    const updatedCount = results.filter((entry) => entry.action === 'updated').length
    const normalizedLateCount = results.filter((entry) => entry.lateNormalized).length

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_payment_check_bulk',
      entityId: batchId,
      action: 'upserted',
      metadata: {
        cycleMonth: args.cycleMonth,
        rowCount: args.entries.length,
        createdCount,
        updatedCount,
        normalizedLateCount,
      },
    })

    return {
      batchId,
      cycleMonth: args.cycleMonth,
      rowCount: args.entries.length,
      createdCount,
      updatedCount,
      normalizedLateCount,
    }
  },
})

export const removeIncomePaymentCheck = mutation({
  args: {
    id: v.id('incomePaymentChecks'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income payment record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_payment_check',
      entityId: String(args.id),
      action: 'removed',
      before: {
        incomeId: String(existing.incomeId),
        cycleMonth: existing.cycleMonth,
        status: existing.status,
        receivedDay: existing.receivedDay,
        receivedAmount: existing.receivedAmount,
        paymentReference: existing.paymentReference,
        payslipReference: existing.payslipReference,
      },
    })
  },
})

const upsertBillPaymentCheckRecord = async (
  ctx: MutationCtx,
  args: {
    userId: string
    input: {
      billId: Id<'bills'>
      cycleMonth: string
      expectedAmount: number
      actualAmount?: number
      paidDay?: number
      note?: string
    }
    metadata?: unknown
  },
) => {
  const cycleMonth = args.input.cycleMonth.trim()
  validateStatementMonth(cycleMonth, 'Cycle month')
  validatePositive(args.input.expectedAmount, 'Planned amount')
  validateOptionalText(args.input.note, 'Bill cycle note', 800)

  if (args.input.actualAmount !== undefined) {
    validateNonNegative(args.input.actualAmount, 'Actual paid amount')
  }
  if (args.input.paidDay !== undefined) {
    validateDayOfMonth(args.input.paidDay, 'Paid day')
  }

  const bill = await ctx.db.get(args.input.billId)
  ensureOwned(bill, args.userId, 'Bill record not found.')

  const expectedAmount = roundCurrency(args.input.expectedAmount)
  const actualAmount =
    args.input.actualAmount === undefined ? undefined : roundCurrency(Math.max(args.input.actualAmount, 0))
  const varianceAmount = actualAmount === undefined ? undefined : roundCurrency(actualAmount - expectedAmount)
  const note = args.input.note?.trim() || undefined
  const now = Date.now()

  const existing = await ctx.db
    .query('billPaymentChecks')
    .withIndex('by_userId_billId_cycleMonth', (q) =>
      q.eq('userId', args.userId).eq('billId', args.input.billId).eq('cycleMonth', cycleMonth),
    )
    .first()

  const nextData = {
    cycleMonth,
    expectedAmount,
    actualAmount,
    varianceAmount,
    paidDay: args.input.paidDay,
    note,
    updatedAt: now,
  }

  if (existing) {
    await ctx.db.patch(existing._id, nextData)

    await recordFinanceAuditEvent(ctx, {
      userId: args.userId,
      entityType: 'bill_payment_check',
      entityId: String(existing._id),
      action: 'updated',
      before: {
        billId: String(existing.billId),
        cycleMonth: existing.cycleMonth,
        expectedAmount: existing.expectedAmount,
        actualAmount: existing.actualAmount,
        varianceAmount: existing.varianceAmount,
        paidDay: existing.paidDay,
        note: existing.note,
      },
      after: {
        billId: String(args.input.billId),
        ...nextData,
      },
      metadata: args.metadata,
    })

    return {
      id: existing._id,
      action: 'updated' as const,
    }
  }

  const createdId = await ctx.db.insert('billPaymentChecks', {
    userId: args.userId,
    billId: args.input.billId,
    createdAt: now,
    ...nextData,
  })

  await recordFinanceAuditEvent(ctx, {
    userId: args.userId,
    entityType: 'bill_payment_check',
    entityId: String(createdId),
    action: 'created',
    after: {
      billId: String(args.input.billId),
      ...nextData,
    },
    metadata: args.metadata,
  })

  return {
    id: createdId,
    action: 'created' as const,
  }
}

export const upsertBillPaymentCheck = mutation({
  args: {
    billId: v.id('bills'),
    cycleMonth: v.string(),
    expectedAmount: v.number(),
    actualAmount: v.optional(v.number()),
    paidDay: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const result = await upsertBillPaymentCheckRecord(ctx, {
      userId: identity.subject,
      input: args,
      metadata: {
        mode: 'single',
      },
    })

    return {
      id: result.id,
      action: result.action,
    }
  },
})

export const removeBillPaymentCheck = mutation({
  args: {
    id: v.id('billPaymentChecks'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Bill cycle record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill_payment_check',
      entityId: String(args.id),
      action: 'removed',
      before: {
        billId: String(existing.billId),
        cycleMonth: existing.cycleMonth,
        expectedAmount: existing.expectedAmount,
        actualAmount: existing.actualAmount,
        varianceAmount: existing.varianceAmount,
        paidDay: existing.paidDay,
        note: existing.note,
      },
    })
  },
})

export const addBill = mutation({
  args: {
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    isSubscription: v.optional(v.boolean()),
    cancelReminderDays: v.optional(v.number()),
    linkedAccountId: v.optional(v.id('accounts')),
    autopay: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Bill name')
    validatePositive(args.amount, 'Bill amount')
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)
    const subscriptionDetails = sanitizeSubscriptionDetails(args.isSubscription, args.cancelReminderDays)
    const linkedAccountId = await resolveBillLinkedAccountId(ctx, identity.subject, args.linkedAccountId)

    const createdBillId = await ctx.db.insert('bills', {
      userId: identity.subject,
      name: args.name.trim(),
      amount: args.amount,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      isSubscription: subscriptionDetails.isSubscription,
      cancelReminderDays: subscriptionDetails.cancelReminderDays,
      linkedAccountId,
      autopay: args.autopay,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill',
      entityId: String(createdBillId),
      action: 'created',
      after: {
        name: args.name.trim(),
        amount: args.amount,
        dueDay: args.dueDay,
        cadence: args.cadence,
        isSubscription: subscriptionDetails.isSubscription,
        cancelReminderDays: subscriptionDetails.cancelReminderDays,
        linkedAccountId: linkedAccountId ? String(linkedAccountId) : undefined,
      },
    })
  },
})

export const updateBill = mutation({
  args: {
    id: v.id('bills'),
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    isSubscription: v.optional(v.boolean()),
    cancelReminderDays: v.optional(v.number()),
    linkedAccountId: v.optional(v.id('accounts')),
    autopay: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Bill name')
    validatePositive(args.amount, 'Bill amount')
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)
    const subscriptionDetails = sanitizeSubscriptionDetails(args.isSubscription, args.cancelReminderDays)
    const linkedAccountId = await resolveBillLinkedAccountId(ctx, identity.subject, args.linkedAccountId)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Bill record not found.')

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      amount: args.amount,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      isSubscription: subscriptionDetails.isSubscription,
      cancelReminderDays: subscriptionDetails.cancelReminderDays,
      linkedAccountId,
      autopay: args.autopay,
      notes: args.notes?.trim() || undefined,
    })

    const wasSubscription = existing.isSubscription === true
    const isSubscription = subscriptionDetails.isSubscription
    if ((wasSubscription || isSubscription) && Math.abs(existing.amount - args.amount) > 0.005) {
      await ctx.db.insert('subscriptionPriceChanges', {
        userId: identity.subject,
        billId: args.id,
        previousAmount: roundCurrency(existing.amount),
        newAmount: roundCurrency(args.amount),
        effectiveDate: new Date().toISOString().slice(0, 10),
        note: undefined,
        createdAt: Date.now(),
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        amount: existing.amount,
        dueDay: existing.dueDay,
        cadence: existing.cadence,
        isSubscription: existing.isSubscription ?? false,
        cancelReminderDays: existing.cancelReminderDays,
        linkedAccountId: existing.linkedAccountId ? String(existing.linkedAccountId) : undefined,
      },
      after: {
        name: args.name.trim(),
        amount: args.amount,
        dueDay: args.dueDay,
        cadence: args.cadence,
        isSubscription: subscriptionDetails.isSubscription,
        cancelReminderDays: subscriptionDetails.cancelReminderDays,
        linkedAccountId: linkedAccountId ? String(linkedAccountId) : undefined,
      },
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
    ensureOwned(existing, identity.subject, 'Bill record not found.')

    const existingChecks = await ctx.db
      .query('billPaymentChecks')
      .withIndex('by_userId_billId_cycleMonth', (q) =>
        q.eq('userId', identity.subject).eq('billId', args.id),
      )
      .collect()
    const existingSubscriptionPriceChanges = await ctx.db
      .query('subscriptionPriceChanges')
      .withIndex('by_userId_billId_createdAt', (q) =>
        q.eq('userId', identity.subject).eq('billId', args.id),
      )
      .collect()

    if (existingChecks.length > 0) {
      await Promise.all(existingChecks.map((entry) => ctx.db.delete(entry._id)))
    }
    if (existingSubscriptionPriceChanges.length > 0) {
      await Promise.all(existingSubscriptionPriceChanges.map((entry) => ctx.db.delete(entry._id)))
    }

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        amount: existing.amount,
        dueDay: existing.dueDay,
        cadence: existing.cadence,
        removedCycleLogs: existingChecks.length,
      },
    })
  },
})

export const addLoan = mutation({
  args: {
    name: v.string(),
    balance: v.number(),
    minimumPayment: v.number(),
    subscriptionCost: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Loan name')
    validateNonNegative(args.balance, 'Loan balance')
    validatePositive(args.minimumPayment, 'Loan minimum payment')
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.subscriptionCost !== undefined) {
      validateNonNegative(args.subscriptionCost, 'Loan subscription cost')
    }

    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Loan interest rate')
    }

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)

    const createdLoanId = await ctx.db.insert('loans', {
      userId: identity.subject,
      name: args.name.trim(),
      balance: args.balance,
      minimumPayment: args.minimumPayment,
      subscriptionCost: args.subscriptionCost,
      interestRate: args.interestRate,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      notes: args.notes?.trim() || undefined,
      lastCycleAt: Date.now(),
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(createdLoanId),
      action: 'created',
      after: {
        name: args.name.trim(),
        balance: args.balance,
        minimumPayment: args.minimumPayment,
        subscriptionCost: args.subscriptionCost ?? 0,
        interestRate: args.interestRate ?? 0,
      },
    })
  },
})

export const updateLoan = mutation({
  args: {
    id: v.id('loans'),
    name: v.string(),
    balance: v.number(),
    minimumPayment: v.number(),
    subscriptionCost: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Loan name')
    validateNonNegative(args.balance, 'Loan balance')
    validatePositive(args.minimumPayment, 'Loan minimum payment')
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.subscriptionCost !== undefined) {
      validateNonNegative(args.subscriptionCost, 'Loan subscription cost')
    }

    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Loan interest rate')
    }

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      balance: args.balance,
      minimumPayment: args.minimumPayment,
      subscriptionCost: args.subscriptionCost,
      interestRate: args.interestRate,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        balance: existing.balance,
        minimumPayment: existing.minimumPayment,
        subscriptionCost: existing.subscriptionCost ?? 0,
        interestRate: existing.interestRate ?? 0,
      },
      after: {
        name: args.name.trim(),
        balance: args.balance,
        minimumPayment: args.minimumPayment,
        subscriptionCost: args.subscriptionCost ?? 0,
        interestRate: args.interestRate ?? 0,
      },
    })
  },
})

export const removeLoan = mutation({
  args: {
    id: v.id('loans'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        balance: existing.balance,
        minimumPayment: existing.minimumPayment,
      },
    })
  },
})

export const applyCardMonthlyCycle = mutation({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = new Date(args.now ?? Date.now())
    const cardResult = await runCardMonthlyCycleForUser(ctx, identity.subject, now, toCycleKey(now))

    return {
      ...cardResult,
    }
  },
})

export const applyLoanMonthlyCycle = mutation({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = new Date(args.now ?? Date.now())
    const loanResult = await runLoanMonthlyCycleForUser(ctx, identity.subject, now, toCycleKey(now))

    return {
      ...loanResult,
    }
  },
})

export const runMonthlyCycle = mutation({
  args: {
    now: v.optional(v.number()),
    source: v.optional(cycleRunSourceValidator),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = new Date(args.now ?? Date.now())
    const source: CycleRunSource = args.source ?? 'manual'
    const cycleKey = toCycleKey(now)
    const providedIdempotencyKey = args.idempotencyKey?.trim() || undefined
    const idempotencyKey = providedIdempotencyKey ?? (source === 'automatic' ? `automatic:${cycleKey}` : undefined)

    if (idempotencyKey) {
      const existingRun = await ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_idempotencyKey', (q) => q.eq('userId', identity.subject).eq('idempotencyKey', idempotencyKey))
        .first()

      if (existingRun) {
        return {
          source: existingRun.source,
          cycleKey: existingRun.cycleKey,
          idempotencyKey: existingRun.idempotencyKey ?? null,
          auditLogId: existingRun.auditLogId ?? null,
          monthlyCycleRunId: String(existingRun._id),
          updatedCards: existingRun.updatedCards,
          updatedLoans: existingRun.updatedLoans,
          cyclesApplied: existingRun.cardCyclesApplied + existingRun.loanCyclesApplied,
          cardCyclesApplied: existingRun.cardCyclesApplied,
          loanCyclesApplied: existingRun.loanCyclesApplied,
          interestAccrued: roundCurrency(existingRun.cardInterestAccrued + existingRun.loanInterestAccrued),
          paymentsApplied: roundCurrency(existingRun.cardPaymentsApplied + existingRun.loanPaymentsApplied),
          spendAdded: existingRun.cardSpendAdded,
          cardInterestAccrued: existingRun.cardInterestAccrued,
          cardPaymentsApplied: existingRun.cardPaymentsApplied,
          loanInterestAccrued: existingRun.loanInterestAccrued,
          loanPaymentsApplied: existingRun.loanPaymentsApplied,
        }
      }
    }

    try {
      const cardResult = await runCardMonthlyCycleForUser(ctx, identity.subject, now, cycleKey)
      const loanResult = await runLoanMonthlyCycleForUser(ctx, identity.subject, now, cycleKey)

      const shouldLog = source === 'manual' || cardResult.updatedCards > 0 || loanResult.updatedLoans > 0
      let auditLogId: string | null = null

      if (shouldLog) {
        const id = await ctx.db.insert('cycleAuditLogs', {
          userId: identity.subject,
          source,
          cycleKey,
          idempotencyKey,
          ranAt: now.getTime(),
          updatedCards: cardResult.updatedCards,
          updatedLoans: loanResult.updatedLoans,
          cardCyclesApplied: cardResult.cyclesApplied,
          loanCyclesApplied: loanResult.cyclesApplied,
          cardInterestAccrued: cardResult.interestAccrued,
          cardPaymentsApplied: cardResult.paymentsApplied,
          cardSpendAdded: cardResult.spendAdded,
          loanInterestAccrued: loanResult.interestAccrued,
          loanPaymentsApplied: loanResult.paymentsApplied,
          createdAt: Date.now(),
        })
        auditLogId = String(id)
      }

      const summarySnapshot = await computeMonthCloseSnapshotSummary(ctx, identity.subject, now)
      const existingSnapshot = await ctx.db
        .query('monthCloseSnapshots')
        .withIndex('by_userId_cycleKey', (q) => q.eq('userId', identity.subject).eq('cycleKey', cycleKey))
        .first()

      if (existingSnapshot) {
        await ctx.db.patch(existingSnapshot._id, {
          ranAt: now.getTime(),
          summary: summarySnapshot,
        })
      } else {
        await ctx.db.insert('monthCloseSnapshots', {
          userId: identity.subject,
          cycleKey,
          ranAt: now.getTime(),
          summary: summarySnapshot,
          createdAt: Date.now(),
        })
      }

      const monthlyCycleRunId = await ctx.db.insert('monthlyCycleRuns', {
        userId: identity.subject,
        cycleKey,
        source,
        status: 'completed',
        idempotencyKey,
        auditLogId: auditLogId ?? undefined,
        failureReason: undefined,
        ranAt: now.getTime(),
        updatedCards: cardResult.updatedCards,
        updatedLoans: loanResult.updatedLoans,
        cardCyclesApplied: cardResult.cyclesApplied,
        loanCyclesApplied: loanResult.cyclesApplied,
        cardInterestAccrued: cardResult.interestAccrued,
        cardPaymentsApplied: cardResult.paymentsApplied,
        cardSpendAdded: cardResult.spendAdded,
        loanInterestAccrued: loanResult.interestAccrued,
        loanPaymentsApplied: loanResult.paymentsApplied,
        createdAt: Date.now(),
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'monthly_cycle',
        entityId: cycleKey,
        action: 'run_completed',
        metadata: {
          source,
          idempotencyKey,
          updatedCards: cardResult.updatedCards,
          updatedLoans: loanResult.updatedLoans,
          cardCyclesApplied: cardResult.cyclesApplied,
          loanCyclesApplied: loanResult.cyclesApplied,
        },
      })

      return {
        source,
        cycleKey,
        idempotencyKey: idempotencyKey ?? null,
        auditLogId,
        monthlyCycleRunId: String(monthlyCycleRunId),
        updatedCards: cardResult.updatedCards,
        updatedLoans: loanResult.updatedLoans,
        cyclesApplied: cardResult.cyclesApplied + loanResult.cyclesApplied,
        cardCyclesApplied: cardResult.cyclesApplied,
        loanCyclesApplied: loanResult.cyclesApplied,
        interestAccrued: roundCurrency(cardResult.interestAccrued + loanResult.interestAccrued),
        paymentsApplied: roundCurrency(cardResult.paymentsApplied + loanResult.paymentsApplied),
        spendAdded: cardResult.spendAdded,
        cardInterestAccrued: cardResult.interestAccrued,
        cardPaymentsApplied: cardResult.paymentsApplied,
        loanInterestAccrued: loanResult.interestAccrued,
        loanPaymentsApplied: loanResult.paymentsApplied,
      }
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error)

      await ctx.db.insert('monthlyCycleRuns', {
        userId: identity.subject,
        cycleKey,
        source,
        status: 'failed',
        idempotencyKey: undefined,
        auditLogId: undefined,
        failureReason: failureReason.slice(0, 280),
        ranAt: now.getTime(),
        updatedCards: 0,
        updatedLoans: 0,
        cardCyclesApplied: 0,
        loanCyclesApplied: 0,
        cardInterestAccrued: 0,
        cardPaymentsApplied: 0,
        cardSpendAdded: 0,
        loanInterestAccrued: 0,
        loanPaymentsApplied: 0,
        createdAt: Date.now(),
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'monthly_cycle',
        entityId: cycleKey,
        action: 'run_failed',
        metadata: {
          source,
          idempotencyKey,
          failureReason,
        },
      })

      throw error instanceof Error ? error : new Error(failureReason)
    }
  },
})

export const addCard = mutation({
  args: {
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
    statementBalance: v.optional(v.number()),
    pendingCharges: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(cardMinimumPaymentTypeValidator),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    spendPerMonth: v.number(),
    interestRate: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Card name')
    validatePositive(args.creditLimit, 'Credit limit')
    validateNonNegative(args.usedLimit, 'Used limit')
    validateUsedLimitAgainstCreditLimit({
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })
    if (args.statementBalance !== undefined) {
      validateNonNegative(args.statementBalance, 'Statement balance')
    }
    if (args.pendingCharges !== undefined) {
      validateNonNegative(args.pendingCharges, 'Pending charges')
    }
    const minimumPaymentType = normalizeCardMinimumPaymentType(args.minimumPaymentType)
    validateNonNegative(args.minimumPayment, 'Minimum payment')
    if (minimumPaymentType === 'percent_plus_interest') {
      if (args.minimumPaymentPercent === undefined) {
        throw new Error('Minimum payment % is required for % + interest cards.')
      }
      validateNonNegative(args.minimumPaymentPercent, 'Minimum payment %')
      if (args.minimumPaymentPercent > 100) {
        throw new Error('Minimum payment % must be 100 or less.')
      }
    }
    if (args.extraPayment !== undefined) {
      validateNonNegative(args.extraPayment, 'Extra payment')
    }
    validateNonNegative(args.spendPerMonth, 'Spend per month')
    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Card APR')
    }
    if (args.statementDay !== undefined) {
      validateDayOfMonth(args.statementDay, 'Statement day')
    }
    if (args.dueDay !== undefined) {
      validateDayOfMonth(args.dueDay, 'Due day')
    }

    const statementBalance = args.statementBalance ?? args.usedLimit
    const pendingCharges = args.pendingCharges ?? Math.max(args.usedLimit - statementBalance, 0)
    const statementDay = args.statementDay ?? 1
    const dueDay = args.dueDay ?? 21
    const minimumPaymentPercent =
      minimumPaymentType === 'percent_plus_interest'
        ? clampPercent(finiteOrZero(args.minimumPaymentPercent))
        : undefined
    const extraPayment = finiteOrZero(args.extraPayment)

    const createdCardId = await ctx.db.insert('cards', {
      userId: identity.subject,
      name: args.name.trim(),
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      statementBalance,
      pendingCharges,
      minimumPayment: args.minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
      spendPerMonth: args.spendPerMonth,
      interestRate: args.interestRate,
      statementDay,
      dueDay,
      lastCycleAt: Date.now(),
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(createdCardId),
      action: 'created',
      after: {
        name: args.name.trim(),
        creditLimit: args.creditLimit,
        usedLimit: args.usedLimit,
        statementBalance,
        pendingCharges,
        minimumPayment: args.minimumPayment,
        minimumPaymentType,
        minimumPaymentPercent: minimumPaymentPercent ?? 0,
        extraPayment,
        spendPerMonth: args.spendPerMonth,
        interestRate: args.interestRate ?? 0,
        statementDay,
        dueDay,
      },
    })
  },
})

export const updateCard = mutation({
  args: {
    id: v.id('cards'),
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
    statementBalance: v.optional(v.number()),
    pendingCharges: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(cardMinimumPaymentTypeValidator),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    spendPerMonth: v.number(),
    interestRate: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Card name')
    validatePositive(args.creditLimit, 'Credit limit')
    validateNonNegative(args.usedLimit, 'Used limit')
    validateUsedLimitAgainstCreditLimit({
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })
    if (args.statementBalance !== undefined) {
      validateNonNegative(args.statementBalance, 'Statement balance')
    }
    if (args.pendingCharges !== undefined) {
      validateNonNegative(args.pendingCharges, 'Pending charges')
    }
    validateNonNegative(args.minimumPayment, 'Minimum payment')
    if (args.minimumPaymentPercent !== undefined) {
      validateNonNegative(args.minimumPaymentPercent, 'Minimum payment %')
      if (args.minimumPaymentPercent > 100) {
        throw new Error('Minimum payment % must be 100 or less.')
      }
    }
    if (args.extraPayment !== undefined) {
      validateNonNegative(args.extraPayment, 'Extra payment')
    }
    validateNonNegative(args.spendPerMonth, 'Spend per month')
    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Card APR')
    }
    if (args.statementDay !== undefined) {
      validateDayOfMonth(args.statementDay, 'Statement day')
    }
    if (args.dueDay !== undefined) {
      validateDayOfMonth(args.dueDay, 'Due day')
    }

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')
    const statementBalance = args.statementBalance ?? existing.statementBalance ?? args.usedLimit
    const pendingCharges =
      args.pendingCharges ?? existing.pendingCharges ?? Math.max(args.usedLimit - statementBalance, 0)
    const statementDay = args.statementDay ?? existing.statementDay ?? 1
    const dueDay = args.dueDay ?? existing.dueDay ?? 21
    const minimumPaymentType = normalizeCardMinimumPaymentType(
      args.minimumPaymentType ?? existing.minimumPaymentType,
    )
    const minimumPaymentPercentCandidate = args.minimumPaymentPercent ?? existing.minimumPaymentPercent
    if (minimumPaymentType === 'percent_plus_interest' && minimumPaymentPercentCandidate === undefined) {
      throw new Error('Minimum payment % is required for % + interest cards.')
    }
    const minimumPaymentPercent =
      minimumPaymentType === 'percent_plus_interest'
        ? clampPercent(finiteOrZero(minimumPaymentPercentCandidate))
        : undefined
    const extraPayment = finiteOrZero(args.extraPayment ?? existing.extraPayment)

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      statementBalance,
      pendingCharges,
      minimumPayment: args.minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
      spendPerMonth: args.spendPerMonth,
      interestRate: args.interestRate,
      statementDay,
      dueDay,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        creditLimit: existing.creditLimit,
        usedLimit: existing.usedLimit,
        statementBalance: existing.statementBalance ?? existing.usedLimit,
        pendingCharges: existing.pendingCharges ?? Math.max(existing.usedLimit - (existing.statementBalance ?? existing.usedLimit), 0),
        minimumPayment: existing.minimumPayment,
        minimumPaymentType: normalizeCardMinimumPaymentType(existing.minimumPaymentType),
        minimumPaymentPercent: finiteOrZero(existing.minimumPaymentPercent),
        extraPayment: finiteOrZero(existing.extraPayment),
        spendPerMonth: existing.spendPerMonth,
        interestRate: existing.interestRate ?? 0,
        statementDay: existing.statementDay ?? 1,
        dueDay: existing.dueDay ?? 21,
      },
      after: {
        name: args.name.trim(),
        creditLimit: args.creditLimit,
        usedLimit: args.usedLimit,
        statementBalance,
        pendingCharges,
        minimumPayment: args.minimumPayment,
        minimumPaymentType,
        minimumPaymentPercent: minimumPaymentPercent ?? 0,
        extraPayment,
        spendPerMonth: args.spendPerMonth,
        interestRate: args.interestRate ?? 0,
        statementDay,
        dueDay,
      },
    })
  },
})

export const addCardCharge = mutation({
  args: {
    id: v.id('cards'),
    amount: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Charge amount')

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')
    const projectedUsed = finiteOrZero(existing.usedLimit) + args.amount
    validateUsedLimitAgainstCreditLimit({
      creditLimit: finiteOrZero(existing.creditLimit),
      usedLimit: projectedUsed,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })
    const next = applyChargeToCard(existing, args.amount)

    await ctx.db.patch(args.id, {
      usedLimit: next.usedLimit,
      statementBalance: next.statementBalance,
      pendingCharges: next.pendingCharges,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'quick_charge',
      before: {
        usedLimit: existing.usedLimit,
        statementBalance: existing.statementBalance ?? existing.usedLimit,
        pendingCharges: existing.pendingCharges ?? 0,
      },
      after: {
        usedLimit: next.usedLimit,
        statementBalance: next.statementBalance,
        pendingCharges: next.pendingCharges,
      },
      metadata: {
        amount: args.amount,
      },
    })
  },
})

export const recordCardPayment = mutation({
  args: {
    id: v.id('cards'),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Payment amount')

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')
    const outstanding = Math.max(finiteOrZero(existing.usedLimit), 0)
    if (args.amount > outstanding + 0.000001) {
      throw new Error(`Payment amount cannot exceed current balance (${roundCurrency(outstanding)}).`)
    }
    const next = applyPaymentToCard(existing, args.amount)

    if (next.appliedAmount <= 0) {
      throw new Error('No outstanding card balance to pay down.')
    }

    await ctx.db.patch(args.id, {
      usedLimit: next.usedLimit,
      statementBalance: next.statementBalance,
      pendingCharges: next.pendingCharges,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'quick_payment',
      before: {
        usedLimit: existing.usedLimit,
        statementBalance: existing.statementBalance ?? existing.usedLimit,
        pendingCharges: existing.pendingCharges ?? 0,
      },
      after: {
        usedLimit: next.usedLimit,
        statementBalance: next.statementBalance,
        pendingCharges: next.pendingCharges,
      },
      metadata: {
        requestedAmount: args.amount,
        appliedAmount: next.appliedAmount,
        unappliedAmount: next.unappliedAmount,
      },
    })
  },
})

export const transferCardBalance = mutation({
  args: {
    fromCardId: v.id('cards'),
    toCardId: v.id('cards'),
    amount: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Transfer amount')

    if (args.fromCardId === args.toCardId) {
      throw new Error('Transfer source and destination must be different cards.')
    }

    const [fromCard, toCard] = await Promise.all([ctx.db.get(args.fromCardId), ctx.db.get(args.toCardId)])
    ensureOwned(fromCard, identity.subject, 'Source card not found.')
    ensureOwned(toCard, identity.subject, 'Destination card not found.')
    const sourceOutstanding = Math.max(finiteOrZero(fromCard.usedLimit), 0)
    if (args.amount > sourceOutstanding + 0.000001) {
      throw new Error(`Transfer amount cannot exceed source balance (${roundCurrency(sourceOutstanding)}).`)
    }
    validateUsedLimitAgainstCreditLimit({
      creditLimit: finiteOrZero(toCard.creditLimit),
      usedLimit: finiteOrZero(toCard.usedLimit) + args.amount,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })

    const fromNext = applyPaymentToCard(fromCard, args.amount)
    if (fromNext.appliedAmount <= 0) {
      throw new Error('No outstanding source-card balance available to transfer.')
    }

    const toNext = applyTransferIntoCard(toCard, fromNext.appliedAmount)

    await Promise.all([
      ctx.db.patch(args.fromCardId, {
        usedLimit: fromNext.usedLimit,
        statementBalance: fromNext.statementBalance,
        pendingCharges: fromNext.pendingCharges,
      }),
      ctx.db.patch(args.toCardId, {
        usedLimit: toNext.usedLimit,
        statementBalance: toNext.statementBalance,
        pendingCharges: toNext.pendingCharges,
      }),
    ])

    await Promise.all([
      recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'card',
        entityId: String(args.fromCardId),
        action: 'quick_transfer_out',
        before: {
          usedLimit: fromCard.usedLimit,
          statementBalance: fromCard.statementBalance ?? fromCard.usedLimit,
          pendingCharges: fromCard.pendingCharges ?? 0,
        },
        after: {
          usedLimit: fromNext.usedLimit,
          statementBalance: fromNext.statementBalance,
          pendingCharges: fromNext.pendingCharges,
        },
        metadata: {
          destinationCardId: String(args.toCardId),
          requestedAmount: args.amount,
          appliedAmount: fromNext.appliedAmount,
          unappliedAmount: fromNext.unappliedAmount,
        },
      }),
      recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'card',
        entityId: String(args.toCardId),
        action: 'quick_transfer_in',
        before: {
          usedLimit: toCard.usedLimit,
          statementBalance: toCard.statementBalance ?? toCard.usedLimit,
          pendingCharges: toCard.pendingCharges ?? 0,
        },
        after: {
          usedLimit: toNext.usedLimit,
          statementBalance: toNext.statementBalance,
          pendingCharges: toNext.pendingCharges,
        },
        metadata: {
          sourceCardId: String(args.fromCardId),
          amount: fromNext.appliedAmount,
        },
      }),
    ])
  },
})

export const removeCard = mutation({
  args: {
    id: v.id('cards'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        creditLimit: existing.creditLimit,
        usedLimit: existing.usedLimit,
      },
    })
  },
})

export const addPurchase = mutation({
  args: {
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    statementMonth: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.item, 'Purchase item')
    validatePositive(args.amount, 'Purchase amount')
    validateOptionalText(args.notes, 'Notes', 2000)
    validateIsoDate(args.purchaseDate, 'Purchase date')
    if (args.statementMonth) {
      validateStatementMonth(args.statementMonth, 'Statement month')
    }

    const ruleOverride = await resolvePurchaseRuleOverrides(ctx, identity.subject, args.item)
    const resolvedCategory = isGenericCategory(args.category) && ruleOverride?.category ? ruleOverride.category : args.category.trim()
    const requestedStatus = args.reconciliationStatus ?? ruleOverride?.reconciliationStatus
    validateRequiredText(resolvedCategory, 'Purchase category')

    const now = Date.now()
    const reconciliation = resolvePurchaseReconciliation({
      purchaseDate: args.purchaseDate,
      requestedStatus,
      requestedStatementMonth: args.statementMonth,
      now,
    })

    const purchaseId = await ctx.db.insert('purchases', {
      userId: identity.subject,
      item: args.item.trim(),
      amount: args.amount,
      category: resolvedCategory,
      purchaseDate: args.purchaseDate,
      reconciliationStatus: reconciliation.reconciliationStatus,
      statementMonth: reconciliation.statementMonth,
      postedAt: reconciliation.postedAt,
      reconciledAt: reconciliation.reconciledAt,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
    })

    if (isPurchasePosted(reconciliation.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase',
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        purchaseId: String(purchaseId),
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(purchaseId),
      action: 'created',
      after: {
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        reconciliationStatus: reconciliation.reconciliationStatus,
        statementMonth: reconciliation.statementMonth,
        ruleId: ruleOverride?.ruleId,
      },
    })
  },
})

export const updatePurchase = mutation({
  args: {
    id: v.id('purchases'),
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    statementMonth: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.item, 'Purchase item')
    validatePositive(args.amount, 'Purchase amount')
    validateOptionalText(args.notes, 'Notes', 2000)
    validateIsoDate(args.purchaseDate, 'Purchase date')
    if (args.statementMonth) {
      validateStatementMonth(args.statementMonth, 'Statement month')
    }

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Purchase record not found.')

    const ruleOverride = await resolvePurchaseRuleOverrides(ctx, identity.subject, args.item)
    const resolvedCategory = isGenericCategory(args.category) && ruleOverride?.category ? ruleOverride.category : args.category.trim()
    const requestedStatus = args.reconciliationStatus ?? ruleOverride?.reconciliationStatus
    validateRequiredText(resolvedCategory, 'Purchase category')

    const now = Date.now()
    const reconciliation = resolvePurchaseReconciliation({
      purchaseDate: args.purchaseDate,
      requestedStatus,
      requestedStatementMonth: args.statementMonth,
      existing,
      now,
    })

    if (isPurchasePosted(existing.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase_reversal',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    }

    await ctx.db.patch(args.id, {
      item: args.item.trim(),
      amount: args.amount,
      category: resolvedCategory,
      purchaseDate: args.purchaseDate,
      reconciliationStatus: reconciliation.reconciliationStatus,
      statementMonth: reconciliation.statementMonth,
      postedAt: reconciliation.postedAt,
      reconciledAt: reconciliation.reconciledAt,
      notes: args.notes?.trim() || undefined,
    })

    if (isPurchasePosted(reconciliation.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase',
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        purchaseId: String(args.id),
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.id),
      action: 'updated',
      before: {
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        reconciliationStatus: existing.reconciliationStatus ?? 'posted',
        statementMonth: existing.statementMonth ?? existing.purchaseDate.slice(0, 7),
      },
      after: {
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        reconciliationStatus: reconciliation.reconciliationStatus,
        statementMonth: reconciliation.statementMonth,
        ruleId: ruleOverride?.ruleId,
      },
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
    ensureOwned(existing, identity.subject, 'Purchase record not found.')

    if (isPurchasePosted(existing.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase_reversal',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    }

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.id),
      action: 'removed',
      before: {
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        reconciliationStatus: existing.reconciliationStatus ?? 'posted',
        statementMonth: existing.statementMonth ?? existing.purchaseDate.slice(0, 7),
      },
    })
  },
})

export const setPurchaseReconciliation = mutation({
  args: {
    id: v.id('purchases'),
    reconciliationStatus: reconciliationStatusValidator,
    statementMonth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Purchase record not found.')

    if (args.statementMonth) {
      validateStatementMonth(args.statementMonth, 'Statement month')
    }

    const now = Date.now()
    const next = resolvePurchaseReconciliation({
      purchaseDate: existing.purchaseDate,
      requestedStatus: args.reconciliationStatus,
      requestedStatementMonth: args.statementMonth,
      existing,
      now,
    })

    const wasPosted = isPurchasePosted(existing.reconciliationStatus)
    const willBePosted = isPurchasePosted(next.reconciliationStatus)

    if (wasPosted && !willBePosted) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase_reversal',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    } else if (!wasPosted && willBePosted) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    }

    await ctx.db.patch(args.id, {
      reconciliationStatus: next.reconciliationStatus,
      statementMonth: next.statementMonth,
      postedAt: next.postedAt,
      reconciledAt: next.reconciledAt,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(existing._id),
      action: 'reconciliation_updated',
      before: {
        reconciliationStatus: existing.reconciliationStatus ?? 'posted',
        statementMonth: existing.statementMonth ?? existing.purchaseDate.slice(0, 7),
      },
      after: {
        reconciliationStatus: next.reconciliationStatus,
        statementMonth: next.statementMonth,
      },
    })
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

    const createdAccountId = await ctx.db.insert('accounts', {
      userId: identity.subject,
      name: args.name.trim(),
      type: args.type,
      balance: args.balance,
      liquid: args.liquid,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account',
      entityId: String(createdAccountId),
      action: 'created',
      after: {
        name: args.name.trim(),
        type: args.type,
        balance: args.balance,
        liquid: args.liquid,
      },
    })
  },
})

export const updateAccount = mutation({
  args: {
    id: v.id('accounts'),
    name: v.string(),
    type: accountTypeValidator,
    balance: v.number(),
    liquid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Account name')
    validateFinite(args.balance, 'Account balance')

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Account record not found.')

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      type: args.type,
      balance: args.balance,
      liquid: args.liquid,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        type: existing.type,
        balance: existing.balance,
        liquid: existing.liquid,
      },
      after: {
        name: args.name.trim(),
        type: args.type,
        balance: args.balance,
        liquid: args.liquid,
      },
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
    ensureOwned(existing, identity.subject, 'Account record not found.')

    const mappedIncomeEntries = await ctx.db
      .query('incomes')
      .withIndex('by_userId_destinationAccountId', (q) =>
        q.eq('userId', identity.subject).eq('destinationAccountId', args.id),
      )
      .collect()

    await Promise.all(
      mappedIncomeEntries.map((income) =>
        ctx.db.patch(income._id, {
          destinationAccountId: undefined,
        }),
      ),
    )

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        type: existing.type,
        balance: existing.balance,
        liquid: existing.liquid,
      },
      metadata: {
        detachedIncomeMappings: mappedIncomeEntries.length,
      },
    })
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

    const createdGoalId = await ctx.db.insert('goals', {
      userId: identity.subject,
      title: args.title.trim(),
      targetAmount: args.targetAmount,
      currentAmount: args.currentAmount,
      targetDate: args.targetDate,
      priority: args.priority,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(createdGoalId),
      action: 'created',
      after: {
        title: args.title.trim(),
        targetAmount: args.targetAmount,
        currentAmount: args.currentAmount,
        targetDate: args.targetDate,
        priority: args.priority,
      },
    })
  },
})

export const updateGoal = mutation({
  args: {
    id: v.id('goals'),
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

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Goal record not found.')

    await ctx.db.patch(args.id, {
      title: args.title.trim(),
      targetAmount: args.targetAmount,
      currentAmount: args.currentAmount,
      targetDate: args.targetDate,
      priority: args.priority,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(args.id),
      action: 'updated',
      before: {
        title: existing.title,
        targetAmount: existing.targetAmount,
        currentAmount: existing.currentAmount,
        targetDate: existing.targetDate,
        priority: existing.priority,
      },
      after: {
        title: args.title.trim(),
        targetAmount: args.targetAmount,
        currentAmount: args.currentAmount,
        targetDate: args.targetDate,
        priority: args.priority,
      },
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
    ensureOwned(existing, identity.subject, 'Goal record not found.')

    const beforeValue = existing.currentAmount

    await ctx.db.patch(args.id, {
      currentAmount: args.currentAmount,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(args.id),
      action: 'progress_updated',
      before: {
        currentAmount: beforeValue,
      },
      after: {
        currentAmount: args.currentAmount,
      },
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
    ensureOwned(existing, identity.subject, 'Goal record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(args.id),
      action: 'removed',
      before: {
        title: existing.title,
        targetAmount: existing.targetAmount,
        currentAmount: existing.currentAmount,
        targetDate: existing.targetDate,
        priority: existing.priority,
      },
    })
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
