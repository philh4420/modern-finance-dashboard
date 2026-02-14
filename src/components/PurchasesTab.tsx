import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
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

type PurchaseSortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'status' | 'category_asc'

type PurchasesTabProps = {
  purchaseForm: PurchaseForm
  setPurchaseForm: Dispatch<SetStateAction<PurchaseForm>>
  purchaseFilter: PurchaseFilter
  setPurchaseFilter: Dispatch<SetStateAction<PurchaseFilter>>
  purchaseCategories: string[]
  filteredPurchases: PurchaseEntry[]
  filteredPurchaseTotal: number
  filteredPurchaseAverage: number
  purchasesThisMonth: number
  pendingPurchases: number
  postedPurchases: number
  reconciledPurchases: number
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
  purchasesThisMonth,
  pendingPurchases,
  postedPurchases,
  reconciledPurchases,
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
  const [sortKey, setSortKey] = useState<PurchaseSortKey>('date_desc')
  const defaultMonth = new Date().toISOString().slice(0, 7)

  const postedOnlyPurchases = Math.max(postedPurchases - reconciledPurchases, 0)

  const visiblePurchases = useMemo(() => {
    const statusRank = (value: 'pending' | 'posted' | 'reconciled') => {
      if (value === 'pending') return 0
      if (value === 'posted') return 1
      return 2
    }

    const sorted = [...filteredPurchases].sort((a, b) => {
      const aStatus = a.reconciliationStatus ?? 'posted'
      const bStatus = b.reconciliationStatus ?? 'posted'

      switch (sortKey) {
        case 'date_desc':
          return b.purchaseDate.localeCompare(a.purchaseDate)
        case 'date_asc':
          return a.purchaseDate.localeCompare(b.purchaseDate)
        case 'amount_desc':
          return b.amount - a.amount
        case 'amount_asc':
          return a.amount - b.amount
        case 'category_asc':
          return a.category.localeCompare(b.category, undefined, { sensitivity: 'base' })
        case 'status':
          return statusRank(aStatus) - statusRank(bStatus)
        default:
          return 0
      }
    })

    return sorted
  }, [filteredPurchases, sortKey])

  const visibleStatusCounts = useMemo(() => {
    return visiblePurchases.reduce(
      (acc, entry) => {
        const status = entry.reconciliationStatus ?? 'posted'
        if (status === 'pending') acc.pending += 1
        else if (status === 'reconciled') acc.reconciled += 1
        else acc.posted += 1
        return acc
      },
      { pending: 0, posted: 0, reconciled: 0 },
    )
  }, [visiblePurchases])

  const statusPill = (status: 'pending' | 'posted' | 'reconciled') => {
    if (status === 'reconciled') return 'pill pill--good'
    if (status === 'pending') return 'pill pill--warning'
    return 'pill pill--neutral'
  }

  const statusLabel = (status: 'pending' | 'posted' | 'reconciled') => {
    if (status === 'reconciled') return 'Reconciled'
    if (status === 'pending') return 'Pending'
    return 'Posted'
  }

  return (
    <section className="editor-grid" aria-label="Purchase management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Add purchase</h2>
            <p className="panel-value">{formatMoney(purchasesThisMonth)} this month</p>
            <p className="subnote">
              {pendingPurchases} pending · {postedOnlyPurchases} posted · {reconciledPurchases} reconciled
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddPurchase} aria-describedby="purchase-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="purchase-item">Item</label>
              <input
                id="purchase-item"
                value={purchaseForm.item}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, item: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-amount">Amount</label>
              <input
                id="purchase-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={purchaseForm.amount}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-category">Category</label>
              <input
                id="purchase-category"
                list="purchase-category-list"
                value={purchaseForm.category}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, category: event.target.value }))}
                required
              />
              <datalist id="purchase-category-list">
                {purchaseCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-date">Purchase date</label>
              <input
                id="purchase-date"
                type="date"
                value={purchaseForm.purchaseDate}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, purchaseDate: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-statement-month">Statement month</label>
              <input
                id="purchase-statement-month"
                type="month"
                value={purchaseForm.statementMonth}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, statementMonth: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
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
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="purchase-notes">Notes</label>
              <textarea
                id="purchase-notes"
                rows={3}
                placeholder="Optional"
                value={purchaseForm.notes}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="purchase-form-hint" className="form-hint">
            Tip: statement month helps you align purchases with the right billing period. Reconciliation affects your KPIs.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add purchase
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(filteredPurchaseTotal)} filtered total</p>
          </div>
        </header>

        <div className="filter-row" role="group" aria-label="Purchase filters">
          <input
            type="search"
            aria-label="Search purchases"
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
            aria-label="Filter by category"
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
            aria-label="Filter by month"
            value={purchaseFilter.month}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                month: event.target.value,
              }))
            }
          />
          <select
            aria-label="Filter by reconciliation status"
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

          <select aria-label="Sort purchases" value={sortKey} onChange={(event) => setSortKey(event.target.value as PurchaseSortKey)}>
            <option value="date_desc">Date (new-old)</option>
            <option value="date_asc">Date (old-new)</option>
            <option value="amount_desc">Amount (high-low)</option>
            <option value="amount_asc">Amount (low-high)</option>
            <option value="status">Status</option>
            <option value="category_asc">Category</option>
          </select>

          <button
            type="button"
            className="btn btn-ghost btn--sm"
            onClick={() => {
              setPurchaseFilter({
                query: '',
                category: 'all',
                month: defaultMonth,
                reconciliationStatus: 'all',
              })
              setSortKey('date_desc')
            }}
            disabled={
              sortKey === 'date_desc' &&
              purchaseFilter.query.length === 0 &&
              purchaseFilter.category === 'all' &&
              purchaseFilter.reconciliationStatus === 'all' &&
              purchaseFilter.month === defaultMonth
            }
          >
            Clear
          </button>
        </div>

        <p className="subnote">
          {visiblePurchases.length} result{visiblePurchases.length === 1 ? '' : 's'} • avg {formatMoney(filteredPurchaseAverage)} •{' '}
          {visibleStatusCounts.pending} pending • {visibleStatusCounts.posted} posted • {visibleStatusCounts.reconciled} reconciled
        </p>

        {visiblePurchases.length === 0 ? (
          <p className="empty-state">No purchases match this filter.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table" data-testid="purchases-table">
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
                {visiblePurchases.map((entry) => {
                  const isEditing = purchaseEditId === entry._id
                  const status = entry.reconciliationStatus ?? 'posted'

                  return (
                    <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
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
                          <span className="pill pill--neutral">{entry.category}</span>
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
                          <span className="pill pill--neutral">{entry.statementMonth ?? entry.purchaseDate.slice(0, 7)}</span>
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
                          <span className={statusPill(status)}>{statusLabel(status)}</span>
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
                          <span className="cell-truncate" title={entry.notes ?? ''}>
                            {entry.notes ?? '-'}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void savePurchaseEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost btn--sm" onClick={() => setPurchaseEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary btn--sm" onClick={() => startPurchaseEdit(entry)}>
                              Edit
                            </button>
                          )}
                          {!isEditing && status !== 'reconciled' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn--sm"
                              onClick={() => void onSetPurchaseReconciliation(entry._id, 'reconciled')}
                            >
                              Reconcile
                            </button>
                          ) : null}
                          {!isEditing && status !== 'posted' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn--sm"
                              onClick={() => void onSetPurchaseReconciliation(entry._id, 'posted')}
                            >
                              Mark Posted
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeletePurchase(entry._id)}>
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
