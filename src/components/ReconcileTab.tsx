import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { PurchaseEntry, PurchaseId, ReconciliationStatus } from './financeTypes'
import type { OfflineQueueEntry } from '../hooks/useOfflineQueue'

type ReconcileFilter = {
  query: string
  status: 'all' | ReconciliationStatus
  category: string
  month: string
  sortBy: 'date' | 'amount' | 'item' | 'status'
  sortDir: 'asc' | 'desc'
}

type ReconcileTabProps = {
  filter: ReconcileFilter
  setFilter: Dispatch<SetStateAction<ReconcileFilter>>
  categories: string[]
  filteredPurchases: PurchaseEntry[]
  selectedSet: Set<PurchaseId>
  selectedCount: number
  selectedTotal: number
  toggleSelected: (id: PurchaseId) => void
  toggleSelectVisible: () => void
  clearSelection: () => void
  bulkCategory: string
  setBulkCategory: Dispatch<SetStateAction<string>>
  runBulkStatus: (status: ReconciliationStatus) => Promise<void>
  runBulkCategory: () => Promise<void>
  runBulkDelete: () => Promise<void>
  queue: {
    entries: OfflineQueueEntry[]
    pendingCount: number
    conflictCount: number
    isFlushing: boolean
    flushQueue: () => Promise<void>
    retryEntry: (id: string) => Promise<void>
    discardEntry: (id: string) => void
    clearConflicts: () => void
  }
  formatMoney: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

export function ReconcileTab({
  filter,
  setFilter,
  categories,
  filteredPurchases,
  selectedSet,
  selectedCount,
  selectedTotal,
  toggleSelected,
  toggleSelectVisible,
  clearSelection,
  bulkCategory,
  setBulkCategory,
  runBulkStatus,
  runBulkCategory,
  runBulkDelete,
  queue,
  formatMoney,
  dateLabel,
}: ReconcileTabProps) {
  const defaultMonth = new Date().toISOString().slice(0, 7)
  const viewTotal = useMemo(() => filteredPurchases.reduce((sum, purchase) => sum + purchase.amount, 0), [filteredPurchases])

  const allVisibleSelected =
    filteredPurchases.length > 0 && filteredPurchases.every((purchase) => selectedSet.has(purchase._id))

  const hasSelection = selectedCount > 0
  const canBulkCategory = hasSelection && bulkCategory.trim().length > 0

  const statusPill = (status: ReconciliationStatus) => {
    if (status === 'reconciled') return 'pill pill--good'
    if (status === 'pending') return 'pill pill--warning'
    return 'pill pill--neutral'
  }

  const queuePill = (status: OfflineQueueEntry['status']) =>
    status === 'conflict' ? 'pill pill--critical' : 'pill pill--warning'

  return (
    <section className="editor-grid" aria-label="Reconciliation workspace">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Reconciliation</p>
            <h2>Filters + bulk actions</h2>
            <p className="panel-value">
              {filteredPurchases.length} in view · {formatMoney(viewTotal)}
            </p>
            <p className="subnote">
              {queue.pendingCount} queued · {queue.conflictCount} conflicts
            </p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="reconcile-query">Search</label>
              <input
                id="reconcile-query"
                type="search"
                placeholder="Item, category, notes"
                value={filter.query}
                onChange={(event) => setFilter((previous) => ({ ...previous, query: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="reconcile-month">Statement month</label>
              <input
                id="reconcile-month"
                type="month"
                value={filter.month}
                onChange={(event) => setFilter((previous) => ({ ...previous, month: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="reconcile-status">Status</label>
              <select
                id="reconcile-status"
                value={filter.status}
                onChange={(event) =>
                  setFilter((previous) => ({ ...previous, status: event.target.value as ReconciliationStatus | 'all' }))
                }
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="posted">Posted</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="reconcile-category">Category</label>
              <select
                id="reconcile-category"
                value={filter.category}
                onChange={(event) => setFilter((previous) => ({ ...previous, category: event.target.value }))}
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="reconcile-sort">Sort</label>
              <div className="inline-cadence-controls">
                <select
                  id="reconcile-sort"
                  value={filter.sortBy}
                  onChange={(event) =>
                    setFilter((previous) => ({ ...previous, sortBy: event.target.value as ReconcileFilter['sortBy'] }))
                  }
                >
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="item">Item</option>
                  <option value="status">Status</option>
                </select>
                <select
                  value={filter.sortDir}
                  onChange={(event) =>
                    setFilter((previous) => ({ ...previous, sortDir: event.target.value as ReconcileFilter['sortDir'] }))
                  }
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bulk-summary" aria-label="Selection summary">
            <div>
              <p>Selected</p>
              <strong>{selectedCount}</strong>
              <small>{formatMoney(selectedTotal)}</small>
            </div>
            <div>
              <p>In view</p>
              <strong>{filteredPurchases.length}</strong>
              <small>{formatMoney(viewTotal)}</small>
            </div>
          </div>

          <div className="row-actions">
            <button type="button" className="btn btn-secondary btn--sm" onClick={toggleSelectVisible} disabled={filteredPurchases.length === 0}>
              {allVisibleSelected ? 'Deselect view' : 'Select view'}
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={clearSelection} disabled={!hasSelection}>
              Clear selection
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setFilter({
                  query: '',
                  status: 'all',
                  category: 'all',
                  month: defaultMonth,
                  sortBy: 'date',
                  sortDir: 'desc',
                })
                clearSelection()
              }}
              disabled={
                !hasSelection &&
                filter.query.length === 0 &&
                filter.status === 'all' &&
                filter.category === 'all' &&
                filter.month === defaultMonth &&
                filter.sortBy === 'date' &&
                filter.sortDir === 'desc'
              }
            >
              Reset
            </button>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void runBulkStatus('pending')}
              disabled={!hasSelection}
            >
              Mark pending
            </button>
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void runBulkStatus('posted')}
              disabled={!hasSelection}
            >
              Mark posted
            </button>
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void runBulkStatus('reconciled')}
              disabled={!hasSelection}
            >
              Mark reconciled
            </button>
          </div>

          <label htmlFor="bulk-category">Bulk category</label>
          <div className="goal-actions">
            <input
              id="bulk-category"
              list="bulk-category-list"
              value={bulkCategory}
              onChange={(event) => setBulkCategory(event.target.value)}
              placeholder="e.g. Groceries"
            />
            <datalist id="bulk-category-list">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkCategory()} disabled={!canBulkCategory}>
              Apply
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={() => setBulkCategory('')} disabled={bulkCategory.length === 0}>
              Clear
            </button>
          </div>

          <button type="button" className="btn btn-danger" onClick={() => void runBulkDelete()} disabled={!hasSelection}>
            Remove selected
          </button>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Reconciliation</p>
            <h2>Queue + entries</h2>
            <p className="panel-value">
              {filteredPurchases.length} entries · {formatMoney(viewTotal)}
            </p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void queue.flushQueue()}
              disabled={queue.isFlushing || queue.pendingCount === 0}
            >
              {queue.isFlushing ? 'Flushing...' : `Flush queue (${queue.pendingCount})`}
            </button>
            {queue.conflictCount > 0 ? (
              <button type="button" className="btn btn-ghost btn--sm" onClick={queue.clearConflicts}>
                Clear conflicts ({queue.conflictCount})
              </button>
            ) : null}
          </div>
        </header>

        {queue.entries.length > 0 ? (
          <ul className="timeline-list">
            {queue.entries.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <div>
                  <p>{entry.key}</p>
                  <small>
                    <span className={queuePill(entry.status)}>{entry.status === 'conflict' ? 'Conflict' : 'Queued'}</span> • attempt{' '}
                    {entry.attempts}
                    {entry.lastError ? ` • ${entry.lastError}` : ''}
                  </small>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-secondary btn--sm" onClick={() => void queue.retryEntry(entry.id)}>
                    Retry
                  </button>
                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => queue.discardEntry(entry.id)}>
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Offline queue is clear.</p>
        )}

        {filteredPurchases.length === 0 ? (
          <p className="empty-state">No purchases match this filter.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="reconcile-table">
              <caption className="sr-only">Reconciliation entries</caption>
              <thead>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Item</th>
                  <th scope="col">Date</th>
                  <th scope="col">Statement</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((purchase) => {
                  const isSelected = selectedSet.has(purchase._id)
                  const status = purchase.reconciliationStatus ?? 'posted'
                  return (
                    <tr key={purchase._id} className={isSelected ? 'table-row--selected' : undefined}>
                      <td>
                        <input
                          aria-label={`Select ${purchase.item}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(purchase._id)}
                        />
                      </td>
                      <td>
                        <span className="cell-truncate" title={purchase.item}>
                          {purchase.item}
                        </span>
                      </td>
                      <td>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</td>
                      <td>
                        <span className="pill pill--neutral">{purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)}</span>
                      </td>
                      <td>
                        <span className="pill pill--neutral">{purchase.category}</span>
                      </td>
                      <td>
                        <span className={statusPill(status)}>{status}</span>
                      </td>
                      <td className="table-amount amount-negative">{formatMoney(purchase.amount)}</td>
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
