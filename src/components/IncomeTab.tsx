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

type IncomeSortKey = 'source_asc' | 'amount_desc' | 'amount_asc' | 'cadence_asc' | 'day_asc'

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

  const visibleIncomes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? incomes.filter((entry) => {
          const notes = entry.notes ?? ''
          return `${entry.source} ${notes}`.toLowerCase().includes(query)
        })
      : incomes.slice()

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'source_asc':
          return a.source.localeCompare(b.source, undefined, { sensitivity: 'base' })
        case 'amount_desc':
          return b.amount - a.amount
        case 'amount_asc':
          return a.amount - b.amount
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
              <label htmlFor="income-amount">Amount</label>
              <input
                id="income-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={incomeForm.amount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
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
            <p className="panel-value">{formatMoney(monthlyIncome)} monthly estimate</p>
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
              <option value="amount_desc">Amount (high-low)</option>
              <option value="amount_asc">Amount (low-high)</option>
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
              Showing {visibleIncomes.length} of {incomes.length} source{incomes.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table" data-testid="income-table">
              <caption className="sr-only">Income entries</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Day</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleIncomes.map((entry) => {
                  const isEditing = incomeEditId === entry._id

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
                          formatMoney(entry.amount)
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
