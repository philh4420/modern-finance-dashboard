import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  BillEditDraft,
  BillEntry,
  BillForm,
  BillId,
  Cadence,
  CadenceOption,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
} from './financeTypes'

type BillSortKey = 'name_asc' | 'amount_desc' | 'amount_asc' | 'day_asc' | 'cadence_asc' | 'autopay_first'

type BillsTabProps = {
  bills: BillEntry[]
  monthlyBills: number
  billForm: BillForm
  setBillForm: Dispatch<SetStateAction<BillForm>>
  billEditId: BillId | null
  setBillEditId: Dispatch<SetStateAction<BillId | null>>
  billEditDraft: BillEditDraft
  setBillEditDraft: Dispatch<SetStateAction<BillEditDraft>>
  onAddBill: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteBill: (id: BillId) => Promise<void>
  saveBillEdit: () => Promise<void>
  startBillEdit: (entry: BillEntry) => void
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function BillsTab({
  bills,
  monthlyBills,
  billForm,
  setBillForm,
  billEditId,
  setBillEditId,
  billEditDraft,
  setBillEditDraft,
  onAddBill,
  onDeleteBill,
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

  return (
    <section className="editor-grid" aria-label="Bill management">
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
            Tip: use <strong>Custom</strong> for unusual billing cycles (every 6 weeks, 4 months, etc).
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
                      <th scope="col">Notes</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBills.map((entry) => {
                      const isEditing = billEditId === entry._id

                      return (
                        <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
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
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => startBillEdit(entry)}
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn--sm"
                                onClick={() => void onDeleteBill(entry._id)}
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
