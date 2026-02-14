import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type {
  Cadence,
  CadenceOption,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  LoanEditDraft,
  LoanEntry,
  LoanForm,
  LoanId,
} from './financeTypes'

type LoansTabProps = {
  loans: LoanEntry[]
  loanForm: LoanForm
  setLoanForm: Dispatch<SetStateAction<LoanForm>>
  loanEditId: LoanId | null
  setLoanEditId: Dispatch<SetStateAction<LoanId | null>>
  loanEditDraft: LoanEditDraft
  setLoanEditDraft: Dispatch<SetStateAction<LoanEditDraft>>
  onAddLoan: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteLoan: (id: LoanId) => Promise<void>
  saveLoanEdit: () => Promise<void>
  startLoanEdit: (entry: LoanEntry) => void
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function LoansTab({
  loans,
  loanForm,
  setLoanForm,
  loanEditId,
  setLoanEditId,
  loanEditDraft,
  setLoanEditDraft,
  onAddLoan,
  onDeleteLoan,
  saveLoanEdit,
  startLoanEdit,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: LoansTabProps) {
  return (
    <section className="editor-grid" aria-label="Loan management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Add Loan Entry</h2>
          </div>
        </header>

        <form className="entry-form" onSubmit={onAddLoan}>
          <label htmlFor="loan-name">Loan Name</label>
          <input
            id="loan-name"
            value={loanForm.name}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />

          <label htmlFor="loan-balance">Outstanding Balance</label>
          <input
            id="loan-balance"
            type="number"
            min="0"
            step="0.01"
            value={loanForm.balance}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, balance: event.target.value }))}
            required
          />

          <label htmlFor="loan-payment">Minimum Payment</label>
          <input
            id="loan-payment"
            type="number"
            min="0.01"
            step="0.01"
            value={loanForm.minimumPayment}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
            required
          />

          <label htmlFor="loan-subscription">Subscription Cost (monthly, optional)</label>
          <input
            id="loan-subscription"
            type="number"
            min="0"
            step="0.01"
            value={loanForm.subscriptionCost}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, subscriptionCost: event.target.value }))}
          />

          <label htmlFor="loan-interest-rate">APR % (optional)</label>
          <input
            id="loan-interest-rate"
            type="number"
            min="0"
            step="0.01"
            value={loanForm.interestRate}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, interestRate: event.target.value }))}
          />

          <label htmlFor="loan-due-day">Due Day (1-31)</label>
          <input
            id="loan-due-day"
            type="number"
            min="1"
            max="31"
            value={loanForm.dueDay}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, dueDay: event.target.value }))}
            required
          />

          <label htmlFor="loan-cadence">Frequency</label>
          <select
            id="loan-cadence"
            value={loanForm.cadence}
            onChange={(event) =>
              setLoanForm((prev) => ({
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

          {isCustomCadence(loanForm.cadence) ? (
            <>
              <label htmlFor="loan-custom-interval">Custom Repeat Every</label>
              <div className="inline-cadence-controls">
                <input
                  id="loan-custom-interval"
                  type="number"
                  min="1"
                  step="1"
                  value={loanForm.customInterval}
                  onChange={(event) =>
                    setLoanForm((prev) => ({
                      ...prev,
                      customInterval: event.target.value,
                    }))
                  }
                  required
                />
                <select
                  id="loan-custom-unit"
                  value={loanForm.customUnit}
                  onChange={(event) =>
                    setLoanForm((prev) => ({
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

          <label htmlFor="loan-notes">Notes (optional)</label>
          <textarea
            id="loan-notes"
            rows={3}
            value={loanForm.notes}
            onChange={(event) => setLoanForm((prev) => ({ ...prev, notes: event.target.value }))}
          />

          <button type="submit" className="btn btn-primary">
            Save Loan
          </button>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Current Entries</h2>
          </div>
        </header>

        {loans.length === 0 ? (
          <p className="empty-state">No loans added yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Loan entries</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Min Payment</th>
                  <th scope="col">Subscription / month</th>
                  <th scope="col">APR</th>
                  <th scope="col">Due Day</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((entry) => {
                  const isEditing = loanEditId === entry._id

                  return (
                    <tr key={entry._id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={loanEditDraft.name}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
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
                            min="0"
                            step="0.01"
                            value={loanEditDraft.balance}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
                                ...prev,
                                balance: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          formatMoney(entry.balance)
                        )}
                      </td>
                      <td className="table-amount amount-negative">
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={loanEditDraft.minimumPayment}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
                                ...prev,
                                minimumPayment: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          formatMoney(entry.minimumPayment)
                        )}
                      </td>
                      <td className="table-amount amount-negative">
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={loanEditDraft.subscriptionCost}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
                                ...prev,
                                subscriptionCost: event.target.value,
                              }))
                            }
                          />
                        ) : entry.subscriptionCost !== undefined ? (
                          formatMoney(entry.subscriptionCost)
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={loanEditDraft.interestRate}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
                                ...prev,
                                interestRate: event.target.value,
                              }))
                            }
                          />
                        ) : entry.interestRate !== undefined ? (
                          `${entry.interestRate.toFixed(2)}%`
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            min="1"
                            max="31"
                            value={loanEditDraft.dueDay}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
                                ...prev,
                                dueDay: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.dueDay
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="inline-cadence-controls">
                            <select
                              className="inline-select"
                              value={loanEditDraft.cadence}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({
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
                            {isCustomCadence(loanEditDraft.cadence) ? (
                              <>
                                <input
                                  className="inline-input inline-cadence-number"
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={loanEditDraft.customInterval}
                                  onChange={(event) =>
                                    setLoanEditDraft((prev) => ({
                                      ...prev,
                                      customInterval: event.target.value,
                                    }))
                                  }
                                />
                                <select
                                  className="inline-select inline-cadence-unit"
                                  value={loanEditDraft.customUnit}
                                  onChange={(event) =>
                                    setLoanEditDraft((prev) => ({
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
                            value={loanEditDraft.notes}
                            onChange={(event) =>
                              setLoanEditDraft((prev) => ({
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
                              <button type="button" className="btn btn-secondary" onClick={() => void saveLoanEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setLoanEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startLoanEdit(entry)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeleteLoan(entry._id)}>
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
