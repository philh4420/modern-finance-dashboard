import type { Dispatch, FormEvent, SetStateAction } from 'react'
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

type BillsTabProps = {
  bills: BillEntry[]
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
  return (
    <section className="editor-grid" aria-label="Bill management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Bills</p>
            <h2>Add Bill Entry</h2>
          </div>
        </header>
        <form className="entry-form" onSubmit={onAddBill}>
          <label htmlFor="bill-name">Bill Name</label>
          <input
            id="bill-name"
            value={billForm.name}
            onChange={(event) => setBillForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />

          <label htmlFor="bill-amount">Amount</label>
          <input
            id="bill-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={billForm.amount}
            onChange={(event) => setBillForm((prev) => ({ ...prev, amount: event.target.value }))}
            required
          />

          <label htmlFor="bill-day">Due Day (1-31)</label>
          <input
            id="bill-day"
            type="number"
            min="1"
            max="31"
            value={billForm.dueDay}
            onChange={(event) => setBillForm((prev) => ({ ...prev, dueDay: event.target.value }))}
            required
          />

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

          {isCustomCadence(billForm.cadence) ? (
            <>
              <label htmlFor="bill-custom-interval">Custom Repeat Every</label>
              <div className="inline-cadence-controls">
                <input
                  id="bill-custom-interval"
                  type="number"
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
            </>
          ) : null}

          <label className="checkbox-row" htmlFor="bill-autopay">
            <input
              id="bill-autopay"
              type="checkbox"
              checked={billForm.autopay}
              onChange={(event) => setBillForm((prev) => ({ ...prev, autopay: event.target.checked }))}
            />
            Autopay enabled
          </label>

          <label htmlFor="bill-notes">Notes (optional)</label>
          <textarea
            id="bill-notes"
            rows={3}
            value={billForm.notes}
            onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))}
          />

          <button type="submit" className="btn btn-primary">
            Save Bill
          </button>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Bills</p>
            <h2>Current Entries</h2>
          </div>
        </header>

        {bills.length === 0 ? (
          <p className="empty-state">No bills added yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
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
                {bills.map((entry) => {
                  const isEditing = billEditId === entry._id

                  return (
                    <tr key={entry._id}>
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
                          entry.dueDay
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
                          cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit)
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
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
                          'Yes'
                        ) : (
                          'No'
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
                          entry.notes ?? '-'
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-secondary" onClick={() => void saveBillEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setBillEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startBillEdit(entry)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeleteBill(entry._id)}>
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
