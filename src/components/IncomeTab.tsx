import type { Dispatch, FormEvent, SetStateAction } from 'react'
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

type IncomeTabProps = {
  incomes: IncomeEntry[]
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
  return (
    <section className="editor-grid" aria-label="Income management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Income</p>
            <h2>Add Income Entry</h2>
          </div>
        </header>
        <form className="entry-form" onSubmit={onAddIncome}>
          <label htmlFor="income-source">Source</label>
          <input
            id="income-source"
            value={incomeForm.source}
            onChange={(event) => setIncomeForm((prev) => ({ ...prev, source: event.target.value }))}
            required
          />

          <label htmlFor="income-amount">Amount</label>
          <input
            id="income-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={incomeForm.amount}
            onChange={(event) => setIncomeForm((prev) => ({ ...prev, amount: event.target.value }))}
            required
          />

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

          {isCustomCadence(incomeForm.cadence) ? (
            <>
              <label htmlFor="income-custom-interval">Custom Repeat Every</label>
              <div className="inline-cadence-controls">
                <input
                  id="income-custom-interval"
                  type="number"
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
            </>
          ) : null}

          <label htmlFor="income-day">Received Day (optional)</label>
          <input
            id="income-day"
            type="number"
            min="1"
            max="31"
            value={incomeForm.receivedDay}
            onChange={(event) => setIncomeForm((prev) => ({ ...prev, receivedDay: event.target.value }))}
          />

          <label htmlFor="income-notes">Notes (optional)</label>
          <textarea
            id="income-notes"
            rows={3}
            value={incomeForm.notes}
            onChange={(event) => setIncomeForm((prev) => ({ ...prev, notes: event.target.value }))}
          />

          <button type="submit" className="btn btn-primary">
            Save Income
          </button>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Income</p>
            <h2>Current Entries</h2>
          </div>
        </header>

        {incomes.length === 0 ? (
          <p className="empty-state">No income entries added yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
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
                {incomes.map((entry) => {
                  const isEditing = incomeEditId === entry._id

                  return (
                    <tr key={entry._id}>
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
                          cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit)
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
                          entry.receivedDay ?? '-'
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
                          entry.notes ?? '-'
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-secondary" onClick={() => void saveIncomeEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setIncomeEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startIncomeEdit(entry)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeleteIncome(entry._id)}>
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
        )}
      </article>
    </section>
  )
}
