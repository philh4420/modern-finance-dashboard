import { Fragment, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountEntry,
  BillEditDraft,
  BillEntry,
  BillForm,
  BillId,
  BillPaymentCheckEntry,
  BillPaymentCheckId,
  Cadence,
  CadenceOption,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
} from './financeTypes'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'
import { toMonthlyAmount } from '../lib/incomeMath'

type BillSortKey = 'name_asc' | 'amount_desc' | 'amount_asc' | 'day_asc' | 'cadence_asc' | 'autopay_first'

const variableBillKeywordPattern = /\b(variable|usage|meter(ed)?|estimated?|seasonal|fluctuat(?:e|es|ing|ion))\b/i
const msPerDay = 86400000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const clampDayToMonth = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(Math.max(day, 1), daysInMonth))
}

const addMonthsWithDay = (baseDate: Date, monthDelta: number, day: number) => {
  const targetMonth = baseDate.getMonth() + monthDelta
  const targetYear = baseDate.getFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  return clampDayToMonth(targetYear, normalizedMonth, day)
}

const previousDueDateForBill = (entry: BillEntry, nextDueDate: Date) => {
  switch (entry.cadence) {
    case 'weekly':
      return new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate() - 7)
    case 'biweekly':
      return new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate() - 14)
    case 'monthly':
      return addMonthsWithDay(nextDueDate, -1, entry.dueDay)
    case 'quarterly':
      return addMonthsWithDay(nextDueDate, -3, entry.dueDay)
    case 'yearly':
      return addMonthsWithDay(nextDueDate, -12, entry.dueDay)
    case 'custom':
      if (!entry.customInterval || !entry.customUnit || entry.customInterval <= 0) {
        return null
      }
      if (entry.customUnit === 'days') {
        return new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate() - entry.customInterval)
      }
      if (entry.customUnit === 'weeks') {
        return new Date(
          nextDueDate.getFullYear(),
          nextDueDate.getMonth(),
          nextDueDate.getDate() - entry.customInterval * 7,
        )
      }
      if (entry.customUnit === 'months') {
        return addMonthsWithDay(nextDueDate, -entry.customInterval, entry.dueDay)
      }
      return addMonthsWithDay(nextDueDate, -(entry.customInterval * 12), entry.dueDay)
    case 'one_time':
    default:
      return null
  }
}

const isVariableBill = (entry: BillEntry) => {
  if (variableBillKeywordPattern.test(entry.notes ?? '')) {
    return true
  }
  return entry.cadence === 'custom' || entry.cadence === 'weekly' || entry.cadence === 'biweekly'
}

const formatVarianceTrendLabel = (variance: number) => {
  if (variance > 0.005) return 'above plan trend'
  if (variance < -0.005) return 'below plan trend'
  return 'on-plan trend'
}

type BillPaymentLogDraft = {
  cycleMonth: string
  expectedAmount: string
  actualAmount: string
  paidDay: string
  note: string
}

const billTableColumnCount = 8

