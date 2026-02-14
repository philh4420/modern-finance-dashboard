import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
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

type LoanSortKey =
  | 'name_asc'
  | 'balance_desc'
  | 'payment_desc'
  | 'subscription_desc'
  | 'apr_desc'
  | 'day_asc'
  | 'cadence_asc'

type LoansTabProps = {
  loans: LoanEntry[]
  monthlyLoanPayments: number
  monthlyLoanBasePayments: number
  monthlyLoanSubscriptionCosts: number
  totalLoanBalance: number
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
  monthlyLoanPayments,
  monthlyLoanBasePayments,
  monthlyLoanSubscriptionCosts,
  totalLoanBalance,
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
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<LoanSortKey>('name_asc')

  const visibleLoans = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? loans.filter((entry) => {
          const notes = entry.notes ?? ''
          return `${entry.name} ${notes}`.toLowerCase().includes(query)
        })
      : loans.slice()

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'balance_desc':
          return b.balance - a.balance
        case 'payment_desc':
          return b.minimumPayment - a.minimumPayment
        case 'subscription_desc':
          return (b.subscriptionCost ?? 0) - (a.subscriptionCost ?? 0)
        case 'apr_desc':
          return (b.interestRate ?? -1) - (a.interestRate ?? -1)
        case 'day_asc':
          return a.dueDay - b.dueDay
        case 'cadence_asc':
          return cadenceLabel(a.cadence, a.customInterval, a.customUnit).localeCompare(
            cadenceLabel(b.cadence, b.customInterval, b.customUnit),
            undefined,
            { sensitivity: 'base' },
          )
        default:
          return 0
      }
    })

    return sorted
  }, [cadenceLabel, loans, search, sortKey])

  return (
    <section className="editor-grid" aria-label="Loan management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Add loan</h2>
            <p className="panel-value">
              {loans.length} loan{loans.length === 1 ? '' : 's'} · {formatMoney(totalLoanBalance)} balance
            </p>
            <p className="subnote">
              {formatMoney(monthlyLoanPayments)} obligations/mo ({formatMoney(monthlyLoanBasePayments)} payments +{' '}
              {formatMoney(monthlyLoanSubscriptionCosts)} subscriptions)
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddLoan} aria-describedby="loan-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="loan-name">Loan name</label>
              <input
                id="loan-name"
                value={loanForm.name}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-balance">Outstanding balance</label>
              <input
                id="loan-balance"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={loanForm.balance}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, balance: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-due-day">Due day</label>
              <input
                id="loan-due-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={loanForm.dueDay}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-payment">Minimum payment</label>
              <input
                id="loan-payment"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={loanForm.minimumPayment}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-subscription">Subscription cost (monthly)</label>
              <input
                id="loan-subscription"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={loanForm.subscriptionCost}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, subscriptionCost: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-interest-rate">APR %</label>
              <input
                id="loan-interest-rate"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={loanForm.interestRate}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, interestRate: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-cadence">Payment frequency</label>
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
            </div>

            {isCustomCadence(loanForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="loan-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="loan-custom-interval"
                    type="number"
                    inputMode="numeric"
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
              </div>
            ) : null}

            <div className="form-field form-field--span2">
              <label htmlFor="loan-notes">Notes</label>
              <textarea
                id="loan-notes"
                rows={3}
                placeholder="Optional"
                value={loanForm.notes}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="loan-form-hint" className="form-hint">
            Tip: subscription cost is treated as a <strong>monthly</strong> add-on and included in commitments.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add loan
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyLoanPayments)} obligations/mo</p>
            <p className="subnote">
              {formatMoney(totalLoanBalance)} total balance · {formatMoney(monthlyLoanSubscriptionCosts)} subscriptions/mo
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search loans"
              placeholder="Search loans or notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort loans" value={sortKey} onChange={(event) => setSortKey(event.target.value as LoanSortKey)}>
              <option value="name_asc">Name (A-Z)</option>
              <option value="balance_desc">Balance (high-low)</option>
              <option value="payment_desc">Min payment (high-low)</option>
              <option value="subscription_desc">Subscription (high-low)</option>
              <option value="apr_desc">APR (high-low)</option>
              <option value="day_asc">Due day</option>
              <option value="cadence_asc">Frequency</option>
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

        {loans.length === 0 ? (
          <p className="empty-state">No loans added yet.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleLoans.length} of {loans.length} loan{loans.length === 1 ? '' : 's'}.
            </p>

            {visibleLoans.length === 0 ? (
              <p className="empty-state">No loans match your search.</p>
            ) : (
              <div className="table-wrap table-wrap--card">
                <table className="data-table" data-testid="loans-table">
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
                    {visibleLoans.map((entry) => {
                      const isEditing = loanEditId === entry._id

                      return (
                        <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
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
                                inputMode="decimal"
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
                                inputMode="decimal"
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
                                inputMode="decimal"
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
                                inputMode="decimal"
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
                              <span className="pill pill--neutral">{entry.interestRate.toFixed(2)}%</span>
                            ) : (
                              '-'
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
                                value={loanEditDraft.dueDay}
                                onChange={(event) =>
                                  setLoanEditDraft((prev) => ({
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
                                      inputMode="numeric"
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
                              <span className="pill pill--cadence">
                                {cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit)}
                              </span>
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
                                    onClick={() => void saveLoanEdit()}
                                  >
                                    Save
                                  </button>
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => setLoanEditId(null)}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => startLoanEdit(entry)}
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn--sm"
                                onClick={() => void onDeleteLoan(entry._id)}
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
            )}
          </>
        )}
      </article>
    </section>
  )
}
