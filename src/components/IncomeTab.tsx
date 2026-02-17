import { Fragment, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  Cadence,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  IncomeEditDraft,
  IncomeEntry,
  IncomeForm,
  IncomeId,
  IncomePaymentCheckEntry,
  IncomePaymentCheckId,
  IncomePaymentStatus,
  CadenceOption,
} from './financeTypes'
import {
  computeIncomeDeductionsTotal,
  hasIncomeBreakdown,
  resolveIncomeGrossAmount,
  resolveIncomeNetAmount,
  roundCurrency,
  toMonthlyAmount,
} from '../lib/incomeMath'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'

type IncomeSortKey =
  | 'source_asc'
  | 'planned_desc'
  | 'planned_asc'
  | 'actual_desc'
  | 'variance_desc'
  | 'cadence_asc'
  | 'next_payday_asc'
  | 'day_asc'

const parseOptionalMoneyInput = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseOptionalPositiveInt = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

type IncomePaymentReliability = {
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const reliabilityStatusLabel = (status: IncomePaymentStatus) => {
  if (status === 'on_time') return 'On time'
  if (status === 'late') return 'Late'
  return 'Missed'
}

const reliabilityStatusPillClass = (status: IncomePaymentStatus) => {
  if (status === 'on_time') return 'pill pill--good'
  if (status === 'late') return 'pill pill--warning'
  return 'pill pill--critical'
}

const calculateIncomePaymentReliability = (checks: IncomePaymentCheckEntry[]): IncomePaymentReliability => {
  if (checks.length === 0) {
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

  const sorted = [...checks].sort((left, right) => {
    const byMonth = right.cycleMonth.localeCompare(left.cycleMonth)
    if (byMonth !== 0) {
      return byMonth
    }
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
      if (entry.status !== status) {
        break
      }
      streak += 1
    }
    return streak
  }

  let lateOrMissedStreak = 0
  for (const entry of sorted) {
    if (entry.status === 'on_time') {
      break
    }
    lateOrMissedStreak += 1
  }

  const lateStreak = streakFor('late')
  const missedStreak = streakFor('missed')
  const scorePenalty = lateOrMissedStreak * 12 + missedStreak * 6
  const score = clamp(Math.round(onTimeRate * 100 - scorePenalty), 0, 100)

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

type IncomeTabProps = {
  incomes: IncomeEntry[]
  incomePaymentChecks: IncomePaymentCheckEntry[]
  monthlyIncome: number
  incomeForm: IncomeForm
  setIncomeForm: Dispatch<SetStateAction<IncomeForm>>
  incomeEditId: IncomeId | null
  setIncomeEditId: Dispatch<SetStateAction<IncomeId | null>>
  incomeEditDraft: IncomeEditDraft
  setIncomeEditDraft: Dispatch<SetStateAction<IncomeEditDraft>>
  onAddIncome: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteIncome: (id: IncomeId) => Promise<void>
  saveIncomeEdit: () => Promise<void>
  startIncomeEdit: (entry: IncomeEntry) => void
  onUpsertIncomePaymentCheck: (input: {
    incomeId: IncomeId
    cycleMonth: string
    status: IncomePaymentStatus
    receivedDay: string
    receivedAmount: string
    note: string
  }) => Promise<void>
  onDeleteIncomePaymentCheck: (id: IncomePaymentCheckId) => Promise<void>
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function IncomeTab({
  incomes,
  incomePaymentChecks,
  monthlyIncome,
  incomeForm,
  setIncomeForm,
  incomeEditId,
  setIncomeEditId,
  incomeEditDraft,
  setIncomeEditDraft,
  onAddIncome,
  onDeleteIncome,
  saveIncomeEdit,
  startIncomeEdit,
  onUpsertIncomePaymentCheck,
  onDeleteIncomePaymentCheck,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: IncomeTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<IncomeSortKey>('source_asc')
  const currentCycleMonth = new Date().toISOString().slice(0, 7)
  const [paymentLogIncomeId, setPaymentLogIncomeId] = useState<IncomeId | null>(null)
  const [paymentLogDraft, setPaymentLogDraft] = useState<{
    cycleMonth: string
    status: IncomePaymentStatus
    receivedDay: string
    receivedAmount: string
    note: string
  }>({
    cycleMonth: currentCycleMonth,
    status: 'on_time',
    receivedDay: '',
    receivedAmount: '',
    note: '',
  })

  const formGrossAmount = parseOptionalMoneyInput(incomeForm.grossAmount)
  const formTaxAmount = parseOptionalMoneyInput(incomeForm.taxAmount)
  const formNationalInsuranceAmount = parseOptionalMoneyInput(incomeForm.nationalInsuranceAmount)
  const formPensionAmount = parseOptionalMoneyInput(incomeForm.pensionAmount)
  const formActualAmount = parseOptionalMoneyInput(incomeForm.actualAmount)
  const formDeductionTotal = computeIncomeDeductionsTotal({
    taxAmount: formTaxAmount,
    nationalInsuranceAmount: formNationalInsuranceAmount,
    pensionAmount: formPensionAmount,
  })
  const formManualNetAmount = parseOptionalMoneyInput(incomeForm.amount)
  const formDerivedNetAmount =
    formGrossAmount !== undefined || formDeductionTotal > 0
      ? roundCurrency(Math.max((formGrossAmount ?? 0) - formDeductionTotal, 0))
      : undefined
  const formPayDateAnchor = incomeForm.payDateAnchor.trim()
  const formCustomInterval = isCustomCadence(incomeForm.cadence)
    ? parseOptionalPositiveInt(incomeForm.customInterval)
    : undefined
  const formNextPayday =
    formPayDateAnchor.length > 0
      ? nextDateForCadence({
          cadence: incomeForm.cadence,
          createdAt: 0,
          dayOfMonth: parseOptionalPositiveInt(incomeForm.receivedDay),
          customInterval: formCustomInterval,
          customUnit: isCustomCadence(incomeForm.cadence) ? incomeForm.customUnit : undefined,
          payDateAnchor: formPayDateAnchor,
        })
      : null

  const monthlyBreakdown = useMemo(() => {
    return incomes.reduce(
      (totals, entry) => {
        const grossAmount = resolveIncomeGrossAmount(entry)
        const deductionTotal = computeIncomeDeductionsTotal(entry)
        const netAmount = resolveIncomeNetAmount(entry)
        const plannedMonthly = toMonthlyAmount(netAmount, entry.cadence, entry.customInterval, entry.customUnit)

        totals.gross += toMonthlyAmount(grossAmount, entry.cadence, entry.customInterval, entry.customUnit)
        totals.deductions += toMonthlyAmount(deductionTotal, entry.cadence, entry.customInterval, entry.customUnit)
        totals.net += plannedMonthly
        if (typeof entry.actualAmount === 'number' && Number.isFinite(entry.actualAmount)) {
          totals.expectedTracked += plannedMonthly
          totals.receivedActual += toMonthlyAmount(
            Math.max(entry.actualAmount, 0),
            entry.cadence,
            entry.customInterval,
            entry.customUnit,
          )
          totals.trackedCount += 1
        }
        return totals
      },
      { gross: 0, deductions: 0, net: 0, expectedTracked: 0, receivedActual: 0, trackedCount: 0 },
    )
  }, [incomes])

  const trackedVarianceMonthly = roundCurrency(monthlyBreakdown.receivedActual - monthlyBreakdown.expectedTracked)
  const untrackedCount = Math.max(incomes.length - monthlyBreakdown.trackedCount, 0)

  const paymentChecksByIncomeId = useMemo(() => {
    const map = new Map<IncomeId, IncomePaymentCheckEntry[]>()
    incomePaymentChecks.forEach((entry) => {
      const current = map.get(entry.incomeId as IncomeId) ?? []
      current.push(entry)
      map.set(entry.incomeId as IncomeId, current)
    })

    map.forEach((entries, incomeId) => {
      const sorted = [...entries].sort((left, right) => {
        const byMonth = right.cycleMonth.localeCompare(left.cycleMonth)
        if (byMonth !== 0) {
          return byMonth
        }
        return right.updatedAt - left.updatedAt
      })
      map.set(incomeId, sorted)
    })

    return map
  }, [incomePaymentChecks])

  const overallReliability = useMemo(
    () => calculateIncomePaymentReliability(incomePaymentChecks),
    [incomePaymentChecks],
  )

  const openPaymentLog = (entry: IncomeEntry) => {
    setPaymentLogIncomeId(entry._id)
    setPaymentLogDraft({
      cycleMonth: currentCycleMonth,
      status: 'on_time',
      receivedDay: entry.receivedDay ? String(entry.receivedDay) : '',
      receivedAmount: entry.actualAmount !== undefined ? String(entry.actualAmount) : String(resolveIncomeNetAmount(entry)),
      note: '',
    })
  }

  const closePaymentLog = () => {
    setPaymentLogIncomeId(null)
    setPaymentLogDraft({
      cycleMonth: currentCycleMonth,
      status: 'on_time',
      receivedDay: '',
      receivedAmount: '',
      note: '',
    })
  }

  const visibleIncomes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? incomes.filter((entry) => {
          const notes = entry.notes ?? ''
          return `${entry.source} ${notes}`.toLowerCase().includes(query)
        })
      : incomes.slice()

    const sorted = [...filtered].sort((a, b) => {
      const plannedA = resolveIncomeNetAmount(a)
      const plannedB = resolveIncomeNetAmount(b)
      const actualA = typeof a.actualAmount === 'number' ? a.actualAmount : Number.NEGATIVE_INFINITY
      const actualB = typeof b.actualAmount === 'number' ? b.actualAmount : Number.NEGATIVE_INFINITY
      const varianceA =
        typeof a.actualAmount === 'number' ? roundCurrency(a.actualAmount - plannedA) : Number.NEGATIVE_INFINITY
      const varianceB =
        typeof b.actualAmount === 'number' ? roundCurrency(b.actualAmount - plannedB) : Number.NEGATIVE_INFINITY
      const nextPaydayA = nextDateForCadence({
        cadence: a.cadence,
        createdAt: a.createdAt,
        dayOfMonth: a.receivedDay,
        customInterval: a.customInterval ?? undefined,
        customUnit: a.customUnit ?? undefined,
        payDateAnchor: a.payDateAnchor,
      })
      const nextPaydayB = nextDateForCadence({
        cadence: b.cadence,
        createdAt: b.createdAt,
        dayOfMonth: b.receivedDay,
        customInterval: b.customInterval ?? undefined,
        customUnit: b.customUnit ?? undefined,
        payDateAnchor: b.payDateAnchor,
      })
      const nextPaydayAAt = nextPaydayA ? nextPaydayA.getTime() : Number.POSITIVE_INFINITY
      const nextPaydayBAt = nextPaydayB ? nextPaydayB.getTime() : Number.POSITIVE_INFINITY

      switch (sortKey) {
        case 'source_asc':
          return a.source.localeCompare(b.source, undefined, { sensitivity: 'base' })
        case 'planned_desc':
          return plannedB - plannedA
        case 'planned_asc':
          return plannedA - plannedB
        case 'actual_desc':
          return actualB - actualA
        case 'variance_desc':
          return varianceB - varianceA
        case 'cadence_asc':
          return cadenceLabel(a.cadence, a.customInterval, a.customUnit).localeCompare(
            cadenceLabel(b.cadence, b.customInterval, b.customUnit),
            undefined,
            { sensitivity: 'base' },
          )
        case 'next_payday_asc':
          return nextPaydayAAt - nextPaydayBAt
        case 'day_asc':
          return (a.receivedDay ?? 999) - (b.receivedDay ?? 999)
        default:
          return 0
      }
    })

    return sorted
  }, [cadenceLabel, incomes, search, sortKey])

  return (
    <section className="editor-grid" aria-label="Income management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Income</p>
            <h2>Add income source</h2>
            <p className="panel-value">
              {incomes.length} source{incomes.length === 1 ? '' : 's'} · {formatMoney(monthlyIncome)} / month
            </p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={onAddIncome} aria-describedby="income-form-hint">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="income-source">Source</label>
              <input
                id="income-source"
                value={incomeForm.source}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, source: event.target.value }))}
                autoComplete="organization"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-amount">Planned net amount</label>
              <input
                id="income-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={incomeForm.amount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, amount: event.target.value }))}
                required={formGrossAmount === undefined && formDeductionTotal <= 0}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-actual">Actual paid amount</label>
              <input
                id="income-actual"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.actualAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, actualAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-gross">Gross amount</label>
              <input
                id="income-gross"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.grossAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, grossAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-tax">Tax deduction</label>
              <input
                id="income-tax"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.taxAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, taxAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-ni">NI deduction</label>
              <input
                id="income-ni"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.nationalInsuranceAmount}
                onChange={(event) =>
                  setIncomeForm((prev) => ({
                    ...prev,
                    nationalInsuranceAmount: event.target.value,
                  }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-pension">Pension deduction</label>
              <input
                id="income-pension"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.pensionAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, pensionAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-cadence">Frequency</label>
              <select
                id="income-cadence"
                value={incomeForm.cadence}
                onChange={(event) =>
                  setIncomeForm((prev) => ({
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

            <div className="form-field">
              <label htmlFor="income-day">Received day</label>
              <input
                id="income-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                placeholder="Optional"
                value={incomeForm.receivedDay}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, receivedDay: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-anchor">Pay date anchor</label>
              <input
                id="income-anchor"
                type="date"
                value={incomeForm.payDateAnchor}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, payDateAnchor: event.target.value }))}
              />
            </div>

            {isCustomCadence(incomeForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="income-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="income-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={incomeForm.customInterval}
                    onChange={(event) =>
                      setIncomeForm((prev) => ({
                        ...prev,
                        customInterval: event.target.value,
                      }))
                    }
                    required
                  />
                  <select
                    id="income-custom-unit"
                    value={incomeForm.customUnit}
                    onChange={(event) =>
                      setIncomeForm((prev) => ({
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
              <label htmlFor="income-notes">Notes</label>
              <textarea
                id="income-notes"
                rows={3}
                placeholder="Optional"
                value={incomeForm.notes}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="income-form-hint" className="form-hint">
            {formDerivedNetAmount !== undefined
              ? `Derived net ${formatMoney(formDerivedNetAmount)} = gross ${formatMoney(formGrossAmount ?? 0)} - deductions ${formatMoney(formDeductionTotal)}.`
              : formManualNetAmount !== undefined
                ? `Using manual net amount ${formatMoney(formManualNetAmount)}. Add gross + deductions to auto-calculate net.`
                : 'Enter planned net amount directly or provide gross + deductions to auto-calculate net.'}{' '}
            {formActualAmount !== undefined
              ? `Actual paid captured as ${formatMoney(formActualAmount)} for expected vs received variance. `
              : 'Add Actual paid amount to track expected vs received variance. '}{' '}
            Tip: use <strong>Custom</strong> for 4-week pay cycles and set <strong>Pay date anchor</strong> for
            accurate next payday prediction. Next predicted payday:{' '}
            <strong>{formNextPayday ? toIsoDate(formNextPayday) : 'n/a'}</strong>.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add income
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Income</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyIncome)} planned net/month</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search income entries"
              placeholder="Search sources or notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Sort income entries"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as IncomeSortKey)}
            >
              <option value="source_asc">Source (A-Z)</option>
              <option value="planned_desc">Planned net (high-low)</option>
              <option value="planned_asc">Planned net (low-high)</option>
              <option value="actual_desc">Actual paid (high-low)</option>
              <option value="variance_desc">Variance (high-low)</option>
              <option value="cadence_asc">Frequency</option>
              <option value="next_payday_asc">Next payday</option>
              <option value="day_asc">Received day</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setSortKey('source_asc')
              }}
              disabled={search.length === 0 && sortKey === 'source_asc'}
            >
              Clear
            </button>
          </div>
        </header>

        {incomes.length === 0 ? (
          <p className="empty-state">No income entries added yet.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleIncomes.length} of {incomes.length} source{incomes.length === 1 ? '' : 's'} ·{' '}
              {formatMoney(monthlyIncome)} planned net/month scheduled.
            </p>
            <p className="subnote">
              Actuals tracked on {monthlyBreakdown.trackedCount}/{incomes.length} sources · {untrackedCount} pending
              actual value{untrackedCount === 1 ? '' : 's'}.
            </p>
            <div className="bulk-summary income-breakdown-summary">
              <div>
                <p>Gross income</p>
                <strong>{formatMoney(monthlyBreakdown.gross)}</strong>
                <small>monthly run-rate</small>
              </div>
              <div>
                <p>Deductions</p>
                <strong>{formatMoney(monthlyBreakdown.deductions)}</strong>
                <small>tax + NI + pension</small>
              </div>
              <div>
                <p>Planned net</p>
                <strong>{formatMoney(monthlyBreakdown.net)}</strong>
                <small>gross - deductions</small>
              </div>
              <div>
                <p>Actual received</p>
                <strong>{formatMoney(monthlyBreakdown.receivedActual)}</strong>
                <small>
                  {monthlyBreakdown.trackedCount}/{incomes.length} sources tracked
                </small>
              </div>
              <div>
                <p>Variance</p>
                <strong className={trackedVarianceMonthly < 0 ? 'amount-negative' : 'amount-positive'}>
                  {formatMoney(trackedVarianceMonthly)}
                </strong>
                <small>actual - planned for tracked sources</small>
              </div>
              <div>
                <p>Reliability score</p>
                <strong>
                  {overallReliability.score !== null ? `${overallReliability.score}/100` : 'n/a'}
                </strong>
                <small>
                  {overallReliability.total} logs · {(overallReliability.onTimeRate * 100).toFixed(0)}% on-time ·{' '}
                  {overallReliability.lateOrMissedStreak} late/missed streak
                </small>
              </div>
            </div>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--income" data-testid="income-table">
                <caption className="sr-only">Income entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Gross</th>
                    <th scope="col">Deductions</th>
                    <th scope="col">Planned net</th>
                    <th scope="col">Actual paid</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Reliability</th>
                    <th scope="col">Frequency</th>
                    <th scope="col">Day</th>
                    <th scope="col">Anchor</th>
                    <th scope="col">Next payday</th>
                    <th scope="col">Notes</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleIncomes.map((entry) => {
                    const isEditing = incomeEditId === entry._id
                    const grossAmount = resolveIncomeGrossAmount(entry)
                    const deductionTotal = computeIncomeDeductionsTotal(entry)
                    const netAmount = resolveIncomeNetAmount(entry)
                    const actualPaidAmount =
                      typeof entry.actualAmount === 'number' && Number.isFinite(entry.actualAmount)
                        ? roundCurrency(Math.max(entry.actualAmount, 0))
                        : undefined
                    const varianceAmount =
                      actualPaidAmount !== undefined ? roundCurrency(actualPaidAmount - netAmount) : undefined
                    const entryHasBreakdown = hasIncomeBreakdown(entry)
                    const effectiveDeductionRate = grossAmount > 0 ? (deductionTotal / grossAmount) * 100 : 0
                    const editGrossAmount = parseOptionalMoneyInput(incomeEditDraft.grossAmount)
                    const editTaxAmount = parseOptionalMoneyInput(incomeEditDraft.taxAmount)
                    const editNationalInsuranceAmount = parseOptionalMoneyInput(incomeEditDraft.nationalInsuranceAmount)
                    const editPensionAmount = parseOptionalMoneyInput(incomeEditDraft.pensionAmount)
                    const editDeductionTotal = computeIncomeDeductionsTotal({
                      taxAmount: editTaxAmount,
                      nationalInsuranceAmount: editNationalInsuranceAmount,
                      pensionAmount: editPensionAmount,
                    })
                    const editManualNetAmount = parseOptionalMoneyInput(incomeEditDraft.amount)
                    const editPlannedNetAmount =
                      editGrossAmount !== undefined || editDeductionTotal > 0
                        ? roundCurrency(Math.max((editGrossAmount ?? 0) - editDeductionTotal, 0))
                        : editManualNetAmount
                    const editActualPaidAmount = parseOptionalMoneyInput(incomeEditDraft.actualAmount)
                    const editVarianceAmount =
                      editActualPaidAmount !== undefined && editPlannedNetAmount !== undefined
                        ? roundCurrency(editActualPaidAmount - editPlannedNetAmount)
                        : undefined
                    const rowPaymentChecks = paymentChecksByIncomeId.get(entry._id) ?? []
                    const rowReliability = calculateIncomePaymentReliability(rowPaymentChecks)
                    const latestPaymentCheck = rowPaymentChecks[0] ?? null
                    const isPaymentLogOpen = paymentLogIncomeId === entry._id
                    const editCustomInterval = isCustomCadence(incomeEditDraft.cadence)
                      ? parseOptionalPositiveInt(incomeEditDraft.customInterval)
                      : undefined
                    const nextPayday = nextDateForCadence({
                      cadence: isEditing ? incomeEditDraft.cadence : entry.cadence,
                      createdAt: entry.createdAt,
                      dayOfMonth: isEditing ? parseOptionalPositiveInt(incomeEditDraft.receivedDay) : entry.receivedDay,
                      customInterval: isEditing ? editCustomInterval : entry.customInterval ?? undefined,
                      customUnit: isEditing
                        ? isCustomCadence(incomeEditDraft.cadence)
                          ? incomeEditDraft.customUnit
                          : undefined
                        : entry.customUnit ?? undefined,
                      payDateAnchor: isEditing ? incomeEditDraft.payDateAnchor.trim() || undefined : entry.payDateAnchor,
                    })

                    return (
                      <Fragment key={entry._id}>
                        <tr className={isEditing ? 'table-row--editing' : undefined}>
                        <td>
                          {isEditing ? (
                            <input
                              className="inline-input"
                              value={incomeEditDraft.source}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
                                  ...prev,
                                  source: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            entry.source
                          )}
                        </td>
                        <td className="table-amount">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Optional"
                              value={incomeEditDraft.grossAmount}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
                                  ...prev,
                                  grossAmount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <div className="cell-stack">
                              <strong>{formatMoney(grossAmount)}</strong>
                              <small>{entryHasBreakdown ? 'gross tracked' : 'from net input'}</small>
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="income-deductions-editor">
                              <input
                                className="inline-input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Tax"
                                value={incomeEditDraft.taxAmount}
                                onChange={(event) =>
                                  setIncomeEditDraft((prev) => ({
                                    ...prev,
                                    taxAmount: event.target.value,
                                  }))
                                }
                              />
                              <input
                                className="inline-input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="NI"
                                value={incomeEditDraft.nationalInsuranceAmount}
                                onChange={(event) =>
                                  setIncomeEditDraft((prev) => ({
                                    ...prev,
                                    nationalInsuranceAmount: event.target.value,
                                  }))
                                }
                              />
                              <input
                                className="inline-input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Pension"
                                value={incomeEditDraft.pensionAmount}
                                onChange={(event) =>
                                  setIncomeEditDraft((prev) => ({
                                    ...prev,
                                    pensionAmount: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          ) : entryHasBreakdown ? (
                            <div className="cell-stack">
                              <strong>{formatMoney(deductionTotal)}</strong>
                              <small>{effectiveDeductionRate.toFixed(1)}% of gross</small>
                            </div>
                          ) : (
                            <span className="pill pill--neutral">-</span>
                          )}
                        </td>
                        <td className="table-amount amount-positive">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={incomeEditDraft.amount}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
                                  ...prev,
                                  amount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <div className="cell-stack">
                              <strong>{formatMoney(netAmount)}</strong>
                              <small>{entryHasBreakdown ? 'gross - deductions' : 'planned net input'}</small>
                            </div>
                          )}
                        </td>
                        <td className="table-amount">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Optional"
                              value={incomeEditDraft.actualAmount}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
                                  ...prev,
                                  actualAmount: event.target.value,
                                }))
                              }
                            />
                          ) : actualPaidAmount !== undefined ? (
                            <div className="cell-stack">
                              <strong>{formatMoney(actualPaidAmount)}</strong>
                              <small>logged received</small>
                            </div>
                          ) : (
                            <span className="pill pill--neutral">Not logged</span>
                          )}
                        </td>
                        <td className="table-amount">
                          {isEditing ? (
                            editVarianceAmount !== undefined ? (
                              <span className={editVarianceAmount < 0 ? 'amount-negative' : 'amount-positive'}>
                                {formatMoney(editVarianceAmount)}
                              </span>
                            ) : (
                              <span className="pill pill--neutral">n/a</span>
                            )
                          ) : varianceAmount !== undefined ? (
                            <span className={varianceAmount < 0 ? 'amount-negative' : 'amount-positive'}>
                              {formatMoney(varianceAmount)}
                            </span>
                          ) : (
                            <span className="pill pill--neutral">n/a</span>
                          )}
                        </td>
                        <td className="income-reliability-cell">
                          {rowReliability.total === 0 ? (
                            <span className="pill pill--neutral">No logs</span>
                          ) : (
                            <div className="cell-stack">
                              <strong>
                                {rowReliability.score !== null ? `${rowReliability.score}/100` : 'n/a'} reliability
                              </strong>
                              <small>
                                {(rowReliability.onTimeRate * 100).toFixed(0)}% on-time · {rowReliability.total} log
                                {rowReliability.total === 1 ? '' : 's'}
                              </small>
                              <small>
                                Late streak {rowReliability.lateStreak} · Missed streak {rowReliability.missedStreak}
                              </small>
                              {latestPaymentCheck ? (
                                <span className={reliabilityStatusPillClass(latestPaymentCheck.status)}>
                                  {latestPaymentCheck.cycleMonth} · {reliabilityStatusLabel(latestPaymentCheck.status)}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="inline-cadence-controls">
                              <select
                                className="inline-select"
                                value={incomeEditDraft.cadence}
                                onChange={(event) =>
                                  setIncomeEditDraft((prev) => ({
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
                              {isCustomCadence(incomeEditDraft.cadence) ? (
                                <>
                                  <input
                                    className="inline-input inline-cadence-number"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={incomeEditDraft.customInterval}
                                    onChange={(event) =>
                                      setIncomeEditDraft((prev) => ({
                                        ...prev,
                                        customInterval: event.target.value,
                                      }))
                                    }
                                  />
                                  <select
                                    className="inline-select inline-cadence-unit"
                                    value={incomeEditDraft.customUnit}
                                    onChange={(event) =>
                                      setIncomeEditDraft((prev) => ({
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
                              className="inline-input"
                              type="number"
                              min="1"
                              max="31"
                              value={incomeEditDraft.receivedDay}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
                                  ...prev,
                                  receivedDay: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="pill pill--neutral">{entry.receivedDay ? `Day ${entry.receivedDay}` : '-'}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="date"
                              value={incomeEditDraft.payDateAnchor}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
                                  ...prev,
                                  payDateAnchor: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="pill pill--neutral">{entry.payDateAnchor ?? '-'}</span>
                          )}
                        </td>
                        <td>
                          <span className="pill pill--neutral">{nextPayday ? toIsoDate(nextPayday) : 'n/a'}</span>
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="inline-input"
                              value={incomeEditDraft.notes}
                              onChange={(event) =>
                                setIncomeEditDraft((prev) => ({
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
                                  onClick={() => void saveIncomeEdit()}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => setIncomeEditId(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => startIncomeEdit(entry)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => openPaymentLog(entry)}
                                >
                                  Log payment
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => void onDeleteIncome(entry._id)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                        </tr>
                        {isPaymentLogOpen ? (
                          <tr className="table-row--quick">
                            <td colSpan={13}>
                              <div className="income-payment-log-panel">
                                <div className="income-payment-log-head">
                                  <h3>Payment reliability log</h3>
                                  <p>
                                    Track on-time, late, and missed outcomes by month for <strong>{entry.source}</strong>.
                                  </p>
                                </div>

                                <div className="income-payment-log-fields">
                                  <label className="income-payment-log-field">
                                    <span>Month</span>
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
                                    <span>Status</span>
                                    <select
                                      value={paymentLogDraft.status}
                                      onChange={(event) => {
                                        const status = event.target.value as IncomePaymentStatus
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          status,
                                          receivedDay: status === 'missed' ? '' : prev.receivedDay,
                                          receivedAmount: status === 'missed' ? '' : prev.receivedAmount,
                                        }))
                                      }}
                                    >
                                      <option value="on_time">On time</option>
                                      <option value="late">Late</option>
                                      <option value="missed">Missed</option>
                                    </select>
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Received day</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="31"
                                      placeholder={entry.receivedDay ? `Expected day ${entry.receivedDay}` : 'Optional'}
                                      value={paymentLogDraft.receivedDay}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          receivedDay: event.target.value,
                                        }))
                                      }
                                      disabled={paymentLogDraft.status === 'missed'}
                                    />
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Received amount</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={paymentLogDraft.receivedAmount}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          receivedAmount: event.target.value,
                                        }))
                                      }
                                      disabled={paymentLogDraft.status === 'missed'}
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
                                  If expected day is set and you mark <strong>On time</strong> with a later received day,
                                  it will be normalized to <strong>Late</strong>.
                                </p>

                                <div className="income-payment-log-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn--sm"
                                    onClick={() =>
                                      void onUpsertIncomePaymentCheck({
                                        incomeId: entry._id,
                                        cycleMonth: paymentLogDraft.cycleMonth,
                                        status: paymentLogDraft.status,
                                        receivedDay: paymentLogDraft.receivedDay,
                                        receivedAmount: paymentLogDraft.receivedAmount,
                                        note: paymentLogDraft.note,
                                      })
                                    }
                                  >
                                    Save log
                                  </button>
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={closePaymentLog}>
                                    Close
                                  </button>
                                </div>

                                {rowPaymentChecks.length > 0 ? (
                                  <ul className="income-payment-log-history">
                                    {rowPaymentChecks.slice(0, 6).map((paymentCheck) => (
                                      <li key={paymentCheck._id}>
                                        <span className={reliabilityStatusPillClass(paymentCheck.status)}>
                                          {paymentCheck.cycleMonth} · {reliabilityStatusLabel(paymentCheck.status)}
                                        </span>
                                        <small>
                                          {paymentCheck.receivedDay ? `Day ${paymentCheck.receivedDay}` : 'No day'} ·{' '}
                                          {paymentCheck.receivedAmount !== undefined
                                            ? formatMoney(paymentCheck.receivedAmount)
                                            : 'No amount'}
                                        </small>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn--sm"
                                          onClick={() => void onDeleteIncomePaymentCheck(paymentCheck._id)}
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
          </>
        )}
      </article>
    </section>
  )
}
