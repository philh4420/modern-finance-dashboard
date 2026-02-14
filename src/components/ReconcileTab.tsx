import type { Dispatch, SetStateAction } from 'react'
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
  return (
    <section className="editor-grid" aria-label="Reconciliation workspace">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Reconciliation</p>
            <h2>Bulk Controls</h2>
          </div>
        </header>

        <div className="entry-form">
          <label htmlFor="reconcile-query">Search</label>
          <input
            id="reconcile-query"
            type="search"
            placeholder="Item, category, notes"
            value={filter.query}
            onChange={(event) => setFilter((previous) => ({ ...previous, query: event.target.value }))}
          />

          <label htmlFor="reconcile-month">Statement Month</label>
          <input
            id="reconcile-month"
            type="month"
            value={filter.month}
            onChange={(event) => setFilter((previous) => ({ ...previous, month: event.target.value }))}
          />

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

          <p className="subnote">
            {selectedCount} selected • {formatMoney(selectedTotal)}
          </p>

          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void runBulkStatus('pending')}>
              Mark Pending
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void runBulkStatus('posted')}>
              Mark Posted
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void runBulkStatus('reconciled')}>
              Mark Reconciled
            </button>
          </div>

          <label htmlFor="bulk-category">Bulk Category</label>
          <div className="goal-actions">
            <input
              id="bulk-category"
              value={bulkCategory}
              onChange={(event) => setBulkCategory(event.target.value)}
              placeholder="e.g. Groceries"
            />
            <button type="button" className="btn btn-secondary" onClick={() => void runBulkCategory()}>
              Apply
            </button>
            <button type="button" className="btn btn-ghost" onClick={clearSelection}>
              Clear
            </button>
          </div>

          <button type="button" className="btn btn-ghost" onClick={() => void runBulkDelete()}>
            Remove Selected
          </button>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Reconciliation</p>
            <h2>Reconciliation Queue + Entries</h2>
          </div>
          <p className="panel-value">{filteredPurchases.length} entries in view</p>
        </header>

        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={toggleSelectVisible}>
            Toggle Visible
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void queue.flushQueue()} disabled={queue.isFlushing}>
            {queue.isFlushing ? 'Flushing...' : `Flush Queue (${queue.pendingCount})`}
          </button>
          {queue.conflictCount > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={queue.clearConflicts}>
              Clear Conflicts ({queue.conflictCount})
            </button>
          ) : null}
        </div>

        {queue.entries.length > 0 ? (
          <ul className="timeline-list">
            {queue.entries.slice(0, 8).map((entry) => (
              <li key={entry.id}>
                <div>
                  <p>{entry.key}</p>
                  <small>
                    {entry.status} • attempt {entry.attempts}
                    {entry.lastError ? ` • ${entry.lastError}` : ''}
                  </small>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => void queue.retryEntry(entry.id)}>
                    Retry
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => queue.discardEntry(entry.id)}>
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
          <div className="table-wrap">
            <table>
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
                    <tr key={purchase._id}>
                      <td>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(purchase._id)} />
                      </td>
                      <td>{purchase.item}</td>
                      <td>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</td>
                      <td>{purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)}</td>
                      <td>{purchase.category}</td>
                      <td>{status}</td>
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

