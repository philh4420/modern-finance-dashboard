import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { PurchaseEntry, PurchaseId, ReconciliationStatus } from './financeTypes'
import type { OfflineQueueEntry } from '../hooks/useOfflineQueue'
import { reconcileDefaultFilter, type ReconcileFilter, type ReconcileSourceOption, type ReconcileSummary } from '../hooks/useReconciliationSection'

type ReconcileTabProps = {
  filter: ReconcileFilter
  setFilter: Dispatch<SetStateAction<ReconcileFilter>>
  categories: string[]
  sourceOptions: ReconcileSourceOption[]
  summary: ReconcileSummary
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
  runQuickMatch: (id: PurchaseId) => Promise<void>
  runQuickSplit: (id: PurchaseId) => Promise<void>
  runQuickMarkReviewed: (id: PurchaseId) => Promise<void>
  runQuickExclude: (id: PurchaseId) => Promise<void>
  runQuickUndo: (id: PurchaseId) => Promise<void>
  undoByPurchaseId: Record<string, { label: string }>
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
  sourceOptions,
  summary,
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
  runQuickMatch,
  runQuickSplit,
  runQuickMarkReviewed,
  runQuickExclude,
  runQuickUndo,
  undoByPurchaseId,
  queue,
  formatMoney,
  dateLabel,
}: ReconcileTabProps) {
  const viewTotal = useMemo(() => filteredPurchases.reduce((sum, purchase) => sum + purchase.amount, 0), [filteredPurchases])
  const sourceLabelByKey = useMemo(
    () => new Map<string, string>(sourceOptions.map((option) => [option.value, option.label])),
    [sourceOptions],
  )

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

  const resolveSourceLabel = (purchase: PurchaseEntry) => {
    if (purchase.fundingSourceType === 'account' && purchase.fundingSourceId) {
      return sourceLabelByKey.get(`account:${purchase.fundingSourceId}`) ?? 'Account • Unknown'
    }
    if (purchase.fundingSourceType === 'card' && purchase.fundingSourceId) {
      return sourceLabelByKey.get(`card:${purchase.fundingSourceId}`) ?? 'Card • Unknown'
    }
    return sourceLabelByKey.get('unassigned') ?? 'Unassigned cash pool'
  }

  const purchaseNeedsAttention = (purchase: PurchaseEntry) => {
    const status = purchase.reconciliationStatus ?? 'posted'
    const category = purchase.category.trim().toLowerCase()
    return status === 'pending' || category.length === 0 || category === 'other' || category === 'uncategorized' || category === 'split / review'
  }

  const clearFilters = () => {
    setFilter({ ...reconcileDefaultFilter })
    clearSelection()
  }

  const hasActiveFilter =
    filter.query.length > 0 ||
    filter.status !== reconcileDefaultFilter.status ||
    filter.category !== reconcileDefaultFilter.category ||
    filter.account !== reconcileDefaultFilter.account ||
    filter.month !== reconcileDefaultFilter.month ||
    filter.startDate.length > 0 ||
    filter.endDate.length > 0 ||
    filter.amountBand !== reconcileDefaultFilter.amountBand ||
    filter.needsAttentionOnly ||
    filter.sortBy !== reconcileDefaultFilter.sortBy ||
    filter.sortDir !== reconcileDefaultFilter.sortDir ||
    hasSelection

  return (
    <section className="editor-grid reconcile-tab-shell" aria-label="Reconciliation workspace">
      <article className="panel panel-reconcile-strip">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Reconciliation</p>
            <h2>Progress strip</h2>
            <p className="panel-value">
              {summary.totalCount} in scope · {summary.completionPercent.toFixed(0)}% complete
            </p>
            <p className="subnote">
              Pending {summary.pendingCount} ({formatMoney(summary.pendingValue)}) · unresolved {formatMoney(summary.unresolvedDelta)}
            </p>
          </div>
        </header>

        <div className="reconcile-summary-strip">
          <article className="reconcile-summary-card">
            <p>Pending value</p>
            <strong>{formatMoney(summary.pendingValue)}</strong>
            <small>{summary.pendingCount} transactions still pending</small>
          </article>
          <article className="reconcile-summary-card">
            <p>Matched today</p>
            <strong>{summary.matchedTodayCount}</strong>
            <small>Posted or reconciled today</small>
          </article>
          <article className="reconcile-summary-card">
            <p>Unresolved delta</p>
            <strong>{formatMoney(summary.unresolvedDelta)}</strong>
            <small>Open amount not reconciled</small>
          </article>
          <article className="reconcile-summary-card">
            <p>Completion</p>
            <strong>{summary.completionPercent.toFixed(0)}%</strong>
            <small>{summary.reconciledCount} of {summary.totalCount} reconciled</small>
          </article>
          <article className="reconcile-summary-card">
            <p>Needs attention</p>
            <strong>{summary.needsAttentionCount}</strong>
            <small>Pending or low-signal category rows</small>
          </article>
        </div>
      </article>

      <article className="panel panel-reconcile-queue">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Queue</p>
            <h2>Offline operations</h2>
            <p className="panel-value">
              {queue.pendingCount} pending · {queue.conflictCount} conflicts
            </p>
            <p className="subnote">Retry, discard, and flush queued reconciliation updates.</p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void queue.flushQueue()}
              disabled={queue.isFlushing || queue.pendingCount === 0}
            >
              {queue.isFlushing ? 'Flushing...' : `Flush (${queue.pendingCount})`}
            </button>
            {queue.conflictCount > 0 ? (
              <button type="button" className="btn btn-ghost btn--sm" onClick={queue.clearConflicts}>
                Clear conflicts
              </button>
            ) : null}
          </div>
        </header>

        {queue.entries.length > 0 ? (
          <ul className="timeline-list">
            {queue.entries.slice(0, 10).map((entry) => (
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
      </article>

      <article className="panel panel-reconcile-workspace">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Match Workspace</p>
            <h2>Review + resolve entries</h2>
            <p className="panel-value">
              {filteredPurchases.length} in view · {formatMoney(viewTotal)}
            </p>
            <p className="subnote">Fast filters + row quick actions: Match, Split, Review, Exclude, Undo.</p>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-secondary btn--sm" onClick={toggleSelectVisible} disabled={filteredPurchases.length === 0}>
              {allVisibleSelected ? 'Deselect view' : 'Select view'}
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={clearSelection} disabled={!hasSelection}>
              Clear selection
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={clearFilters} disabled={!hasActiveFilter}>
              Reset
            </button>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid reconcile-filter-grid">
            <div className="form-field">
              <label htmlFor="reconcile-query">Merchant/category</label>
              <input
                id="reconcile-query"
                type="search"
                placeholder="Search item, category, notes"
                value={filter.query}
                onChange={(event) => setFilter((previous) => ({ ...previous, query: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="reconcile-account">Source</label>
              <select
                id="reconcile-account"
                value={filter.account}
                onChange={(event) => setFilter((previous) => ({ ...previous, account: event.target.value }))}
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

            <div className="form-field">
              <label htmlFor="reconcile-amount-band">Amount band</label>
              <select
                id="reconcile-amount-band"
                value={filter.amountBand}
                onChange={(event) =>
                  setFilter((previous) => ({ ...previous, amountBand: event.target.value as ReconcileFilter['amountBand'] }))
                }
              >
                <option value="all">All amounts</option>
                <option value="under_25">Under 25</option>
                <option value="25_100">25 to 100</option>
                <option value="100_250">100 to 250</option>
                <option value="250_500">250 to 500</option>
                <option value="500_plus">500+</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="reconcile-date-start">From date</label>
              <input
                id="reconcile-date-start"
                type="date"
                value={filter.startDate}
                onChange={(event) => setFilter((previous) => ({ ...previous, startDate: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="reconcile-date-end">To date</label>
              <input
                id="reconcile-date-end"
                type="date"
                value={filter.endDate}
                onChange={(event) => setFilter((previous) => ({ ...previous, endDate: event.target.value }))}
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

            <div className="form-field">
              <label htmlFor="reconcile-sort">Sort</label>
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
            </div>

            <div className="form-field">
              <label htmlFor="reconcile-sort-dir">Direction</label>
              <select
                id="reconcile-sort-dir"
                value={filter.sortDir}
                onChange={(event) =>
                  setFilter((previous) => ({ ...previous, sortDir: event.target.value as ReconcileFilter['sortDir'] }))
                }
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>

            <div className="form-field reconcile-filter-toggle">
              <label className="cards-override-toggle cards-override-toggle--inline" htmlFor="reconcile-needs-attention">
                <input
                  id="reconcile-needs-attention"
                  type="checkbox"
                  checked={filter.needsAttentionOnly}
                  onChange={(event) => setFilter((previous) => ({ ...previous, needsAttentionOnly: event.target.checked }))}
                />
                <span>Needs attention only</span>
              </label>
            </div>
          </div>

          {filteredPurchases.length === 0 ? (
            <p className="empty-state">No purchases match this filter.</p>
          ) : (
            <>
              <div className="table-wrap table-wrap--card reconcile-table-wrap">
                <table className="data-table data-table--reconcile" data-testid="reconcile-table">
                  <caption className="sr-only">Reconciliation entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Select</th>
                      <th scope="col">Item</th>
                      <th scope="col">Date</th>
                      <th scope="col">Source</th>
                      <th scope="col">Category</th>
                      <th scope="col">Status</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchases.map((purchase) => {
                      const isSelected = selectedSet.has(purchase._id)
                      const status = purchase.reconciliationStatus ?? 'posted'
                      const canUndo = Boolean(undoByPurchaseId[String(purchase._id)])
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
                            <div className="cell-stack">
                              <strong className="cell-truncate" title={purchase.item}>
                                {purchase.item}
                              </strong>
                              {purchaseNeedsAttention(purchase) ? <small className="amount-negative">Needs attention</small> : <small>Ready</small>}
                            </div>
                          </td>
                          <td>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</td>
                          <td>
                            <span className="pill pill--neutral">{resolveSourceLabel(purchase)}</span>
                          </td>
                          <td>
                            <span className="pill pill--neutral">{purchase.category}</span>
                          </td>
                          <td>
                            <span className={statusPill(status)}>{status}</span>
                          </td>
                          <td className="table-amount amount-negative">{formatMoney(purchase.amount)}</td>
                          <td>
                            <div className="row-actions row-actions--reconcile">
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickMatch(purchase._id)}>
                                Match
                              </button>
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickSplit(purchase._id)}>
                                Split
                              </button>
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickMarkReviewed(purchase._id)}>
                                Review
                              </button>
                              <button type="button" className="btn btn-ghost btn--sm" onClick={() => void runQuickExclude(purchase._id)}>
                                Exclude
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn--sm"
                                onClick={() => void runQuickUndo(purchase._id)}
                                disabled={!canUndo}
                              >
                                Undo
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="reconcile-mobile-list" aria-label="Reconciliation entries mobile">
                {filteredPurchases.map((purchase) => {
                  const isSelected = selectedSet.has(purchase._id)
                  const status = purchase.reconciliationStatus ?? 'posted'
                  const canUndo = Boolean(undoByPurchaseId[String(purchase._id)])
                  return (
                    <details key={purchase._id} className="reconcile-mobile-item">
                      <summary>
                        <div className="reconcile-mobile-summary-main">
                          <strong>{purchase.item}</strong>
                          <small>{resolveSourceLabel(purchase)}</small>
                        </div>
                        <div className="reconcile-mobile-summary-metrics">
                          <span className={statusPill(status)}>{status}</span>
                          <span className="reconcile-mobile-amount amount-negative">{formatMoney(purchase.amount)}</span>
                        </div>
                      </summary>
                      <div className="reconcile-mobile-content">
                        <div className="reconcile-mobile-grid">
                          <div>
                            <span>Date</span>
                            <strong>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</strong>
                          </div>
                          <div>
                            <span>Statement</span>
                            <strong>{purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)}</strong>
                          </div>
                          <div>
                            <span>Category</span>
                            <strong>{purchase.category}</strong>
                          </div>
                          <div>
                            <span>Needs attention</span>
                            <strong>{purchaseNeedsAttention(purchase) ? 'Yes' : 'No'}</strong>
                          </div>
                        </div>
                        <label className="cards-override-toggle">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(purchase._id)} />
                          <span>Select row</span>
                        </label>
                        <div className="row-actions row-actions--reconcile-mobile">
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickMatch(purchase._id)}>
                            Match
                          </button>
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickSplit(purchase._id)}>
                            Split
                          </button>
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickMarkReviewed(purchase._id)}>
                            Review
                          </button>
                          <button type="button" className="btn btn-ghost btn--sm" onClick={() => void runQuickExclude(purchase._id)}>
                            Exclude
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn--sm"
                            onClick={() => void runQuickUndo(purchase._id)}
                            disabled={!canUndo}
                          >
                            Undo
                          </button>
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </article>

      <article className="panel panel-reconcile-summary">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Reconciliation Summary</p>
            <h2>Bulk workflow</h2>
            <p className="panel-value">
              {selectedCount} selected · {formatMoney(selectedTotal)}
            </p>
            <p className="subnote">
              Keep throughput high with bulk status/category updates and destructive cleanup controls.
            </p>
          </div>
        </header>

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

        {Object.keys(undoByPurchaseId).length > 0 ? (
          <p className="form-hint">
            <strong>{Object.keys(undoByPurchaseId).length} undo action(s)</strong> available from row quick actions.
          </p>
        ) : (
          <p className="form-hint">Use row quick actions to stage undo checkpoints.</p>
        )}
      </article>
    </section>
  )
}
