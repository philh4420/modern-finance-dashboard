import type {
  AccountEntry,
  BillEntry,
  CardMinimumPaymentType,
  CardEntry,
  CycleAuditLogEntry,
  FinanceAuditEventEntry,
  FinancePreference,
  GoalEntry,
  IncomeEntry,
  IncomeChangeDirection,
  IncomeChangeEventEntry,
  IncomePaymentCheckEntry,
  IncomePaymentStatus,
  KpiSnapshot,
  LoanEntry,
  MonthCloseSnapshotEntry,
  MonthlyCycleRunEntry,
  PurchaseEntry,
  Summary,
} from './financeTypes'
import type { PrintReportConfig } from './PrintReportModal'
import {
  computeIncomeDeductionsTotal,
  resolveIncomeGrossAmount,
  resolveIncomeNetAmount,
  toMonthlyAmount,
} from '../lib/incomeMath'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'

type PrintReportProps = {
  config: PrintReportConfig
  preference: FinancePreference
  summary: Summary
  kpis: KpiSnapshot | null
  monthCloseSnapshots: MonthCloseSnapshotEntry[]
  incomes: IncomeEntry[]
  incomeChangeEvents: IncomeChangeEventEntry[]
  incomePaymentChecks: IncomePaymentCheckEntry[]
  bills: BillEntry[]
  cards: CardEntry[]
  loans: LoanEntry[]
  accounts: AccountEntry[]
  goals: GoalEntry[]
  purchases: PurchaseEntry[]
  cycleAuditLogs: CycleAuditLogEntry[]
  monthlyCycleRuns: MonthlyCycleRunEntry[]
  financeAuditEvents: FinanceAuditEventEntry[]
  formatMoney: (value: number) => string
  cycleDateLabel: Intl.DateTimeFormat
}

const normalizeText = (value: string) => value.trim().toLowerCase()

const isGenericCategory = (value: string) => {
  const normalized = normalizeText(value)
  return normalized.length === 0 || normalized === 'uncategorized' || normalized === 'other' || normalized === 'misc'
}

const monthKeyFromPurchase = (purchase: PurchaseEntry) => {
  if (typeof purchase.purchaseDate === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchaseDate)) {
      return purchase.purchaseDate.slice(0, 7)
    }
    if (/^\d{4}-\d{2}$/.test(purchase.purchaseDate)) {
      return purchase.purchaseDate
    }
  }
  if (purchase.statementMonth && /^\d{4}-\d{2}$/.test(purchase.statementMonth)) {
    return purchase.statementMonth
  }
  return new Date(purchase.createdAt).toISOString().slice(0, 7)
}

const inMonthRange = (monthKey: string, startMonth: string, endMonth: string) =>
  monthKey >= startMonth && monthKey <= endMonth

const formatMonthLabel = (locale: string, monthKey: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01T00:00:00`))

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const sumBy = <T,>(values: T[], selector: (value: T) => number) =>
  values.reduce((sum, entry) => sum + selector(entry), 0)

const monthsBetweenInclusive = (startMonth: string, endMonth: string) => {
  const [sy, sm] = startMonth.split('-').map((part) => Number(part))
  const [ey, em] = endMonth.split('-').map((part) => Number(part))
  if (!Number.isFinite(sy) || !Number.isFinite(sm) || !Number.isFinite(ey) || !Number.isFinite(em)) return 1
  return (ey - sy) * 12 + (em - sm) + 1
}

type CardProjectionRow = {
  monthIndex: number
  startBalance: number
  interest: number
  minimumDue: number
  plannedPayment: number
  plannedSpend: number
  endingBalance: number
  endingUtilization: number
}

type CardReportRow = {
  id: string
  name: string
  limit: number
  currentInput: number
  statementInput: number
  pendingCharges: number
  minimumPaymentType: CardMinimumPaymentType
  minimumPayment: number
  minimumPaymentPercent: number
  extraPayment: number
  plannedSpend: number
  apr: number
  statementDay: number
  dueDay: number
  dueInDays: number
  dueApplied: boolean
  interestAmount: number
  newStatementBalance: number
  minimumDue: number
  plannedPayment: number
  dueAdjustedCurrent: number
  displayCurrentBalance: number
  displayAvailableCredit: number
  displayUtilization: number
  projectedUtilizationAfterPayment: number
  projectedNextMonthInterest: number
  projected12MonthInterestCost: number
  projectionRows: CardProjectionRow[]
  overLimit: boolean
  paymentBelowInterest: boolean
}

type PayoffStrategy = 'avalanche' | 'snowball'
type RiskSeverity = 'watch' | 'warning' | 'critical'

type CardRiskAlert = {
  id: string
  severity: RiskSeverity
  title: string
  detail: string
}

type PayoffCard = {
  id: string
  name: string
  balance: number
  apr: number
  monthlyInterest: number
  utilization: number
  minimumDue: number
  plannedPayment: number
}

type IncomePaymentReliabilitySummary = {
  total: number
  onTime: number
  late: number
  missed: number
  onTimeRate: number
  lateStreak: number
  missedStreak: number
  lateOrMissedStreak: number
  score: number | null
  lastStatus: IncomePaymentStatus | null
}

type IncomeStatusTag = 'confirmed' | 'pending' | 'at_risk' | 'missed'

const incomePaymentStatusLabel = (status: IncomePaymentStatus) => {
  if (status === 'on_time') return 'On time'
  if (status === 'late') return 'Late'
  return 'Missed'
}

const incomeStatusLabel = (status: IncomeStatusTag) => {
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'at_risk') return 'At-risk'
  if (status === 'missed') return 'Missed'
  return 'Pending'
}

const incomeChangeDirectionLabel = (direction: IncomeChangeDirection) => {
  if (direction === 'increase') return 'Increase'
  if (direction === 'decrease') return 'Decrease'
  return 'No change'
}

const resolveIncomeStatusTag = (args: {
  currentCycleStatus: IncomePaymentStatus | null
  reliability: IncomePaymentReliabilitySummary
  hasActualPaidAmount: boolean
}): IncomeStatusTag => {
  if (args.currentCycleStatus === 'missed') return 'missed'
  if (args.currentCycleStatus === 'late') return 'at_risk'
  if (args.currentCycleStatus === 'on_time') return 'confirmed'

  if (args.reliability.missedStreak > 0) return 'missed'
  if (args.reliability.lateOrMissedStreak > 0) return 'at_risk'
  if (args.reliability.lastStatus === 'on_time' || args.hasActualPaidAmount) return 'confirmed'
  return 'pending'
}

const calculateIncomePaymentReliability = (
  entries: IncomePaymentCheckEntry[],
): IncomePaymentReliabilitySummary => {
  if (entries.length === 0) {
    return {
      total: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      onTimeRate: 0,
      lateStreak: 0,
      missedStreak: 0,
      lateOrMissedStreak: 0,
      score: null,
      lastStatus: null,
    }
  }

  const sorted = [...entries].sort((left, right) => {
    const byMonth = right.cycleMonth.localeCompare(left.cycleMonth)
    if (byMonth !== 0) return byMonth
    return right.updatedAt - left.updatedAt
  })

  const onTime = sorted.filter((entry) => entry.status === 'on_time').length
  const late = sorted.filter((entry) => entry.status === 'late').length
  const missed = sorted.filter((entry) => entry.status === 'missed').length
  const total = sorted.length
  const onTimeRate = total > 0 ? onTime / total : 0

  const streakFor = (status: IncomePaymentStatus) => {
    let streak = 0
    for (const entry of sorted) {
      if (entry.status !== status) break
      streak += 1
    }
    return streak
  }

  let lateOrMissedStreak = 0
  for (const entry of sorted) {
    if (entry.status === 'on_time') break
    lateOrMissedStreak += 1
  }

  const lateStreak = streakFor('late')
  const missedStreak = streakFor('missed')
  const score = clamp(Math.round(onTimeRate * 100 - lateOrMissedStreak * 12 - missedStreak * 6), 0, 100)

  return {
    total,
    onTime,
    late,
    missed,
    onTimeRate,
    lateStreak,
    missedStreak,
    lateOrMissedStreak,
    score,
    lastStatus: sorted[0]?.status ?? null,
  }
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toNonNegativeNumber = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : 0

const toDayOfMonth = (value: number | undefined | null, fallback: number) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31) {
    return value
  }
  return fallback
}

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000)

const dueTimingForDay = (dueDay: number) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dueThisMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, daysInThisMonth))
  const dueApplied = dueThisMonth <= today

  if (!dueApplied) {
    return {
      dueApplied: false,
      dueInDays: daysBetween(today, dueThisMonth),
    }
  }

  const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
  const nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dueDay, daysInNextMonth))
  return {
    dueApplied: true,
    dueInDays: daysBetween(today, nextDueDate),
  }
}

const utilizationFor = (used: number, limit: number) => (limit > 0 ? used / limit : 0)
const clampPercent = (value: number) => clamp(value, 0, 100)

const normalizeCardMinimumPaymentType = (
  value: CardMinimumPaymentType | undefined | null,
): CardMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const describeMinimumConfig = (card: CardReportRow) =>
  card.minimumPaymentType === 'percent_plus_interest'
    ? `${card.minimumPaymentPercent.toFixed(2)}% + interest`
    : `Fixed ${card.minimumPayment.toFixed(2)}`

const formatDueCountdown = (days: number) => (days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`)