type BillsTabProps = {
  accounts: AccountEntry[]
  bills: BillEntry[]
  billPaymentChecks: BillPaymentCheckEntry[]
  monthlyBills: number
  billForm: BillForm
  setBillForm: Dispatch<SetStateAction<BillForm>>
  billEditId: BillId | null
  setBillEditId: Dispatch<SetStateAction<BillId | null>>
  billEditDraft: BillEditDraft
  setBillEditDraft: Dispatch<SetStateAction<BillEditDraft>>
  onAddBill: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteBill: (id: BillId) => Promise<void>
  onUpsertBillPaymentCheck: (args: {
    billId: BillId
    cycleMonth: string
    expectedAmount: string
    actualAmount?: string
    paidDay?: string
    note?: string
  }) => Promise<void>
  onDeleteBillPaymentCheck: (id: BillPaymentCheckId) => Promise<void>
  saveBillEdit: () => Promise<void>
  startBillEdit: (entry: BillEntry) => void
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function BillsTab({
  accounts,
  bills,
  billPaymentChecks,
  monthlyBills,
  billForm,
  setBillForm,
  billEditId,
  setBillEditId,
  billEditDraft,
  setBillEditDraft,
  onAddBill,
  onDeleteBill,
  onUpsertBillPaymentCheck,
  onDeleteBillPaymentCheck,
  saveBillEdit,
  startBillEdit,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: BillsTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<BillSortKey>('name_asc')
  const [timelineWindowDays, setTimelineWindowDays] = useState<14 | 30>(14)
  const [paymentLogBillId, setPaymentLogBillId] = useState<BillId | null>(null)
  const [paymentLogDraft, setPaymentLogDraft] = useState<BillPaymentLogDraft>(() => ({
    cycleMonth: new Date().toISOString().slice(0, 7),
    expectedAmount: '',
    actualAmount: '',
    paidDay: '',
    note: '',
  }))
  const timelineDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    [],
  )

  const billPaymentChecksByBillId = useMemo(() => {
    const map = new Map<BillId, BillPaymentCheckEntry[]>()
    billPaymentChecks.forEach((entry) => {
      const key = entry.billId as BillId
      const current = map.get(key) ?? []
      current.push(entry)
      map.set(key, current)
    })

    map.forEach((entries, key) => {
      const sorted = [...entries].sort((left, right) =>
        right.cycleMonth.localeCompare(left.cycleMonth, undefined, { sensitivity: 'base' }),
      )
      map.set(key, sorted)
    })

    return map
  }, [billPaymentChecks])

  const openPaymentLog = (entry: BillEntry) => {
    setPaymentLogBillId(entry._id)
    setPaymentLogDraft({
      cycleMonth: new Date().toISOString().slice(0, 7),
      expectedAmount: String(entry.amount),
      actualAmount: '',
      paidDay: String(entry.dueDay),
      note: '',
    })
  }

  const closePaymentLog = () => {
    setPaymentLogBillId(null)
  }

  const visibleBills = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? bills.filter((entry) => {
          const notes = entry.notes ?? ''
          return `${entry.name} ${notes}`.toLowerCase().includes(query)
        })
      : bills.slice()

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'amount_desc':
          return b.amount - a.amount
        case 'amount_asc':
          return a.amount - b.amount
        case 'day_asc':
          return a.dueDay - b.dueDay
        case 'cadence_asc':
          return cadenceLabel(a.cadence, a.customInterval, a.customUnit).localeCompare(
            cadenceLabel(b.cadence, b.customInterval, b.customUnit),
            undefined,
            { sensitivity: 'base' },
          )
        case 'autopay_first': {
          const aKey = a.autopay ? 0 : 1
          const bKey = b.autopay ? 0 : 1
          if (aKey !== bKey) return aKey - bKey
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        }
        default:
          return 0
      }
    })

    return sorted
  }, [bills, cadenceLabel, search, sortKey])

  const billSummary = useMemo(() => {
    const today = startOfDay(new Date())
    const variableMonthlyAmounts: number[] = []

    let dueIn7DaysCount = 0
    let dueIn7DaysAmount = 0
    let overdueCount = 0
    let autopayMonthlyAmount = 0

    bills.forEach((entry) => {
      const normalizedMonthlyAmount = toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit)

      if (entry.autopay) {
        autopayMonthlyAmount += normalizedMonthlyAmount
      }

      if (isVariableBill(entry)) {
        variableMonthlyAmounts.push(normalizedMonthlyAmount)
      }

      const nextDueDate = nextDateForCadence({
        cadence: entry.cadence,
        createdAt: entry.createdAt,
        dayOfMonth: entry.dueDay,
        customInterval: entry.customInterval ?? undefined,
        customUnit: entry.customUnit ?? undefined,
        now: today,
      })

      if (!nextDueDate) {
        return
      }

      const daysUntilDue = Math.round((startOfDay(nextDueDate).getTime() - today.getTime()) / msPerDay)
      if (daysUntilDue >= 0 && daysUntilDue <= 7) {
        dueIn7DaysCount += 1
        dueIn7DaysAmount += entry.amount
      }

      if (!entry.autopay) {
        const previousDueDate = previousDueDateForBill(entry, nextDueDate)
        if (previousDueDate && startOfDay(previousDueDate) < today) {
          overdueCount += 1
        }
      }
    })

    const autopayCoveragePercent = monthlyBills > 0 ? (autopayMonthlyAmount / monthlyBills) * 100 : 0
    const autopayCoverageAmountGap = Math.max(monthlyBills - autopayMonthlyAmount, 0)

    let variableVarianceStd = 0
    let variableVariancePercent = 0
    if (variableMonthlyAmounts.length > 1) {
      const mean = variableMonthlyAmounts.reduce((sum, amount) => sum + amount, 0) / variableMonthlyAmounts.length
      const variance =
        variableMonthlyAmounts.reduce((sum, amount) => sum + (amount - mean) ** 2, 0) / variableMonthlyAmounts.length
      variableVarianceStd = Math.sqrt(variance)
      variableVariancePercent = mean > 0 ? (variableVarianceStd / mean) * 100 : 0
    }

    return {
      dueIn7DaysCount,
      dueIn7DaysAmount,
      overdueCount,
      autopayCoveragePercent,
      autopayCoverageAmountGap,
      variableBillCount: variableMonthlyAmounts.length,
      variableVarianceStd,
      variableVariancePercent,
    }
  }, [bills, monthlyBills])

  const billVarianceOverview = useMemo(() => {
    const entriesWithVariance = billPaymentChecks.filter((entry) => typeof entry.varianceAmount === 'number')
    const recentEntries = [...entriesWithVariance]
      .sort((left, right) => right.cycleMonth.localeCompare(left.cycleMonth, undefined, { sensitivity: 'base' }))
      .slice(0, 24)

    const totalVariance = recentEntries.reduce((sum, entry) => sum + (entry.varianceAmount ?? 0), 0)
    const averageVariance = recentEntries.length > 0 ? totalVariance / recentEntries.length : 0

    return {
      recentEntries,
      totalVariance,
      averageVariance,
    }
  }, [billPaymentChecks])

  const timelineData = useMemo(() => {
    const today = startOfDay(new Date())
    const timelineMaxDays = 30
    const liquidBalanceStart = accounts
      .filter((account) => account.liquid)
      .reduce((sum, account) => sum + account.balance, 0)

    const events: Array<{
      id: string
      billId: BillId
      name: string
      dueDate: Date
      amount: number
      autopay: boolean
      cadenceText: string
      daysAway: number
    }> = []

    bills.forEach((entry) => {
      let cursor = today
      let iterations = 0

      while (iterations < 24) {
        iterations += 1
        const nextDueDate = nextDateForCadence({
          cadence: entry.cadence,
          createdAt: entry.createdAt,
          dayOfMonth: entry.dueDay,
          customInterval: entry.customInterval ?? undefined,
          customUnit: entry.customUnit ?? undefined,
          now: cursor,
        })

        if (!nextDueDate) {
          break
        }

        const normalizedDueDate = startOfDay(nextDueDate)
        const daysAway = Math.round((normalizedDueDate.getTime() - today.getTime()) / msPerDay)
        if (daysAway < 0) {
          cursor = new Date(normalizedDueDate.getTime() + msPerDay)
          continue
        }

        if (daysAway > timelineMaxDays) {
          break
        }

        events.push({
          id: `${entry._id}-${toIsoDate(normalizedDueDate)}-${iterations}`,
          billId: entry._id,
          name: entry.name,
          dueDate: normalizedDueDate,
          amount: entry.amount,
          autopay: entry.autopay,
          cadenceText: cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit),
          daysAway,
        })

        cursor = new Date(normalizedDueDate.getTime() + msPerDay)
      }
    })

    const sortedEvents = events.sort((left, right) => {
      if (left.dueDate.getTime() !== right.dueDate.getTime()) {
        return left.dueDate.getTime() - right.dueDate.getTime()
      }
      if (left.autopay !== right.autopay) {
        return left.autopay ? -1 : 1
      }
      if (left.amount !== right.amount) {
        return right.amount - left.amount
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })

    const withImpact = sortedEvents.reduce<{
      runningLiquidBalance: number
      items: Array<
        (typeof sortedEvents)[number] & {
          beforeImpact: number
          afterImpact: number
          impactSeverity: 'critical' | 'warning' | 'good'
        }
      >
    }>(
      (acc, entry) => {
        const beforeImpact = acc.runningLiquidBalance
        const afterImpact = beforeImpact - entry.amount

        const item = {
          ...entry,
          beforeImpact,
          afterImpact,
          impactSeverity:
            afterImpact < 0
              ? ('critical' as const)
              : afterImpact < Math.max(entry.amount * 1.25, monthlyBills * 0.25)
                ? ('warning' as const)
                : ('good' as const),
        }

        return {
          runningLiquidBalance: afterImpact,
          items: [...acc.items, item],
        }
      },
      {
        runningLiquidBalance: liquidBalanceStart,
        items: [],
      },
    ).items

    const visible = withImpact.filter((entry) => entry.daysAway <= timelineWindowDays)
    return {
      liquidBalanceStart,
      visible,
    }
  }, [accounts, bills, cadenceLabel, monthlyBills, timelineWindowDays])

  return (
    <section className="editor-grid bills-tab-shell" aria-label="Bill management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Bills</p>
            <h2>Add bill</h2>
            <p className="panel-value">
              {bills.length} bill{bills.length === 1 ? '' : 's'} · {formatMoney(monthlyBills)} / month
            </p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={onAddBill} aria-describedby="bill-form-hint">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="bill-name">Bill name</label>
              <input
                id="bill-name"
                value={billForm.name}
                onChange={(event) => setBillForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="bill-amount">Amount</label>
              <input
                id="bill-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={billForm.amount}
                onChange={(event) => setBillForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="bill-day">Due day</label>
              <input
                id="bill-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={billForm.dueDay}
                onChange={(event) => setBillForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="bill-cadence">Frequency</label>
              <select
                id="bill-cadence"
                value={billForm.cadence}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    cadence: event.target.value as Cadence,
                    customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                  }))
                }
              >
                {cadenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isCustomCadence(billForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="bill-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="bill-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={billForm.customInterval}
                    onChange={(event) =>
                      setBillForm((prev) => ({
                        ...prev,
                        customInterval: event.target.value,
                      }))
                    }
                    required
                  />
                  <select
                    id="bill-custom-unit"
                    value={billForm.customUnit}
                    onChange={(event) =>
                      setBillForm((prev) => ({
                        ...prev,
                        customUnit: event.target.value as CustomCadenceUnit,
                      }))
                    }
                  >
                    {customCadenceUnitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="bill-autopay">
                <input
                  id="bill-autopay"
                  type="checkbox"
                  checked={billForm.autopay}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, autopay: event.target.checked }))}
                />
                Autopay enabled
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="bill-notes">Notes</label>
              <textarea
                id="bill-notes"
                rows={3}
                placeholder="Optional"
                value={billForm.notes}
                onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="bill-form-hint" className="form-hint">
            Tip: use <strong>Custom</strong> for true intervals (every 4 weeks, 6 weeks, 4 months, etc) and{' '}
            <strong>One Time</strong> for non-recurring bills.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add bill
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Bills</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyBills)} monthly estimate</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search bills"
              placeholder="Search bills or notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort bills" value={sortKey} onChange={(event) => setSortKey(event.target.value as BillSortKey)}>
              <option value="name_asc">Name (A-Z)</option>
              <option value="amount_desc">Amount (high-low)</option>
              <option value="amount_asc">Amount (low-high)</option>
              <option value="day_asc">Due day</option>
              <option value="cadence_asc">Frequency</option>
              <option value="autopay_first">Autopay first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setSortKey('name_asc')
              }}
              disabled={search.length === 0 && sortKey === 'name_asc'}
            >
              Clear
            </button>
          </div>
        </header>

        {bills.length === 0 ? (
          <p className="empty-state">No bills added yet.</p>
        ) : (
          <>
            <section className="bills-summary-strip" aria-label="Bills executive summary strip">
              <article className="bills-summary-card">
                <p>Monthly bills total</p>
                <strong>{formatMoney(monthlyBills)}</strong>
                <small>
                  {bills.length} tracked bill{bills.length === 1 ? '' : 's'}
                </small>
              </article>
              <article className="bills-summary-card bills-summary-card--watch">
                <p>Due in next 7 days</p>
                <strong>{billSummary.dueIn7DaysCount}</strong>
                <small>{formatMoney(billSummary.dueIn7DaysAmount)} upcoming</small>
              </article>
              <article className="bills-summary-card bills-summary-card--critical">
                <p>Overdue (manual)</p>
                <strong>{billSummary.overdueCount}</strong>
                <small>Based on cadence cycle and due-day rollovers</small>
              </article>
              <article className="bills-summary-card bills-summary-card--good">
                <p>Autopay coverage</p>
                <strong>{billSummary.autopayCoveragePercent.toFixed(1)}%</strong>
                <small>
                  {billSummary.autopayCoverageAmountGap > 0
                    ? `${formatMoney(billSummary.autopayCoverageAmountGap)} remains manual`
                    : 'All monthly bill volume is autopay-covered'}
                </small>
              </article>
              <article className="bills-summary-card">
                <p>Variable-bill variance</p>
                <strong>
                  {billSummary.variableBillCount > 1 ? `${billSummary.variableVariancePercent.toFixed(1)}%` : 'n/a'}
                </strong>
                <small>
                  {billSummary.variableBillCount > 1
                    ? `σ ${formatMoney(billSummary.variableVarianceStd)} across ${billSummary.variableBillCount} variable bills`
                    : 'Tag notes with "variable" or use custom/weekly cadence to track variability'}
                </small>
              </article>
              <article className="bills-summary-card">
                <p>Expected vs actual trend</p>
                <strong
                  className={
                    billVarianceOverview.averageVariance > 0.005
                      ? 'amount-negative'
                      : billVarianceOverview.averageVariance < -0.005
                        ? 'amount-positive'
                        : undefined
                  }
                >
                  {billVarianceOverview.recentEntries.length > 0
                    ? formatMoney(billVarianceOverview.averageVariance)
                    : 'n/a'}
                </strong>
                <small>
                  {billVarianceOverview.recentEntries.length > 0
                    ? `${formatVarianceTrendLabel(billVarianceOverview.averageVariance)} across ${billVarianceOverview.recentEntries.length} logs`
                    : 'No bill cycle logs yet'}
                </small>
              </article>
            </section>

            <section className="bills-timeline" aria-label="Bills due-date timeline">
              <header className="bills-timeline-head">
                <div>
                  <h3>Due-date timeline</h3>
                  <p>
                    Upcoming due items with amount and liquid-account impact. Starting liquid pool:{' '}
                    <strong>{formatMoney(timelineData.liquidBalanceStart)}</strong>
                  </p>
                </div>
                <div className="bills-timeline-window-toggle" role="group" aria-label="Timeline window">
                  <button
                    type="button"
                    className={`btn btn-ghost btn--sm ${timelineWindowDays === 14 ? 'bills-timeline-window-btn--active' : ''}`}
                    onClick={() => setTimelineWindowDays(14)}
                  >
                    Next 14 days
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost btn--sm ${timelineWindowDays === 30 ? 'bills-timeline-window-btn--active' : ''}`}
                    onClick={() => setTimelineWindowDays(30)}
                  >
                    Next 30 days
                  </button>
                </div>
              </header>

              {timelineData.visible.length === 0 ? (
                <p className="subnote">No bills due in the selected window.</p>
              ) : (
                <ul className="bills-timeline-list">
                  {timelineData.visible.map((event) => (
                    <li key={event.id} className="bills-timeline-item">
                      <div className="bills-timeline-date">
                        <strong>{timelineDateFormatter.format(event.dueDate)}</strong>
                        <small>
                          {event.daysAway === 0 ? 'Due today' : event.daysAway === 1 ? 'Due in 1 day' : `Due in ${event.daysAway} days`}
                        </small>
                      </div>
                      <div className="bills-timeline-main">
                        <strong>{event.name}</strong>
                        <small>
                          {event.autopay ? 'Autopay' : 'Manual'} · {event.cadenceText}
                        </small>
                      </div>
                      <div className="bills-timeline-amount">
                        <strong>{formatMoney(event.amount)}</strong>
                        <small>bill amount</small>
                      </div>
                      <div className="bills-timeline-impact">
                        <strong className={event.afterImpact < 0 ? 'amount-negative' : 'amount-positive'}>
                          {formatMoney(event.afterImpact)}
                        </strong>
                        <small>liquid after due</small>
                      </div>
                      <div className="bills-timeline-signal">
                        <span
                          className={
                            event.impactSeverity === 'critical'
                              ? 'pill pill--critical'
                              : event.impactSeverity === 'warning'
                                ? 'pill pill--warning'
                                : 'pill pill--good'
                          }
                        >
                          {event.impactSeverity === 'critical'
                            ? 'Low cash risk'
                            : event.impactSeverity === 'warning'
                              ? 'Watch cash'
                              : 'Healthy'}
                        </span>
                        <small>Impact {formatMoney(-event.amount)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="subnote">
              Showing {visibleBills.length} of {bills.length} bill{bills.length === 1 ? '' : 's'}.
            </p>

            {visibleBills.length === 0 ? (
              <p className="empty-state">No bills match your search.</p>
            ) : (
              <div className="table-wrap table-wrap--card">
                <table className="data-table" data-testid="bills-table">
                  <caption className="sr-only">Bill entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Due Day</th>
                      <th scope="col">Frequency</th>
                      <th scope="col">Autopay</th>
                      <th scope="col">Expected vs actual</th>
                      <th scope="col">Notes</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBills.map((entry) => {
                      const isEditing = billEditId === entry._id
                      const isPaymentLogOpen = paymentLogBillId === entry._id
                      const rowPaymentChecks = billPaymentChecksByBillId.get(entry._id) ?? []
                      const latestPaymentCheck = rowPaymentChecks[0] ?? null
                      const recentVarianceChecks = rowPaymentChecks
                        .filter((paymentCheck) => typeof paymentCheck.varianceAmount === 'number')
                        .slice(0, 3)
                      const averageVariance =
                        recentVarianceChecks.length > 0
                          ? recentVarianceChecks.reduce((sum, paymentCheck) => sum + (paymentCheck.varianceAmount ?? 0), 0) /
                            recentVarianceChecks.length
                          : 0

                      return (
                        <Fragment key={entry._id}>
                          <tr className={isEditing ? 'table-row--editing' : undefined}>
                            <td>
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  value={billEditDraft.name}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                entry.name
                              )}
                            </td>
                            <td className="table-amount amount-negative">
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  value={billEditDraft.amount}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      amount: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                formatMoney(entry.amount)
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max="31"
                                  value={billEditDraft.dueDay}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      dueDay: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <span className="pill pill--neutral">Day {entry.dueDay}</span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div className="inline-cadence-controls">
                                  <select
                                    className="inline-select"
                                    value={billEditDraft.cadence}
                                    onChange={(event) =>
                                      setBillEditDraft((prev) => ({
                                        ...prev,
                                        cadence: event.target.value as Cadence,
                                        customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                                      }))
                                    }
                                  >
                                    {cadenceOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  {isCustomCadence(billEditDraft.cadence) ? (
                                    <>
                                      <input
                                        className="inline-input inline-cadence-number"
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        step="1"
                                        value={billEditDraft.customInterval}
                                        onChange={(event) =>
                                          setBillEditDraft((prev) => ({
                                            ...prev,
                                            customInterval: event.target.value,
                                          }))
                                        }
                                      />
                                      <select
                                        className="inline-select inline-cadence-unit"
                                        value={billEditDraft.customUnit}
                                        onChange={(event) =>
                                          setBillEditDraft((prev) => ({
                                            ...prev,
                                            customUnit: event.target.value as CustomCadenceUnit,
                                          }))
                                        }
                                      >
                                        {customCadenceUnitOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="pill pill--cadence">
                                  {cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit)}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  aria-label="Autopay enabled"
                                  type="checkbox"
                                  checked={billEditDraft.autopay}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      autopay: event.target.checked,
                                    }))
                                  }
                                />
                              ) : entry.autopay ? (
                                <span className="pill pill--good">Autopay</span>
                              ) : (
                                <span className="pill pill--neutral">Manual</span>
                              )}
                            </td>
                            <td>
                              {rowPaymentChecks.length === 0 ? (
                                <span className="pill pill--neutral">No cycle logs</span>
                              ) : (
                                <div className="cell-stack">
                                  <small>
                                    {latestPaymentCheck?.cycleMonth ?? 'Latest'} · planned{' '}
                                    {formatMoney(latestPaymentCheck?.expectedAmount ?? entry.amount)}
                                  </small>
                                  <small>
                                    actual{' '}
                                    {latestPaymentCheck?.actualAmount !== undefined
                                      ? formatMoney(latestPaymentCheck.actualAmount)
                                      : 'n/a'}
                                  </small>
                                  {latestPaymentCheck?.varianceAmount !== undefined ? (
                                    <small
                                      className={
                                        latestPaymentCheck.varianceAmount > 0
                                          ? 'amount-negative'
                                          : latestPaymentCheck.varianceAmount < 0
                                            ? 'amount-positive'
                                            : undefined
                                      }
                                    >
                                      variance {formatMoney(latestPaymentCheck.varianceAmount)}
                                    </small>
                                  ) : (
                                    <small>variance n/a</small>
                                  )}
                                  {recentVarianceChecks.length > 1 ? (
                                    <small
                                      className={
                                        averageVariance > 0.005
                                          ? 'amount-negative'
                                          : averageVariance < -0.005
                                            ? 'amount-positive'
                                            : undefined
                                      }
                                    >
                                      {recentVarianceChecks.length}-cycle avg {formatMoney(averageVariance)}
                                    </small>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  value={billEditDraft.notes}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      notes: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <span className="cell-truncate" title={entry.notes ?? ''}>
                                  {entry.notes ?? '-'}
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="row-actions">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn--sm"
                                      onClick={() => void saveBillEdit()}
                                    >
                                      Save
                                    </button>
                                    <button type="button" className="btn btn-ghost btn--sm" onClick={() => setBillEditId(null)}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn--sm"
                                      onClick={() => {
                                        closePaymentLog()
                                        startBillEdit(entry)
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn--sm"
                                      onClick={() => (isPaymentLogOpen ? closePaymentLog() : openPaymentLog(entry))}
                                    >
                                      {isPaymentLogOpen ? 'Close log' : 'Log cycle'}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => {
                                    if (paymentLogBillId === entry._id) {
                                      closePaymentLog()
                                    }
                                    void onDeleteBill(entry._id)
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isPaymentLogOpen ? (
                            <tr className="table-row--quick">
                              <td colSpan={billTableColumnCount}>
                                <div className="income-payment-log-panel bill-cycle-log-panel">
                                  <div className="income-payment-log-head">
                                    <h3>Expected vs actual cycle log</h3>
                                    <p>
                                      Capture planned and actual bill payments by cycle for <strong>{entry.name}</strong>.
                                    </p>
                                  </div>

                                  <div className="income-payment-log-fields">
                                    <label className="income-payment-log-field">
                                      <span>Cycle month</span>
                                      <input
                                        type="month"
                                        value={paymentLogDraft.cycleMonth}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            cycleMonth: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field">
                                      <span>Planned amount</span>
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={paymentLogDraft.expectedAmount}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            expectedAmount: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field">
                                      <span>Actual paid</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        placeholder="Optional"
                                        value={paymentLogDraft.actualAmount}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            actualAmount: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field">
                                      <span>Paid day</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        placeholder="Optional"
                                        value={paymentLogDraft.paidDay}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            paidDay: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field income-payment-log-field--note">
                                      <span>Note</span>
                                      <input
                                        type="text"
                                        placeholder="Optional context"
                                        value={paymentLogDraft.note}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            note: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>

                                  <p className="income-payment-log-hint">
                                    Variance is saved as <strong>actual - planned</strong>; positive means over plan, negative means under plan.
                                  </p>

                                  <div className="income-payment-log-actions">
                                    <button
                                      type="button"
                                      className="btn btn-primary btn--sm"
                                      onClick={() =>
                                        void onUpsertBillPaymentCheck({
                                          billId: entry._id,
                                          cycleMonth: paymentLogDraft.cycleMonth,
                                          expectedAmount: paymentLogDraft.expectedAmount,
                                          actualAmount: paymentLogDraft.actualAmount,
                                          paidDay: paymentLogDraft.paidDay,
                                          note: paymentLogDraft.note,
                                        })
                                      }
                                    >
                                      Save cycle log
                                    </button>
                                    <button type="button" className="btn btn-ghost btn--sm" onClick={closePaymentLog}>
                                      Close
                                    </button>
                                  </div>

                                  {rowPaymentChecks.length > 0 ? (
                                    <ul className="income-payment-log-history">
                                      {rowPaymentChecks.slice(0, 8).map((paymentCheck) => (
                                        <li key={paymentCheck._id}>
                                          <span className="pill pill--neutral">{paymentCheck.cycleMonth}</span>
                                          <small>
                                            planned {formatMoney(paymentCheck.expectedAmount)} · actual{' '}
                                            {paymentCheck.actualAmount !== undefined
                                              ? formatMoney(paymentCheck.actualAmount)
                                              : 'n/a'}
                                          </small>
                                          <small
                                            className={
                                              paymentCheck.varianceAmount !== undefined
                                                ? paymentCheck.varianceAmount > 0
                                                  ? 'amount-negative'
                                                  : paymentCheck.varianceAmount < 0
                                                    ? 'amount-positive'
                                                    : undefined
                                                : undefined
                                            }
                                          >
                                            variance{' '}
                                            {paymentCheck.varianceAmount !== undefined
                                              ? formatMoney(paymentCheck.varianceAmount)
                                              : 'n/a'}{' '}
                                            · {paymentCheck.paidDay ? `day ${paymentCheck.paidDay}` : 'no paid day'}
                                          </small>
                                          <button
                                            type="button"
                                            className="btn btn-ghost btn--sm"
                                            onClick={() => void onDeleteBillPaymentCheck(paymentCheck._id)}
                                          >
                                            Remove
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  )
}
