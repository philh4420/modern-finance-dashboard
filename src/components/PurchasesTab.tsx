import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type {
  PurchaseEditDraft,
  PurchaseEntry,
  PurchaseForm,
  PurchaseId,
} from './financeTypes'

type PurchaseFilter = {
  query: string
  category: string
  month: string
  reconciliationStatus: 'all' | 'pending' | 'posted' | 'reconciled'
}

type PurchasesTabProps = {
  purchaseForm: PurchaseForm
  setPurchaseForm: Dispatch<SetStateAction<PurchaseForm>>
  purchaseFilter: PurchaseFilter
  setPurchaseFilter: Dispatch<SetStateAction<PurchaseFilter>>
  purchaseCategories: string[]
  filteredPurchases: PurchaseEntry[]
  filteredPurchaseTotal: number
  filteredPurchaseAverage: number
  purchaseEditId: PurchaseId | null
  setPurchaseEditId: Dispatch<SetStateAction<PurchaseId | null>>
  purchaseEditDraft: PurchaseEditDraft
  setPurchaseEditDraft: Dispatch<SetStateAction<PurchaseEditDraft>>
  onAddPurchase: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeletePurchase: (id: PurchaseId) => Promise<void>
  savePurchaseEdit: () => Promise<void>
  startPurchaseEdit: (entry: PurchaseEntry) => void
  onSetPurchaseReconciliation: (id: PurchaseId, status: 'pending' | 'posted' | 'reconciled') => Promise<void>
  formatMoney: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

export function PurchasesTab({
  purchaseForm,
  setPurchaseForm,
  purchaseFilter,
  setPurchaseFilter,
  purchaseCategories,
  filteredPurchases,
  filteredPurchaseTotal,
  filteredPurchaseAverage,
  purchaseEditId,
  setPurchaseEditId,
  purchaseEditDraft,
  setPurchaseEditDraft,
  onAddPurchase,
  onDeletePurchase,
  savePurchaseEdit,
  startPurchaseEdit,
  onSetPurchaseReconciliation,
  formatMoney,
  dateLabel,
}: PurchasesTabProps) {
  return (
    <section className="editor-grid" aria-label="Purchase management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Add Purchase Entry</h2>
          </div>
        </header>

        <form className="entry-form" onSubmit={onAddPurchase}>
          <label htmlFor="purchase-item">Item</label>
          <input
            id="purchase-item"
            value={purchaseForm.item}
            onChange={(event) => setPurchaseForm((prev) => ({ ...prev, item: event.target.value }))}
            required
          />

          <label htmlFor="purchase-amount">Amount</label>
          <input
            id="purchase-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={purchaseForm.amount}
            onChange={(event) => setPurchaseForm((prev) => ({ ...prev, amount: event.target.value }))}
            required
          />

          <label htmlFor="purchase-category">Category</label>
          <input
            id="purchase-category"
            value={purchaseForm.category}
            onChange={(event) => setPurchaseForm((prev) => ({ ...prev, category: event.target.value }))}
            required
          />

          <label htmlFor="purchase-date">Purchase Date</label>
          <input
            id="purchase-date"
            type="date"
            value={purchaseForm.purchaseDate}
            onChange={(event) => setPurchaseForm((prev) => ({ ...prev, purchaseDate: event.target.value }))}
            required
          />

          <label htmlFor="purchase-notes">Notes (optional)</label>
          <textarea
            id="purchase-notes"
            rows={3}
            value={purchaseForm.notes}
            onChange={(event) => setPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
          />

          <label htmlFor="purchase-statement-month">Statement Month</label>
          <input
            id="purchase-statement-month"
            type="month"
            value={purchaseForm.statementMonth}
            onChange={(event) => setPurchaseForm((prev) => ({ ...prev, statementMonth: event.target.value }))}
            required
          />

          <label htmlFor="purchase-reconciliation-status">Reconciliation</label>
          <select
            id="purchase-reconciliation-status"
            value={purchaseForm.reconciliationStatus}
            onChange={(event) =>
              setPurchaseForm((prev) => ({
                ...prev,
                reconciliationStatus: event.target.value as 'pending' | 'posted' | 'reconciled',
              }))
            }
          >
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
            <option value="reconciled">Reconciled</option>
          </select>

          <button type="submit" className="btn btn-primary">
            Save Purchase
          </button>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Current Entries</h2>
          </div>
          <p className="panel-value">{formatMoney(filteredPurchaseTotal)} filtered total</p>
        </header>

        <div className="filter-row" role="group" aria-label="Purchase filters">
          <input
            type="search"
            placeholder="Search item, category, notes"
            value={purchaseFilter.query}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                query: event.target.value,
              }))
            }
          />
          <select
            value={purchaseFilter.category}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                category: event.target.value,
              }))
            }
          >
            <option value="all">All categories</option>
            {purchaseCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={purchaseFilter.month}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                month: event.target.value,
              }))
            }
          />
          <select
            value={purchaseFilter.reconciliationStatus}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                reconciliationStatus: event.target.value as 'all' | 'pending' | 'posted' | 'reconciled',
              }))
            }
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
            <option value="reconciled">Reconciled</option>
          </select>
        </div>

        <p className="subnote">
          {filteredPurchases.length} result{filteredPurchases.length === 1 ? '' : 's'} • avg {formatMoney(filteredPurchaseAverage)}
        </p>

        {filteredPurchases.length === 0 ? (
          <p className="empty-state">No purchases match this filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Purchase entries</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Category</th>
                  <th scope="col">Date</th>
                  <th scope="col">Statement</th>
                  <th scope="col">Status</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((entry) => {
                  const isEditing = purchaseEditId === entry._id

                  return (
                    <tr key={entry._id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={purchaseEditDraft.item}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                item: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.item
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={purchaseEditDraft.category}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                category: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.category
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="date"
                            value={purchaseEditDraft.purchaseDate}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                purchaseDate: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          dateLabel.format(new Date(`${entry.purchaseDate}T00:00:00`))
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="month"
                            value={purchaseEditDraft.statementMonth}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                statementMonth: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.statementMonth ?? entry.purchaseDate.slice(0, 7)
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="inline-select"
                            value={purchaseEditDraft.reconciliationStatus}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                reconciliationStatus: event.target.value as 'pending' | 'posted' | 'reconciled',
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="posted">Posted</option>
                            <option value="reconciled">Reconciled</option>
                          </select>
                        ) : (
                          entry.reconciliationStatus ?? 'posted'
                        )}
                      </td>
                      <td className="table-amount amount-negative">
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={purchaseEditDraft.amount}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
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
                            value={purchaseEditDraft.notes}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
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
                              <button type="button" className="btn btn-secondary" onClick={() => void savePurchaseEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setPurchaseEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startPurchaseEdit(entry)}>
                              Edit
                            </button>
                          )}
                          {!isEditing && (entry.reconciliationStatus ?? 'posted') !== 'reconciled' ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void onSetPurchaseReconciliation(entry._id, 'reconciled')}
                            >
                              Reconcile
                            </button>
                          ) : null}
                          {!isEditing && (entry.reconciliationStatus ?? 'posted') !== 'posted' ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => void onSetPurchaseReconciliation(entry._id, 'posted')}
                            >
                              Mark Posted
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeletePurchase(entry._id)}>
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