const utilizationSeverityFor = (utilization: number): RiskSeverity | null => {
  if (utilization >= 0.9) return 'critical'
  if (utilization >= 0.5) return 'warning'
  if (utilization >= 0.3) return 'watch'
  return null
}

const getOverpayPriority = (entry: PayoffCard, strategy: PayoffStrategy) =>
  strategy === 'avalanche' ? entry.apr : -entry.balance

const rankPayoffCards = (rows: PayoffCard[], strategy: PayoffStrategy) =>
  [...rows].sort((left, right) => {
    if (strategy === 'avalanche') {
      if (right.apr !== left.apr) {
        return right.apr - left.apr
      }
      if (right.monthlyInterest !== left.monthlyInterest) {
        return right.monthlyInterest - left.monthlyInterest
      }
      if (right.balance !== left.balance) {
        return right.balance - left.balance
      }
    } else {
      if (left.balance !== right.balance) {
        return left.balance - right.balance
      }
      if (right.apr !== left.apr) {
        return right.apr - left.apr
      }
      if (right.monthlyInterest !== left.monthlyInterest) {
        return right.monthlyInterest - left.monthlyInterest
      }
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })

const buildCardProjectionRows = (input: {
  months: number
  startStatementBalance: number
  limit: number
  monthlyRate: number
  minimumPaymentType: CardMinimumPaymentType
  minimumPayment: number
  minimumPaymentPercent: number
  extraPayment: number
  plannedSpend: number
}) => {
  const rows: CardProjectionRow[] = []
  let statementBalance = Math.max(input.startStatementBalance, 0)

  for (let monthIndex = 1; monthIndex <= input.months; monthIndex += 1) {
    const interest = statementBalance * input.monthlyRate
    const dueBalance = statementBalance + interest
    const minimumDueRaw =
      input.minimumPaymentType === 'percent_plus_interest'
        ? statementBalance * (input.minimumPaymentPercent / 100) + interest
        : input.minimumPayment
    const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
    const plannedPayment = Math.min(dueBalance, minimumDue + input.extraPayment)
    const endingBalance = Math.max(dueBalance - plannedPayment, 0) + input.plannedSpend

    rows.push({
      monthIndex,
      startBalance: roundCurrency(statementBalance),
      interest: roundCurrency(interest),
      minimumDue: roundCurrency(minimumDue),
      plannedPayment: roundCurrency(plannedPayment),
      plannedSpend: roundCurrency(input.plannedSpend),
      endingBalance: roundCurrency(endingBalance),
      endingUtilization: utilizationFor(endingBalance, input.limit),
    })

    statementBalance = endingBalance
  }

  return rows
}

const projectCardReportRow = (card: CardEntry): CardReportRow => {
  const limit = toNonNegativeNumber(card.creditLimit)
  const currentInput = toNonNegativeNumber(card.usedLimit)
  const statementInput = toNonNegativeNumber(card.statementBalance ?? card.usedLimit)
  const pendingCharges = toNonNegativeNumber(card.pendingCharges ?? Math.max(currentInput - statementInput, 0))
  const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
  const minimumPayment = toNonNegativeNumber(card.minimumPayment)
  const minimumPaymentPercent = clampPercent(toNonNegativeNumber(card.minimumPaymentPercent))
  const extraPayment = toNonNegativeNumber(card.extraPayment)
  const plannedSpend = toNonNegativeNumber(card.spendPerMonth)
  const apr = toNonNegativeNumber(card.interestRate)
  const statementDay = toDayOfMonth(card.statementDay, 1)
  const dueDay = toDayOfMonth(card.dueDay, 21)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = roundCurrency(statementInput * monthlyRate)
  const newStatementBalance = roundCurrency(statementInput + interestAmount)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? statementInput * (minimumPaymentPercent / 100) + interestAmount
      : minimumPayment
  const minimumDue = roundCurrency(Math.min(newStatementBalance, Math.max(minimumDueRaw, 0)))
  const plannedPayment = roundCurrency(Math.min(newStatementBalance, minimumDue + extraPayment))
  const dueAdjustedCurrent = roundCurrency(Math.max(newStatementBalance - plannedPayment, 0) + pendingCharges)
  const projectedUtilizationAfterPayment = utilizationFor(dueAdjustedCurrent, limit)
  const dueTiming = dueTimingForDay(dueDay)
  const displayCurrentBalance = roundCurrency(dueTiming.dueApplied ? dueAdjustedCurrent : currentInput)
  const displayAvailableCredit = roundCurrency(limit - displayCurrentBalance)
  const displayUtilization = utilizationFor(displayCurrentBalance, limit)
  const projectionRows = buildCardProjectionRows({
    months: 12,
    startStatementBalance: dueAdjustedCurrent,
    limit,
    monthlyRate,
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    plannedSpend,
  })
  const projectedNextMonthInterest = projectionRows[0]?.interest ?? 0
  const projected12MonthInterestCost = roundCurrency(sumBy(projectionRows, (row) => row.interest))

  return {
    id: String(card._id),
    name: card.name,
    limit,
    currentInput,
    statementInput,
    pendingCharges,
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    plannedSpend,
    apr,
    statementDay,
    dueDay,
    dueInDays: dueTiming.dueInDays,
    dueApplied: dueTiming.dueApplied,
    interestAmount,
    newStatementBalance,
    minimumDue,
    plannedPayment,
    dueAdjustedCurrent,
    displayCurrentBalance,
    displayAvailableCredit,
    displayUtilization,
    projectedUtilizationAfterPayment,
    projectedNextMonthInterest,
    projected12MonthInterestCost,
    projectionRows,
    overLimit: displayCurrentBalance > limit + 0.000001,
    paymentBelowInterest: plannedPayment + 0.01 < interestAmount,
  }
}

export function PrintReport({
  config,
  preference,
  summary,
  kpis,
  monthCloseSnapshots,
  incomes,
  incomeChangeEvents,
  incomePaymentChecks,
  bills,
  cards,
  loans,
  accounts,
  goals,
  purchases,
  cycleAuditLogs,
  monthlyCycleRuns,
  financeAuditEvents,
  formatMoney,
  cycleDateLabel,
}: PrintReportProps) {
  const locale = preference.locale || 'en-US'
  const generatedAt = new Date()
  const currentCycleMonth = generatedAt.toISOString().slice(0, 7)
  const rangeMonths = monthsBetweenInclusive(config.startMonth, config.endMonth)

  const purchasesInRange = purchases
    .map((purchase) => ({ purchase, monthKey: monthKeyFromPurchase(purchase) }))
    .filter((row) => inMonthRange(row.monthKey, config.startMonth, config.endMonth))

  const purchasesTotal = sumBy(purchasesInRange, (row) => row.purchase.amount)

  const monthGroups = new Map<string, PurchaseEntry[]>()
  purchasesInRange.forEach((row) => {
    const current = monthGroups.get(row.monthKey) ?? []
    current.push(row.purchase)
    monthGroups.set(row.monthKey, current)
  })

  const sortedMonthKeys = Array.from(monthGroups.keys()).sort()
  const snapshotsInRange = monthCloseSnapshots
    .filter((snapshot) => inMonthRange(snapshot.cycleKey, config.startMonth, config.endMonth))
    .sort((a, b) => a.cycleKey.localeCompare(b.cycleKey))

  const rangeKpis = (() => {
    if (purchasesInRange.length === 0) {
      return {
        purchaseCount: 0,
        pendingCount: 0,
        missingCategoryCount: 0,
        duplicateCount: 0,
        anomalyCount: 0,
        reconciliationCompletionRate: 1,
      }
    }

    const purchaseCount = purchasesInRange.length
    const pendingCount = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'pending').length
    const missingCategoryCount = purchasesInRange.filter((row) => isGenericCategory(row.purchase.category)).length

    const duplicateMap = new Map<string, number>()
    purchasesInRange.forEach((row) => {
      const purchase = row.purchase
      const key = `${normalizeText(purchase.item)}::${Math.round(purchase.amount * 100) / 100}::${purchase.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = Array.from(duplicateMap.values()).filter((count) => count > 1).length

    const amounts = purchasesInRange.map((row) => row.purchase.amount)
    const mean = amounts.reduce((sum, value) => sum + value, 0) / Math.max(amounts.length, 1)
    const variance =
      amounts.length > 1
        ? amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (amounts.length - 1)
        : 0
    const std = Math.sqrt(variance)
    const anomalyCount = purchasesInRange.filter((row) => std > 0 && row.purchase.amount > mean + std * 2.5 && row.purchase.amount > 50).length

    const postedOrReconciled = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') !== 'pending')
    const reconciled = postedOrReconciled.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'reconciled').length
    const reconciliationCompletionRate = postedOrReconciled.length > 0 ? reconciled / postedOrReconciled.length : 1

    return {
      purchaseCount,
      pendingCount,
      missingCategoryCount,
      duplicateCount,
      anomalyCount,
      reconciliationCompletionRate,
    }
  })()

  const purchasesByStatus = {
    pending: purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'pending').length,
    posted: purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'posted').length,
    reconciled: purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'reconciled').length,
  }

  const categoryTotals = new Map<string, number>()
  purchasesInRange.forEach((row) => {
    const key = row.purchase.category.trim() || 'Uncategorized'
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + row.purchase.amount)
  })

  const topPurchaseCategories = Array.from(categoryTotals.entries())
    .map(([category, total]) => ({
      category,
      total: roundCurrency(total),
      share: purchasesTotal > 0 ? total / purchasesTotal : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  const monthlyPurchaseTotals = sortedMonthKeys.map((key) => {
    const monthTotal = sumBy(monthGroups.get(key) ?? [], (purchase) => purchase.amount)
    return {
      key,
      total: roundCurrency(monthTotal),
    }
  })

  const avgMonthlyPurchases = rangeMonths > 0 ? roundCurrency(purchasesTotal / rangeMonths) : 0
  const projectedMonthlyNetAfterPurchases = roundCurrency(summary.monthlyIncome - summary.monthlyCommitments - avgMonthlyPurchases)
  const incomePaymentChecksByIncomeId = incomePaymentChecks.reduce((map, entry) => {
    const key = String(entry.incomeId)
    const current = map.get(key) ?? []
    current.push(entry)
    map.set(key, current)
    return map
  }, new Map<string, IncomePaymentCheckEntry[]>())
  const accountNameById = accounts.reduce((map, account) => {
    map.set(String(account._id), account.name)
    return map
  }, new Map<string, string>())
  const overallIncomePaymentReliability = calculateIncomePaymentReliability(incomePaymentChecks)
  const incomeExpectations = incomes.reduce(
    (totals, income) => {
      const plannedNet = resolveIncomeNetAmount(income)
      const plannedMonthly = toMonthlyAmount(plannedNet, income.cadence, income.customInterval, income.customUnit)
      totals.plannedMonthly += plannedMonthly

      if (typeof income.actualAmount === 'number' && Number.isFinite(income.actualAmount)) {
        totals.trackedCount += 1
        totals.expectedTrackedMonthly += plannedMonthly
        totals.actualTrackedMonthly += toMonthlyAmount(
          Math.max(income.actualAmount, 0),
          income.cadence,
          income.customInterval,
          income.customUnit,
        )
      }

      return totals
    },
    { plannedMonthly: 0, expectedTrackedMonthly: 0, actualTrackedMonthly: 0, trackedCount: 0 },
  )
  const incomeVarianceMonthly = roundCurrency(
    incomeExpectations.actualTrackedMonthly - incomeExpectations.expectedTrackedMonthly,
  )
  const incomePendingCount = Math.max(incomes.length - incomeExpectations.trackedCount, 0)
  const incomeNameById = incomes.reduce((map, income) => {
    map.set(String(income._id), income.source)
    return map
  }, new Map<string, string>())
  const incomeChangeEventsInRange = [...incomeChangeEvents]
    .filter((event) => {
      if (/^\d{4}-\d{2}/.test(event.effectiveDate)) {
        return inMonthRange(event.effectiveDate.slice(0, 7), config.startMonth, config.endMonth)
      }
      return true
    })
    .sort((left, right) => {
      const byDate = right.effectiveDate.localeCompare(left.effectiveDate)
      if (byDate !== 0) return byDate
      return right.createdAt - left.createdAt
    })
  const incomeChangeSummary = incomeChangeEventsInRange.reduce(
    (totals, event) => {
      if (event.direction === 'increase') totals.increase += 1
      if (event.direction === 'decrease') totals.decrease += 1
      if (event.direction === 'no_change') totals.noChange += 1
      totals.netDelta += event.deltaAmount
      return totals
    },
    { increase: 0, decrease: 0, noChange: 0, netDelta: 0 },
  )

  const filteredAuditLogs = config.includeAuditLogs
    ? {
        cycleAuditLogs: cycleAuditLogs
          .filter((entry) => (entry.cycleKey ? inMonthRange(entry.cycleKey, config.startMonth, config.endMonth) : false))
          .sort((a, b) => b.ranAt - a.ranAt),
        monthlyCycleRuns: monthlyCycleRuns
          .filter((run) => inMonthRange(run.cycleKey, config.startMonth, config.endMonth))
          .sort((a, b) => b.ranAt - a.ranAt),
        financeAuditEvents: financeAuditEvents
          .filter((event) => {
            const key = new Date(event.createdAt).toISOString().slice(0, 7)
            return inMonthRange(key, config.startMonth, config.endMonth)
          })
          .sort((a, b) => b.createdAt - a.createdAt),
      }
    : null

  const baselineRangeNet =
    summary.monthlyIncome * rangeMonths - summary.monthlyCommitments * rangeMonths - purchasesTotal

  const cardRows = cards.map((card) => projectCardReportRow(card))
  const cardLimitTotal = sumBy(cardRows, (row) => row.limit)
  const dueAdjustedCurrentTotal = sumBy(cardRows, (row) => row.displayCurrentBalance)
  const projectedPostPaymentBalanceTotal = sumBy(cardRows, (row) => row.dueAdjustedCurrent)
  const estimatedMinimumDueTotal = sumBy(cardRows, (row) => row.minimumDue)
  const plannedPaymentTotal = sumBy(cardRows, (row) => row.plannedPayment)
  const pendingChargesTotal = sumBy(cardRows, (row) => row.pendingCharges)
  const newStatementsTotal = sumBy(cardRows, (row) => row.newStatementBalance)
  const availableCreditTotal = sumBy(cardRows, (row) => row.displayAvailableCredit)
  const projectedNextMonthInterestTotal = sumBy(cardRows, (row) => row.projectedNextMonthInterest)
  const projected12MonthInterestTotal = sumBy(cardRows, (row) => row.projected12MonthInterestCost)
  const dueAdjustedUtilizationPercent = utilizationFor(dueAdjustedCurrentTotal, cardLimitTotal)
  const projectedUtilizationAfterPaymentPortfolio = utilizationFor(projectedPostPaymentBalanceTotal, cardLimitTotal)
  const weightedAprPercent =
    dueAdjustedCurrentTotal > 0
      ? sumBy(cardRows, (row) => Math.max(row.displayCurrentBalance, 0) * row.apr) / dueAdjustedCurrentTotal
      : 0
  const utilizationTrendDeltaPp = (projectedUtilizationAfterPaymentPortfolio - dueAdjustedUtilizationPercent) * 100
  const utilizationTrendDirection =
    utilizationTrendDeltaPp < -0.05 ? 'down' : utilizationTrendDeltaPp > 0.05 ? 'up' : 'flat'

  const cardRiskAlerts = (() => {
    const alerts: CardRiskAlert[] = []

    cardRows.forEach((row) => {
      if (row.displayCurrentBalance > 0 && row.dueInDays <= 14) {
        const dueSeverity: RiskSeverity = row.dueInDays <= 1 ? 'critical' : row.dueInDays <= 3 ? 'warning' : 'watch'
        alerts.push({
          id: `due-${row.id}`,
          severity: dueSeverity,
          title: `${row.name}: ${formatDueCountdown(row.dueInDays)}`,
          detail: `Due day ${row.dueDay} · planned payment ${formatMoney(row.plannedPayment)}`,
        })
      }

      const utilizationSeverity = utilizationSeverityFor(row.displayUtilization)
      if (utilizationSeverity) {
        alerts.push({
          id: `util-${row.id}`,
          severity: utilizationSeverity,
          title: `${row.name}: utilization ${formatPercent(row.displayUtilization)}`,
          detail: `Threshold hit (>30/50/90) · available credit ${formatMoney(row.displayAvailableCredit)}`,
        })
      }

      if (row.paymentBelowInterest) {
        alerts.push({
          id: `interest-${row.id}`,
          severity: 'critical',
          title: `${row.name}: payment below interest`,
          detail: `Planned ${formatMoney(row.plannedPayment)} is below interest ${formatMoney(row.interestAmount)}.`,
        })
      }

      if (row.overLimit) {
        alerts.push({
          id: `over-limit-${row.id}`,
          severity: 'critical',
          title: `${row.name}: over credit limit`,
          detail: `Current ${formatMoney(row.displayCurrentBalance)} against ${formatMoney(row.limit)} limit.`,
        })
      }
    })

    const severityRank: Record<RiskSeverity, number> = {
      critical: 3,
      warning: 2,
      watch: 1,
    }

    return alerts.sort((left, right) => {
      const severityDelta = severityRank[right.severity] - severityRank[left.severity]
      if (severityDelta !== 0) {
        return severityDelta
      }
      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    })
  })()

  const riskSummary = {
    critical: cardRiskAlerts.filter((alert) => alert.severity === 'critical').length,
    warning: cardRiskAlerts.filter((alert) => alert.severity === 'warning').length,
    watch: cardRiskAlerts.filter((alert) => alert.severity === 'watch').length,
  }

  const payoffCards: PayoffCard[] = cardRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      balance: roundCurrency(Math.max(row.displayCurrentBalance, 0)),
      apr: row.apr,
      monthlyInterest: row.interestAmount,
      utilization: row.displayUtilization,
      minimumDue: row.minimumDue,
      plannedPayment: row.plannedPayment,
    }))
    .filter((entry) => entry.balance > 0)

  const avalancheRanking = rankPayoffCards(payoffCards, 'avalanche')
  const snowballRanking = rankPayoffCards(payoffCards, 'snowball')
  const avalancheTarget = avalancheRanking[0] ?? null
  const snowballTarget = snowballRanking[0] ?? null

  return (
    <article className="print-report" aria-label="Print report">
      <header className="print-cover">
        <div>
          <p className="print-kicker">Adaptive Finance OS</p>
          <h1 className="print-title">Personal Finance Report</h1>
          <p className="print-meta">
            Range {config.startMonth} to {config.endMonth} ({rangeMonths} month{rangeMonths === 1 ? '' : 's'}) • Generated{' '}
            {generatedAt.toLocaleString(locale)} • {preference.currency} / {preference.locale}
          </p>
        </div>
        <div className="print-badge">
          <strong>{formatMoney(purchasesTotal)}</strong>
          <span>purchases in range</span>
        </div>
      </header>

      {config.includeDashboard ? (
        <>
          <section className="print-section print-section--summary">
            <h2>Summary</h2>
            <div className="print-summary-grid">
              <div className="print-summary-card">
                <p>Baseline income (monthly)</p>
                <strong>{formatMoney(summary.monthlyIncome)}</strong>
                <small>{formatMoney(summary.monthlyIncome * rangeMonths)} over range</small>
              </div>
              <div className="print-summary-card">
                <p>Baseline commitments (monthly)</p>
                <strong>{formatMoney(summary.monthlyCommitments)}</strong>
                <small>{formatMoney(summary.monthlyCommitments * rangeMonths)} over range</small>
              </div>
              <div className="print-summary-card">
                <p>Purchases (range)</p>
                <strong>{formatMoney(purchasesTotal)}</strong>
                <small>
                  {sortedMonthKeys.length > 0
                    ? `${sortedMonthKeys.length} month group${sortedMonthKeys.length === 1 ? '' : 's'}`
                    : 'No purchases'}
                </small>
              </div>
              <div className="print-summary-card">
                <p>Baseline net (range)</p>
                <strong>{formatMoney(baselineRangeNet)}</strong>
                <small>income - commitments - purchases</small>
              </div>
            </div>

            <div className="print-kpi-grid">
              <div className="print-kpi">
                <p>Reconciliation</p>
                <strong>{formatPercent(rangeKpis.reconciliationCompletionRate)}</strong>
                <small>
                  {rangeKpis.purchaseCount} purchases • {rangeKpis.pendingCount} pending
                </small>
              </div>
              <div className="print-kpi">
                <p>Missing categories</p>
                <strong>
                  {rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.missingCategoryCount / rangeKpis.purchaseCount) : '0%'}
                </strong>
                <small>{rangeKpis.missingCategoryCount} flagged</small>
              </div>
              <div className="print-kpi">
                <p>Duplicates</p>
                <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.duplicateCount / rangeKpis.purchaseCount) : '0%'}</strong>
                <small>{rangeKpis.duplicateCount} possible groups</small>
              </div>
              <div className="print-kpi">
                <p>Anomalies</p>
                <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.anomalyCount / rangeKpis.purchaseCount) : '0%'}</strong>
                <small>{rangeKpis.anomalyCount} outliers</small>
              </div>
            </div>

            {kpis ? (
              <p className="print-subnote">
                Trust KPIs (last {kpis.windowDays} days): accuracy {formatPercent(kpis.accuracyRate)}
                {kpis.syncFailureRate === null ? '' : ` • sync failures ${formatPercent(kpis.syncFailureRate)}`} • cycle
                success {formatPercent(kpis.cycleSuccessRate)} • reconciliation {formatPercent(kpis.reconciliationCompletionRate)}.
              </p>
            ) : null}
          </section>

          <section className="print-section print-section--component">
            <h2>Month Close Snapshots</h2>
            {snapshotsInRange.length === 0 ? (
              <p className="print-subnote">
                No month-close snapshots recorded in this range yet. Run monthly cycle to generate snapshots.
              </p>
            ) : (
              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Income</th>
                      <th scope="col">Commitments</th>
                      <th scope="col">Liabilities</th>
                      <th scope="col">Net Worth</th>
                      <th scope="col">Runway</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotsInRange.map((snapshot) => (
                      <tr key={snapshot._id}>
                        <td>{snapshot.cycleKey}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.monthlyIncome)}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.monthlyCommitments)}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.totalLiabilities)}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.netWorth)}</td>
                        <td>{snapshot.summary.runwayMonths.toFixed(1)} mo</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {config.includeIncome ? (
        <section className="print-section print-section--component">
          <h2>Income</h2>
          {incomes.length === 0 ? (
            <p className="print-subnote">No income entries.</p>
          ) : (
            <>
              <div className="print-kpi-grid">
                <div className="print-kpi">
                  <p>Planned net (monthly)</p>
                  <strong>{formatMoney(incomeExpectations.plannedMonthly)}</strong>
                  <small>{formatMoney(incomeExpectations.plannedMonthly * rangeMonths)} over range</small>
                </div>
                <div className="print-kpi">
                  <p>Actual received (tracked monthly)</p>
                  <strong>{formatMoney(incomeExpectations.actualTrackedMonthly)}</strong>
                  <small>{formatMoney(incomeExpectations.actualTrackedMonthly * rangeMonths)} over range</small>
                </div>
                <div className="print-kpi">
                  <p>Variance (tracked monthly)</p>
                  <strong>{formatMoney(incomeVarianceMonthly)}</strong>
                  <small>{formatMoney(incomeVarianceMonthly * rangeMonths)} over range</small>
                </div>
                <div className="print-kpi">
                  <p>Tracking coverage</p>
                  <strong>
                    {incomeExpectations.trackedCount}/{incomes.length}
                  </strong>
                  <small>{incomePendingCount} pending actual value{incomePendingCount === 1 ? '' : 's'}</small>
                </div>
                <div className="print-kpi">
                  <p>Payment reliability score</p>
                  <strong>
                    {overallIncomePaymentReliability.score !== null
                      ? `${overallIncomePaymentReliability.score}/100`
                      : 'n/a'}
                  </strong>
                  <small>
                    {(overallIncomePaymentReliability.onTimeRate * 100).toFixed(0)}% on-time ·{' '}
                    {overallIncomePaymentReliability.total} log
                    {overallIncomePaymentReliability.total === 1 ? '' : 's'}
                  </small>
                </div>
                <div className="print-kpi">
                  <p>Late/missed streaks</p>
                  <strong>
                    {overallIncomePaymentReliability.lateStreak} late ·{' '}
                    {overallIncomePaymentReliability.missedStreak} missed
                  </strong>
                  <small>
                    Current combined late/missed streak: {overallIncomePaymentReliability.lateOrMissedStreak}
                  </small>
                </div>
              </div>

              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Gross</th>
                      <th scope="col">Deductions</th>
                      <th scope="col">Planned Net</th>
                      <th scope="col">Actual Paid</th>
                      <th scope="col">Variance</th>
                      <th scope="col">Reliability</th>
                      <th scope="col">Latest Status</th>
                      <th scope="col">Income Status</th>
                      <th scope="col">Landing Account</th>
                      <th scope="col">Cadence</th>
                      <th scope="col">Forecast Smoothing</th>
                      <th scope="col">Received</th>
                      <th scope="col">Anchor</th>
                      <th scope="col">Next Payday</th>
                      {config.includeNotes ? <th scope="col">Notes / refs</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {incomes.map((income) => {
                      const grossAmount = resolveIncomeGrossAmount(income)
                      const deductionTotal = computeIncomeDeductionsTotal(income)
                      const netAmount = resolveIncomeNetAmount(income)
                      const actualPaidAmount =
                        typeof income.actualAmount === 'number' && Number.isFinite(income.actualAmount)
                          ? roundCurrency(Math.max(income.actualAmount, 0))
                          : undefined
                      const varianceAmount =
                        actualPaidAmount !== undefined ? roundCurrency(actualPaidAmount - netAmount) : undefined
                      const paymentHistory = incomePaymentChecksByIncomeId.get(String(income._id)) ?? []
                      const reliability = calculateIncomePaymentReliability(paymentHistory)
                      const latestPaymentEntry =
                        [...paymentHistory].sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
                      const currentCycleCheck =
                        paymentHistory.find((entry) => entry.cycleMonth === currentCycleMonth) ?? null
                      const incomeStatus = resolveIncomeStatusTag({
                        currentCycleStatus: currentCycleCheck?.status ?? null,
                        reliability,
                        hasActualPaidAmount: actualPaidAmount !== undefined,
                      })
                      const nextPayday = nextDateForCadence({
                        cadence: income.cadence,
                        createdAt: income.createdAt,
                        dayOfMonth: income.receivedDay,
                        customInterval: income.customInterval ?? undefined,
                        customUnit: income.customUnit ?? undefined,
                        payDateAnchor: income.payDateAnchor,
                      })
                      const notesAndReferences = [
                        income.employerNote ? `Employer: ${income.employerNote}` : null,
                        latestPaymentEntry?.paymentReference
                          ? `Payment ref: ${latestPaymentEntry.paymentReference}`
                          : null,
                        latestPaymentEntry?.payslipReference
                          ? `Payslip ref: ${latestPaymentEntry.payslipReference}`
                          : null,
                        income.notes ? `Note: ${income.notes}` : null,
                      ]
                        .filter((value): value is string => Boolean(value))
                        .join(' | ')

                      return (
                        <tr key={income._id}>
                          <td>{income.source}</td>
                          <td className="table-amount">{formatMoney(grossAmount)}</td>
                          <td className="table-amount">{formatMoney(deductionTotal)}</td>
                          <td className="table-amount">{formatMoney(netAmount)}</td>
                          <td className="table-amount">{actualPaidAmount !== undefined ? formatMoney(actualPaidAmount) : 'n/a'}</td>
                          <td className="table-amount">{varianceAmount !== undefined ? formatMoney(varianceAmount) : 'n/a'}</td>
                          <td>
                            {reliability.score !== null
                              ? `${reliability.score}/100 · ${(reliability.onTimeRate * 100).toFixed(0)}% on-time`
                              : 'n/a'}
                          </td>
                          <td>
                            {reliability.lastStatus
                              ? `${incomePaymentStatusLabel(reliability.lastStatus)} · late ${reliability.lateStreak} · missed ${reliability.missedStreak}`
                              : 'n/a'}
                          </td>
                          <td>{incomeStatusLabel(incomeStatus)}</td>
                          <td>
                            {income.destinationAccountId
                              ? accountNameById.get(String(income.destinationAccountId)) ?? 'Missing account'
                              : 'Unassigned'}
                          </td>
                          <td>{income.cadence}</td>
                          <td>
                            {income.forecastSmoothingEnabled
                              ? `${Math.min(Math.max(Math.round(income.forecastSmoothingMonths ?? 6), 2), 24)}m lookback`
                              : 'Off'}
                          </td>
                          <td>{income.receivedDay ? `Day ${income.receivedDay}` : 'n/a'}</td>
                          <td>{income.payDateAnchor ?? 'n/a'}</td>
                          <td>{nextPayday ? toIsoDate(nextPayday) : 'n/a'}</td>
                          {config.includeNotes ? <td>{notesAndReferences}</td> : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="print-subhead">Income change history</h3>
              {incomeChangeEventsInRange.length === 0 ? (
                <p className="print-subnote">No salary change events in the selected range.</p>
              ) : (
                <>
                  <div className="print-kpi-grid">
                    <div className="print-kpi">
                      <p>Change events</p>
                      <strong>{incomeChangeEventsInRange.length}</strong>
                      <small>effective-dated updates in range</small>
                    </div>
                    <div className="print-kpi">
                      <p>Increases</p>
                      <strong>{incomeChangeSummary.increase}</strong>
                      <small>positive salary adjustments</small>
                    </div>
                    <div className="print-kpi">
                      <p>Decreases</p>
                      <strong>{incomeChangeSummary.decrease}</strong>
                      <small>negative salary adjustments</small>
                    </div>
                    <div className="print-kpi">
                      <p>No change entries</p>
                      <strong>{incomeChangeSummary.noChange}</strong>
                      <small>logged for audit consistency</small>
                    </div>
                    <div className="print-kpi">
                      <p>Net delta over range</p>
                      <strong>{formatMoney(roundCurrency(incomeChangeSummary.netDelta))}</strong>
                      <small>sum of all change deltas</small>
                    </div>
                  </div>

                  <div className="print-table-wrap">
                    <table className="print-table">
                      <thead>
                        <tr>
                          <th scope="col">Effective Date</th>
                          <th scope="col">Source</th>
                          <th scope="col">Direction</th>
                          <th scope="col">Previous</th>
                          <th scope="col">New</th>
                          <th scope="col">Delta</th>
                          {config.includeNotes ? <th scope="col">Note</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {incomeChangeEventsInRange.map((event) => (
                          <tr key={event._id}>
                            <td>{event.effectiveDate}</td>
                            <td>{incomeNameById.get(String(event.incomeId)) ?? 'Unknown source'}</td>
                            <td>{incomeChangeDirectionLabel(event.direction)}</td>
                            <td className="table-amount">{formatMoney(event.previousAmount)}</td>
                            <td className="table-amount">{formatMoney(event.newAmount)}</td>
                            <td className="table-amount">
                              {event.deltaAmount > 0 ? '+' : ''}
                              {formatMoney(event.deltaAmount)}
                            </td>
                            {config.includeNotes ? <td>{event.note ?? ''}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : null}

      {config.includeBills ? (
        <section className="print-section print-section--component">
          <h2>Bills</h2>
          {bills.length === 0 ? (
            <p className="print-subnote">No bill entries.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Due</th>
                    <th scope="col">Cadence</th>
                    <th scope="col">Autopay</th>
                    {config.includeNotes ? <th scope="col">Notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr key={bill._id}>
                      <td>{bill.name}</td>
                      <td className="table-amount">{formatMoney(bill.amount)}</td>
                      <td>Day {bill.dueDay}</td>
                      <td>{bill.cadence}</td>
                      <td>{bill.autopay ? 'yes' : 'no'}</td>
                      {config.includeNotes ? <td>{bill.notes ?? ''}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {config.includeCards ? (
        <section className="print-section print-section--component">
          <h2>Cards</h2>
          {cardRows.length === 0 ? (
            <p className="print-subnote">No card entries.</p>
          ) : (
            <>
            <div className="print-card-summary-grid">
              <div className="print-summary-card">
                <p>Due-adjusted card debt</p>
                <strong>{formatMoney(dueAdjustedCurrentTotal)}</strong>
                <small>
                  {cardRows.length} cards · {formatMoney(newStatementsTotal)} new statements
                </small>
              </div>
              <div className="print-summary-card">
                <p>Utilization trend</p>
                <strong>
                  {formatPercent(dueAdjustedUtilizationPercent)} to {formatPercent(projectedUtilizationAfterPaymentPortfolio)}
                </strong>
                <small>
                  {utilizationTrendDeltaPp >= 0 ? '+' : ''}
                  {utilizationTrendDeltaPp.toFixed(1)}pp ({utilizationTrendDirection})
                </small>
              </div>
              <div className="print-summary-card">
                <p>Minimums + planned payments</p>
                <strong>
                  {formatMoney(estimatedMinimumDueTotal)} / {formatMoney(plannedPaymentTotal)}
                </strong>
                <small>{formatMoney(pendingChargesTotal)} pending charges</small>
              </div>
              <div className="print-summary-card">
                <p>Interest outlook</p>
                <strong>
                  {formatMoney(projectedNextMonthInterestTotal)} next month
                </strong>
                <small>
                  {formatMoney(projected12MonthInterestTotal)} over 12 months · weighted APR {weightedAprPercent.toFixed(2)}%
                </small>
              </div>
            </div>

            <h3 className="print-subhead">Risk Alerts</h3>
            {cardRiskAlerts.length === 0 ? (
              <p className="print-subnote">No active card risk alerts.</p>
            ) : (
              <>
                <p className="print-subnote">
                  {riskSummary.critical} critical · {riskSummary.warning} warning · {riskSummary.watch} watch
                </p>
                <ul className="print-card-risk-list">
                  {cardRiskAlerts.map((alert) => (
                    <li key={alert.id} className={`print-card-risk-item print-card-risk-item--${alert.severity}`}>
                      <span className={`print-card-risk-pill print-card-risk-pill--${alert.severity}`}>{alert.severity}</span>
                      <strong>{alert.title}</strong>
                      <small>{alert.detail}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="print-subhead">Payoff Intelligence</h3>
            {payoffCards.length === 0 ? (
              <p className="print-subnote">All cards are fully paid. No overpay target right now.</p>
            ) : (
              <div className="print-card-payoff-grid">
                <div className="print-kpi">
                  <p>Avalanche target</p>
                  <strong>{avalancheTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {avalancheTarget
                      ? `${formatMoney(avalancheTarget.balance)} · ${avalancheTarget.apr.toFixed(2)}% APR · ${formatMoney(avalancheTarget.monthlyInterest)} monthly interest · ${formatMoney(avalancheTarget.minimumDue)} min due · ${formatMoney(avalancheTarget.plannedPayment)} planned · priority ${getOverpayPriority(avalancheTarget, 'avalanche').toFixed(2)}`
                      : 'No open card balances'}
                  </small>
                </div>
                <div className="print-kpi">
                  <p>Snowball target</p>
                  <strong>{snowballTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {snowballTarget
                      ? `${formatMoney(snowballTarget.balance)} · ${snowballTarget.apr.toFixed(2)}% APR · ${formatMoney(snowballTarget.monthlyInterest)} monthly interest · ${formatMoney(snowballTarget.minimumDue)} min due · ${formatMoney(snowballTarget.plannedPayment)} planned · priority ${getOverpayPriority(snowballTarget, 'snowball').toFixed(2)}`
                      : 'No open card balances'}
                  </small>
                </div>
              </div>
            )}

            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Card</th>
                    <th scope="col">Balances</th>
                    <th scope="col">New Statement</th>
                    <th scope="col">Min Config</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Due Cycle</th>
                    <th scope="col">Exposure</th>
                    <th scope="col">Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {cardRows.map((card) => (
                    <tr key={card.id}>
                      <td>
                        <strong>{card.name}</strong>
                        <br />
                        {formatMoney(card.limit)} limit
                      </td>
                      <td>
                        Current {formatMoney(card.displayCurrentBalance)}
                        <br />
                        Statement {formatMoney(card.statementInput)}
                        <br />
                        Pending {formatMoney(card.pendingCharges)}
                      </td>
                      <td className="table-amount">{formatMoney(card.newStatementBalance)}</td>
                      <td>
                        {describeMinimumConfig(card)}
                        <br />
                        Min due {formatMoney(card.minimumDue)}
                        <br />
                        Extra {formatMoney(card.extraPayment)}
                      </td>
                      <td>
                        Planned pay {formatMoney(card.plannedPayment)}
                        <br />
                        Planned spend {formatMoney(card.plannedSpend)}
                        <br />
                        Due-adjusted {formatMoney(card.dueAdjustedCurrent)}
                      </td>
                      <td>
                        Day {card.dueDay} ({formatDueCountdown(card.dueInDays)})
                        <br />
                        Statement day {card.statementDay}
                        <br />
                        {card.dueApplied ? 'Due applied this month' : 'Due pending this month'}
                      </td>
                      <td>
                        Avail {formatMoney(card.displayAvailableCredit)}
                        <br />
                        Util {formatPercent(card.displayUtilization)}
                        <br />
                        Post-pay util {formatPercent(card.projectedUtilizationAfterPayment)}
                        {card.overLimit ? (
                          <>
                            <br />
                            Over limit
                          </>
                        ) : null}
                      </td>
                      <td>
                        APR {card.apr > 0 ? `${card.apr.toFixed(2)}%` : 'n/a'}
                        <br />
                        Cycle {formatMoney(card.interestAmount)}
                        <br />
                        Next {formatMoney(card.projectedNextMonthInterest)}
                        <br />
                        12m {formatMoney(card.projected12MonthInterestCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="print-subhead">Amortization &amp; Interest Trend (12 months)</h3>
            {cardRows.map((card) => (
              <article key={`projection-${card.id}`} className="print-card-projection">
                <div className="print-card-projection-head">
                  <h4>{card.name}</h4>
                  <p>
                    Start {formatMoney(card.dueAdjustedCurrent)} · APR {card.apr > 0 ? `${card.apr.toFixed(2)}%` : 'n/a'} ·{' '}
                    {describeMinimumConfig(card)}
                  </p>
                </div>
                <p className="print-subnote">
                  Interest trend:{' '}
                  {card.projectionRows
                    .slice(0, 12)
                    .map((row) => `M${row.monthIndex} ${formatMoney(row.interest)}`)
                    .join(' • ')}
                </p>
                <div className="print-table-wrap">
                  <table className="print-table print-table--projection">
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Start</th>
                        <th scope="col">Interest</th>
                        <th scope="col">Min Due</th>
                        <th scope="col">Planned Pay</th>
                        <th scope="col">Planned Spend</th>
                        <th scope="col">End Balance</th>
                        <th scope="col">End Util</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.projectionRows.map((row) => (
                        <tr key={`${card.id}-m${row.monthIndex}`}>
                          <td>M{row.monthIndex}</td>
                          <td className="table-amount">{formatMoney(row.startBalance)}</td>
                          <td className="table-amount">{formatMoney(row.interest)}</td>
                          <td className="table-amount">{formatMoney(row.minimumDue)}</td>
                          <td className="table-amount">{formatMoney(row.plannedPayment)}</td>
                          <td className="table-amount">{formatMoney(row.plannedSpend)}</td>
                          <td className="table-amount">{formatMoney(row.endingBalance)}</td>
                          <td>{formatPercent(row.endingUtilization)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}

              <p className="print-subnote">
                Portfolio available credit {formatMoney(availableCreditTotal)} across {formatMoney(cardLimitTotal)} total
                limit.
              </p>
            </>
          )}
        </section>
      ) : null}

      {config.includeLoans ? (
        <section className="print-section print-section--component">
          <h2>Loans</h2>
          {loans.length === 0 ? (
            <p className="print-subnote">No loan entries.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Min Payment</th>
                    <th scope="col">Subscription</th>
                    <th scope="col">APR</th>
                    <th scope="col">Due</th>
                    <th scope="col">Cadence</th>
                    {config.includeNotes ? <th scope="col">Notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan._id}>
                      <td>{loan.name}</td>
                      <td className="table-amount">{formatMoney(loan.balance)}</td>
                      <td className="table-amount">{formatMoney(loan.minimumPayment)}</td>
                      <td className="table-amount">{formatMoney(loan.subscriptionCost ?? 0)}</td>
                      <td>{loan.interestRate ? `${loan.interestRate.toFixed(2)}%` : 'n/a'}</td>
                      <td>Day {loan.dueDay}</td>
                      <td>{loan.cadence}</td>
                      {config.includeNotes ? <td>{loan.notes ?? ''}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {config.includeAccounts ? (
        <section className="print-section print-section--component">
          <h2>Accounts</h2>
          {accounts.length === 0 ? (
            <p className="print-subnote">No account entries.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Liquid</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account._id}>
                      <td>{account.name}</td>
                      <td>{account.type}</td>
                      <td className="table-amount">{formatMoney(account.balance)}</td>
                      <td>{account.liquid ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {config.includeGoals ? (
        <section className="print-section print-section--component">
          <h2>Goals</h2>
          {goals.length === 0 ? (
            <p className="print-subnote">No goal entries.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Target</th>
                    <th scope="col">Current</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Target Date</th>
                  </tr>
                </thead>
                <tbody>
                  {goals.map((goal) => (
                    <tr key={goal._id}>
                      <td>{goal.title}</td>
                      <td className="table-amount">{formatMoney(goal.targetAmount)}</td>
                      <td className="table-amount">{formatMoney(goal.currentAmount)}</td>
                      <td>{goal.priority}</td>
                      <td>{goal.targetDate ? goal.targetDate : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {config.includeReconcile ? (
        <section className="print-section print-section--component">
          <h2>Reconcile</h2>
          <div className="print-kpi-grid">
            <div className="print-kpi">
              <p>Reconciliation completion</p>
              <strong>{formatPercent(rangeKpis.reconciliationCompletionRate)}</strong>
              <small>{rangeKpis.purchaseCount} purchases in selected range</small>
            </div>
            <div className="print-kpi">
              <p>Pending to reconcile</p>
              <strong>{purchasesByStatus.pending}</strong>
              <small>
                Posted {purchasesByStatus.posted} · Reconciled {purchasesByStatus.reconciled}
              </small>
            </div>
            <div className="print-kpi">
              <p>Missing categories</p>
              <strong>{rangeKpis.missingCategoryCount}</strong>
              <small>Potential categorization cleanup needed</small>
            </div>
            <div className="print-kpi">
              <p>Quality flags</p>
              <strong>{rangeKpis.duplicateCount + rangeKpis.anomalyCount}</strong>
              <small>
                {rangeKpis.duplicateCount} duplicates · {rangeKpis.anomalyCount} anomalies
              </small>
            </div>
          </div>
        </section>
      ) : null}

      {config.includePlanning ? (
        <section className="print-section print-section--component">
          <h2>Planning</h2>
          <div className="print-kpi-grid">
            <div className="print-kpi">
              <p>Avg monthly purchases (range)</p>
              <strong>{formatMoney(avgMonthlyPurchases)}</strong>
              <small>
                Projected net after purchases: {formatMoney(projectedMonthlyNetAfterPurchases)}
              </small>
            </div>
            <div className="print-kpi">
              <p>Baseline commitments</p>
              <strong>{formatMoney(summary.monthlyCommitments)}</strong>
              <small>{formatMoney(summary.monthlyCommitments * rangeMonths)} over selected range</small>
            </div>
          </div>

          {topPurchaseCategories.length === 0 ? (
            <p className="print-subnote">No categorized purchases in this range yet.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Total</th>
                    <th scope="col">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {topPurchaseCategories.map((categoryRow) => (
                    <tr key={`planning-category-${categoryRow.category}`}>
                      <td>{categoryRow.category}</td>
                      <td className="table-amount">{formatMoney(categoryRow.total)}</td>
                      <td>{formatPercent(categoryRow.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {monthlyPurchaseTotals.length > 0 ? (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Purchase Total</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyPurchaseTotals.map((monthTotal) => (
                    <tr key={`planning-month-${monthTotal.key}`}>
                      <td>{monthTotal.key}</td>
                      <td className="table-amount">{formatMoney(monthTotal.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {config.includePurchases ? (
        <section className="print-section print-section--major">
          <h2>Purchases</h2>
          {purchasesInRange.length === 0 ? (
            <p className="print-subnote">No purchases in this range.</p>
          ) : (
            <>
              {sortedMonthKeys.map((key) => {
                const monthPurchases = (monthGroups.get(key) ?? []).slice().sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
                const monthTotal = sumBy(monthPurchases, (purchase) => purchase.amount)
                return (
                  <div className="print-month-group" key={key}>
                    <div className="print-month-head">
                      <h3>{formatMonthLabel(locale, key)}</h3>
                      <p className="print-month-total">{formatMoney(monthTotal)}</p>
                    </div>
                    <div className="print-table-wrap">
                      <table className="print-table">
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Item</th>
                            <th scope="col">Category</th>
                            <th scope="col">Status</th>
                            <th scope="col">Amount</th>
                            {config.includeNotes ? <th scope="col">Notes</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {monthPurchases.map((purchase) => (
                            <tr key={purchase._id}>
                              <td>{purchase.purchaseDate}</td>
                              <td>{purchase.item}</td>
                              <td>{purchase.category}</td>
                              <td>{purchase.reconciliationStatus ?? 'posted'}</td>
                              <td className="table-amount">{formatMoney(purchase.amount)}</td>
                              {config.includeNotes ? <td>{purchase.notes ?? ''}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
              <p className="print-subnote">
                Purchases total for range: <strong>{formatMoney(purchasesTotal)}</strong>
              </p>
            </>
          )}
        </section>
      ) : null}

      {filteredAuditLogs ? (
        <section className="print-section print-section--major">
          <h2>Audit Logs</h2>

          <h3 className="print-subhead">Monthly Cycle Runs</h3>
          {filteredAuditLogs.monthlyCycleRuns.length === 0 ? (
            <p className="print-subnote">No cycle runs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Cycle Key</th>
                    <th scope="col">Source</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.monthlyCycleRuns.map((run) => (
                    <tr key={run._id}>
                      <td>{run.cycleKey}</td>
                      <td>{run.source}</td>
                      <td>{run.status}</td>
                      <td>
                        {run.updatedCards} cards / {run.updatedLoans} loans
                      </td>
                      <td>{cycleDateLabel.format(new Date(run.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Cycle Audit Logs</h3>
          {filteredAuditLogs.cycleAuditLogs.length === 0 ? (
            <p className="print-subnote">No cycle audit logs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Cycle Key</th>
                    <th scope="col">Source</th>
                    <th scope="col">Cards</th>
                    <th scope="col">Loans</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.cycleAuditLogs.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.cycleKey}</td>
                      <td>{entry.source}</td>
                      <td>
                        {entry.updatedCards} ({entry.cardCyclesApplied} cycles)
                      </td>
                      <td>
                        {entry.updatedLoans} ({entry.loanCyclesApplied} cycles)
                      </td>
                      <td>{cycleDateLabel.format(new Date(entry.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Finance Audit Events</h3>
          {filteredAuditLogs.financeAuditEvents.length === 0 ? (
            <p className="print-subnote">No finance audit events in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Entity</th>
                    <th scope="col">Action</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.financeAuditEvents.map((event) => (
                    <tr key={event._id}>
                      <td>
                        {event.entityType} ({event.entityId})
                      </td>
                      <td>{event.action}</td>
                      <td>{cycleDateLabel.format(new Date(event.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </article>
  )
}
