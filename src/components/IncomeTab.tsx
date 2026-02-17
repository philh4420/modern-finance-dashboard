import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  Cadence,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  IncomeEditDraft,
  IncomeEntry,
  IncomeForm,
  IncomeId,
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

type IncomeSortKey =
  | 'source_asc'
  | 'planned_desc'
  | 'planned_asc'
  | 'actual_desc'
  | 'variance_desc'
  | 'cadence_asc'
  | 'day_asc'

const parseOptionalMoneyInput = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

type IncomeTabProps = {
  incomes: IncomeEntry[]
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
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function IncomeTab({
  incomes,
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
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: IncomeTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<IncomeSortKey>('source_asc')

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
            Tip: use <strong>Custom</strong> for 4-week pay cycles and other unusual schedules.
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
                    <th scope="col">Frequency</th>
                    <th scope="col">Day</th>
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

                    return (
                      <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
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
                              <button
                                type="button"
                                className="btn btn-secondary btn--sm"
                                onClick={() => startIncomeEdit(entry)}
                              >
                                Edit
                              </button>
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
