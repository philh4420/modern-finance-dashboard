import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountEntry,
  CardEntry,
  PurchaseEditDraft,
  PurchaseEntry,
  PurchaseFilter,
  PurchaseForm,
  PurchaseId,
  PurchaseSavedView,
  ReconciliationStatus,
} from './financeTypes'

type PurchaseSortKey =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'status'
  | 'category_asc'
  | 'merchant_asc'

const savedViewOptions: Array<{ value: PurchaseSavedView; label: string; detail: string }> = [
  { value: 'month_all', label: 'This month', detail: 'All statuses in the current month.' },
  { value: 'month_pending', label: 'Pending month', detail: 'Only pending purchases this month.' },
  { value: 'month_unreconciled', label: 'Posted month', detail: 'Posted but not reconciled this month.' },
  { value: 'month_reconciled', label: 'Reconciled month', detail: 'Only reconciled purchases this month.' },
  { value: 'all_unreconciled', label: 'All unreconciled', detail: 'Posted purchases across all months.' },
  { value: 'all_purchases', label: 'All purchases', detail: 'Every purchase, every status.' },
]

type PurchasesTabProps = {
  accounts: AccountEntry[]
  cards: CardEntry[]
  purchaseForm: PurchaseForm
  setPurchaseForm: Dispatch<SetStateAction<PurchaseForm>>
  purchaseFilter: PurchaseFilter
  setPurchaseFilter: Dispatch<SetStateAction<PurchaseFilter>>
  purchaseCategories: string[]
  filteredPurchases: PurchaseEntry[]
  filteredPurchaseTotal: number
  filteredPurchaseAverage: number
  monthPurchaseSummary: {
    monthTotal: number
    pendingTotal: number
    postedTotal: number
    reconciledTotal: number
    clearedTotal: number
    pendingCount: number
    postedCount: number
    reconciledCount: number
  }
  filteredStatusCounts: {
    pending: number
    posted: number
    reconciled: number
  }
  purchasesThisMonth: number
  pendingPurchaseAmountThisMonth: number
  pendingPurchases: number
  postedPurchases: number
  reconciledPurchases: number
  purchaseEditId: PurchaseId | null
  setPurchaseEditId: Dispatch<SetStateAction<PurchaseId | null>>
  purchaseEditDraft: PurchaseEditDraft
  setPurchaseEditDraft: Dispatch<SetStateAction<PurchaseEditDraft>>
  selectedPurchaseCount: number
  selectedPurchaseTotal: number
  selectedPurchaseSet: Set<PurchaseId>
  toggleSelectedPurchase: (id: PurchaseId) => void
  toggleSelectFilteredPurchases: () => void
  clearSelectedPurchases: () => void
  bulkCategory: string
  setBulkCategory: Dispatch<SetStateAction<string>>
  savedView: PurchaseSavedView
  applySavedView: (savedView: PurchaseSavedView) => void
  onAddPurchase: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeletePurchase: (id: PurchaseId) => Promise<void>
  savePurchaseEdit: () => Promise<void>
  startPurchaseEdit: (entry: PurchaseEntry) => void
  onSetPurchaseReconciliation: (id: PurchaseId, status: ReconciliationStatus) => Promise<void>
  duplicatePurchase: (entry: PurchaseEntry) => Promise<void>
  runBulkStatus: (status: ReconciliationStatus) => Promise<void>
  runBulkCategory: () => Promise<void>
  runBulkDelete: () => Promise<void>
  formatMoney: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

const statusOrder = (status: ReconciliationStatus) => {
  if (status === 'pending') return 0
  if (status === 'posted') return 1
  return 2
}

const statusLabel = (status: ReconciliationStatus) => {
  if (status === 'pending') return 'Pending'
  if (status === 'reconciled') return 'Reconciled'
  return 'Posted'
}

const statusPillClass = (status: ReconciliationStatus) => {
  if (status === 'pending') return 'pill pill--warning'
  if (status === 'reconciled') return 'pill pill--good'
  return 'pill pill--neutral'
}

const ownershipLabel = (value: PurchaseEntry['ownership']) => {
  if (value === 'personal') return 'Personal'
  return 'Shared'
}

export function PurchasesTab({
  accounts,
  cards,
  purchaseForm,
  setPurchaseForm,
  purchaseFilter,
  setPurchaseFilter,
  purchaseCategories,
  filteredPurchases,
  filteredPurchaseTotal,
  filteredPurchaseAverage,
  monthPurchaseSummary,
  filteredStatusCounts,
  purchasesThisMonth,
  pendingPurchaseAmountThisMonth,
  pendingPurchases,
  postedPurchases,
  reconciledPurchases,
  purchaseEditId,
  setPurchaseEditId,
  purchaseEditDraft,
  setPurchaseEditDraft,
  selectedPurchaseCount,
  selectedPurchaseTotal,
  selectedPurchaseSet,
  toggleSelectedPurchase,
  toggleSelectFilteredPurchases,
  clearSelectedPurchases,
  bulkCategory,
  setBulkCategory,
  savedView,
  applySavedView,
  onAddPurchase,
  onDeletePurchase,
  savePurchaseEdit,
  startPurchaseEdit,
  onSetPurchaseReconciliation,
  duplicatePurchase,
  runBulkStatus,
  runBulkCategory,
  runBulkDelete,
  formatMoney,
  dateLabel,
}: PurchasesTabProps) {
  const [sortKey, setSortKey] = useState<PurchaseSortKey>('date_desc')
  const defaultMonth = new Date().toISOString().slice(0, 7)

  const accountNameById = useMemo(
    () => new Map<string, string>(accounts.map((entry) => [String(entry._id), entry.name])),
    [accounts],
  )
  const cardNameById = useMemo(
    () => new Map<string, string>(cards.map((entry) => [String(entry._id), entry.name])),
    [cards],
  )

  const fundingLabelByEntry = (entry: Pick<PurchaseEntry, 'fundingSourceType' | 'fundingSourceId'>) => {
    const sourceType = entry.fundingSourceType ?? 'unassigned'
    if (sourceType === 'account') {
      if (!entry.fundingSourceId) return 'Account (unlinked)'
      return accountNameById.get(entry.fundingSourceId) ?? 'Account (not found)'
    }
    if (sourceType === 'card') {
      if (!entry.fundingSourceId) return 'Card (unlinked)'
      return cardNameById.get(entry.fundingSourceId) ?? 'Card (not found)'
    }
    return 'Unassigned source'
  }

  const visiblePurchases = useMemo(() => {
    const sorted = [...filteredPurchases].sort((left, right) => {
      const leftStatus = (left.reconciliationStatus ?? 'posted') as ReconciliationStatus
      const rightStatus = (right.reconciliationStatus ?? 'posted') as ReconciliationStatus

      switch (sortKey) {
        case 'date_desc':
          return right.purchaseDate.localeCompare(left.purchaseDate)
        case 'date_asc':
          return left.purchaseDate.localeCompare(right.purchaseDate)
        case 'amount_desc':
          return right.amount - left.amount
        case 'amount_asc':
          return left.amount - right.amount
        case 'status':
          return statusOrder(leftStatus) - statusOrder(rightStatus)
        case 'category_asc':
          return left.category.localeCompare(right.category, undefined, { sensitivity: 'base' })
        case 'merchant_asc':
          return left.item.localeCompare(right.item, undefined, { sensitivity: 'base' })
        default:
          return 0
      }
    })

    return sorted
  }, [filteredPurchases, sortKey])

  const allVisibleSelected =
    visiblePurchases.length > 0 && visiblePurchases.every((entry) => selectedPurchaseSet.has(entry._id))

  const insights = useMemo(() => {
    const uncategorized = filteredPurchases.filter((entry) => entry.category.trim().length === 0).length
    const personalSpend = filteredPurchases
      .filter((entry) => (entry.ownership ?? 'shared') === 'personal')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const sharedSpend = filteredPurchases
      .filter((entry) => (entry.ownership ?? 'shared') !== 'personal')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const deductibleCount = filteredPurchases.filter((entry) => Boolean(entry.taxDeductible)).length

    const merchantTotals = new Map<string, number>()
    filteredPurchases.forEach((entry) => {
      const key = entry.item.trim()
      merchantTotals.set(key, (merchantTotals.get(key) ?? 0) + entry.amount)
    })

    const topMerchants = [...merchantTotals.entries()]
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 5)

    return {
      uncategorized,
      personalSpend,
      sharedSpend,
      deductibleCount,
      topMerchants,
    }
  }, [filteredPurchases])

  return (
    <section className="editor-grid purchases-tab-shell" aria-label="Purchase management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Add purchase</h2>
            <p className="panel-value">
              {formatMoney(monthPurchaseSummary.monthTotal)} this month · {formatMoney(monthPurchaseSummary.clearedTotal)} cleared
            </p>
            <p className="subnote">
              {monthPurchaseSummary.pendingCount} pending ({formatMoney(monthPurchaseSummary.pendingTotal)}) ·{' '}
              {monthPurchaseSummary.postedCount} posted · {monthPurchaseSummary.reconciledCount} reconciled
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddPurchase} aria-describedby="purchase-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="purchase-item">Merchant / item</label>
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
              <label htmlFor="purchase-reconciliation-status">Status</label>
              <select
                id="purchase-reconciliation-status"
                value={purchaseForm.reconciliationStatus}
                onChange={(event) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    reconciliationStatus: event.target.value as ReconciliationStatus,
                  }))
                }
              >
                <option value="pending">Pending</option>
                <option value="posted">Posted</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-ownership">Ownership</label>
              <select
                id="purchase-ownership"
                value={purchaseForm.ownership}
                onChange={(event) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    ownership: event.target.value as PurchaseForm['ownership'],
                  }))
                }
              >
                <option value="shared">Shared / household</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-source-type">Funding source type</label>
              <select
                id="purchase-source-type"
                value={purchaseForm.fundingSourceType}
                onChange={(event) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    fundingSourceType: event.target.value as PurchaseForm['fundingSourceType'],
                    fundingSourceId: '',
                  }))
                }
              >
                <option value="unassigned">Unassigned</option>
                <option value="account">Account</option>
                <option value="card">Card</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-source-id">Source</label>
              <select
                id="purchase-source-id"
                value={purchaseForm.fundingSourceId}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, fundingSourceId: event.target.value }))}
                disabled={purchaseForm.fundingSourceType === 'unassigned'}
              >
                <option value="">
                  {purchaseForm.fundingSourceType === 'account'
                    ? 'Select account'
                    : purchaseForm.fundingSourceType === 'card'
                      ? 'Select card'
                      : 'No source needed'}
                </option>
                {purchaseForm.fundingSourceType === 'account'
                  ? accounts.map((entry) => (
                      <option key={entry._id} value={String(entry._id)}>
                        {entry.name}
                      </option>
                    ))
                  : null}
                {purchaseForm.fundingSourceType === 'card'
                  ? cards.map((entry) => (
                      <option key={entry._id} value={String(entry._id)}>
                        {entry.name}
                      </option>
                    ))
                  : null}
              </select>
            </div>

            <label className="checkbox-row form-field--span2" htmlFor="purchase-tax-deductible">
              <input
                id="purchase-tax-deductible"
                type="checkbox"
                checked={purchaseForm.taxDeductible}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, taxDeductible: event.target.checked }))}
              />
              Tax deductible
            </label>

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
            Add manual purchases with a source, ownership, and reconciliation status so dashboard totals and reporting stay accurate.
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
            <p className="subnote">
              Avg {formatMoney(filteredPurchaseAverage)} · {filteredStatusCounts.pending} pending · {filteredStatusCounts.posted}{' '}
              posted · {filteredStatusCounts.reconciled} reconciled
            </p>
          </div>
        </header>

        <div className="saved-view-row" role="group" aria-label="Saved purchase views">
          {savedViewOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`saved-view-chip ${savedView === option.value ? 'saved-view-chip--active' : ''}`}
              onClick={() => applySavedView(option.value)}
              title={option.detail}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="filter-row purchases-filter-row" role="group" aria-label="Purchase filters">
          <input
            type="search"
            aria-label="Search purchases"
            placeholder="Search merchant, category, notes"
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
            aria-label="Filter by status"
            value={purchaseFilter.reconciliationStatus}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                reconciliationStatus: event.target.value as PurchaseFilter['reconciliationStatus'],
              }))
            }
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
            <option value="reconciled">Reconciled</option>
          </select>

          <select
            aria-label="Filter by ownership"
            value={purchaseFilter.ownership}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                ownership: event.target.value as PurchaseFilter['ownership'],
              }))
            }
          >
            <option value="all">All ownership</option>
            <option value="shared">Shared</option>
            <option value="personal">Personal</option>
          </select>

          <select
            aria-label="Filter by funding source"
            value={purchaseFilter.fundingSourceType}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                fundingSourceType: event.target.value as PurchaseFilter['fundingSourceType'],
              }))
            }
          >
            <option value="all">Any source</option>
            <option value="account">Account</option>
            <option value="card">Card</option>
            <option value="unassigned">Unassigned</option>
          </select>

          <select
            aria-label="Filter by tax deductible"
            value={purchaseFilter.taxDeductible}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                taxDeductible: event.target.value as PurchaseFilter['taxDeductible'],
              }))
            }
          >
            <option value="all">Tax tag: all</option>
            <option value="yes">Tax deductible</option>
            <option value="no">Non-deductible</option>
          </select>

          <select
            aria-label="Sort purchases"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as PurchaseSortKey)}
          >
            <option value="date_desc">Date (new-old)</option>
            <option value="date_asc">Date (old-new)</option>
            <option value="amount_desc">Amount (high-low)</option>
            <option value="amount_asc">Amount (low-high)</option>
            <option value="status">Status</option>
            <option value="category_asc">Category</option>
            <option value="merchant_asc">Merchant</option>
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
                ownership: 'all',
                taxDeductible: 'all',
                fundingSourceType: 'all',
              })
              applySavedView('month_all')
              clearSelectedPurchases()
              setSortKey('date_desc')
            }}
          >
            Clear
          </button>
        </div>

        <div className="purchase-batch-row" role="group" aria-label="Purchase batch actions">
          <p className="subnote">
            {selectedPurchaseCount} selected · {formatMoney(selectedPurchaseTotal)}
          </p>
          <button type="button" className="btn btn-secondary btn--sm" onClick={toggleSelectFilteredPurchases}>
            {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
          </button>
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('reconciled')}>
            Mark reconciled
          </button>
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('posted')}>
            Mark posted
          </button>
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('pending')}>
            Mark pending
          </button>
          <input
            type="text"
            aria-label="Bulk category"
            placeholder="Bulk category"
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.target.value)}
          />
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkCategory()}>
            Recategorize
          </button>
          <button
            type="button"
            className="btn btn-danger btn--sm"
            onClick={() => {
              if (selectedPurchaseCount === 0) return
              const shouldDelete = window.confirm(`Delete ${selectedPurchaseCount} selected purchase(s)?`)
              if (!shouldDelete) return
              void runBulkDelete()
            }}
          >
            Delete selected
          </button>
          <button type="button" className="btn btn-ghost btn--sm" onClick={clearSelectedPurchases}>
            Clear selected
          </button>
        </div>

        {visiblePurchases.length === 0 ? (
          <p className="empty-state">No purchases match this view.</p>
        ) : (
          <div className="table-wrap table-wrap--card purchases-table-wrap">
            <table className="data-table data-table--purchases" data-testid="purchases-table">
              <caption className="sr-only">Purchase entries</caption>
              <thead>
                <tr>
                  <th scope="col" className="purchase-col--select">
                    <label className="sr-only" htmlFor="purchase-select-visible">
                      Select visible purchases
                    </label>
                    <input
                      id="purchase-select-visible"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectFilteredPurchases}
                    />
                  </th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Amount + date</th>
                  <th scope="col">Category</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visiblePurchases.map((entry) => {
                  const isEditing = purchaseEditId === entry._id
                  const status = (entry.reconciliationStatus ?? 'posted') as ReconciliationStatus

                  return (
                    <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.item}`}
                          checked={selectedPurchaseSet.has(entry._id)}
                          onChange={() => toggleSelectedPurchase(entry._id)}
                        />
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={purchaseEditDraft.item}
                            onChange={(event) => setPurchaseEditDraft((prev) => ({ ...prev, item: event.target.value }))}
                          />
                        ) : (
                          <div className="purchase-merchant-cell">
                            <strong>{entry.item}</strong>
                            <small>{dateLabel.format(new Date(`${entry.purchaseDate}T00:00:00`))}</small>
                          </div>
                        )}
                      </td>
                      <td className="table-amount amount-negative">
                        {isEditing ? (
                          <div className="purchase-inline-stack">
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              value={purchaseEditDraft.amount}
                              onChange={(event) => setPurchaseEditDraft((prev) => ({ ...prev, amount: event.target.value }))}
                            />
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
                          </div>
                        ) : (
                          <div className="purchase-amount-cell">
                            <strong>{formatMoney(entry.amount)}</strong>
                            <small>Statement {(entry.statementMonth ?? entry.purchaseDate.slice(0, 7)).replace('-', '/')}</small>
                          </div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="purchase-inline-stack">
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
                            <select
                              className="inline-select"
                              value={purchaseEditDraft.ownership}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  ownership: event.target.value as PurchaseEditDraft['ownership'],
                                }))
                              }
                            >
                              <option value="shared">Shared</option>
                              <option value="personal">Personal</option>
                            </select>
                            <label className="checkbox-row purchase-inline-toggle">
                              <input
                                type="checkbox"
                                checked={purchaseEditDraft.taxDeductible}
                                onChange={(event) =>
                                  setPurchaseEditDraft((prev) => ({
                                    ...prev,
                                    taxDeductible: event.target.checked,
                                  }))
                                }
                              />
                              Tax deductible
                            </label>
                          </div>
                        ) : (
                          <div className="purchase-meta-cell">
                            <span className="pill pill--neutral">{entry.category}</span>
                            <span className="pill pill--neutral">{ownershipLabel(entry.ownership)}</span>
                            {entry.taxDeductible ? <span className="pill pill--good">Tax</span> : null}
                          </div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="purchase-inline-stack">
                            <select
                              className="inline-select"
                              value={purchaseEditDraft.fundingSourceType}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  fundingSourceType: event.target.value as PurchaseEditDraft['fundingSourceType'],
                                  fundingSourceId: '',
                                }))
                              }
                            >
                              <option value="unassigned">Unassigned</option>
                              <option value="account">Account</option>
                              <option value="card">Card</option>
                            </select>
                            <select
                              className="inline-select"
                              value={purchaseEditDraft.fundingSourceId}
                              disabled={purchaseEditDraft.fundingSourceType === 'unassigned'}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  fundingSourceId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select source</option>
                              {purchaseEditDraft.fundingSourceType === 'account'
                                ? accounts.map((account) => (
                                    <option key={account._id} value={String(account._id)}>
                                      {account.name}
                                    </option>
                                  ))
                                : null}
                              {purchaseEditDraft.fundingSourceType === 'card'
                                ? cards.map((card) => (
                                    <option key={card._id} value={String(card._id)}>
                                      {card.name}
                                    </option>
                                  ))
                                : null}
                            </select>
                          </div>
                        ) : (
                          <span className="pill pill--neutral">{fundingLabelByEntry(entry)}</span>
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
                                reconciliationStatus: event.target.value as ReconciliationStatus,
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="posted">Posted</option>
                            <option value="reconciled">Reconciled</option>
                          </select>
                        ) : (
                          <span className={statusPillClass(status)}>{statusLabel(status)}</span>
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
                            <>
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startPurchaseEdit(entry)}>
                                Edit
                              </button>
                              {status !== 'reconciled' ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => void onSetPurchaseReconciliation(entry._id, 'reconciled')}
                                >
                                  Reconcile
                                </button>
                              ) : null}
                              {status !== 'posted' ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => void onSetPurchaseReconciliation(entry._id, 'posted')}
                                >
                                  Mark posted
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-secondary btn--sm"
                                onClick={() => void duplicatePurchase(entry)}
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn--sm"
                                onClick={() => void onDeletePurchase(entry._id)}
                              >
                                Remove
                              </button>
                            </>
                          )}
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

      <article className="panel purchases-panel-insights">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Insights</p>
            <h2>Spend quality + breakdown</h2>
            <p className="panel-value">{formatMoney(monthPurchaseSummary.monthTotal)} current month total</p>
            <p className="subnote">
              Cleared {formatMoney(purchasesThisMonth)} · Pending {formatMoney(pendingPurchaseAmountThisMonth)}
            </p>
          </div>
        </header>

        <div className="purchase-summary-strip">
          <article className="purchase-summary-card">
            <p>Month total</p>
            <strong>{formatMoney(monthPurchaseSummary.monthTotal)}</strong>
            <small>{monthPurchaseSummary.pendingCount + monthPurchaseSummary.postedCount + monthPurchaseSummary.reconciledCount} records</small>
          </article>
          <article className="purchase-summary-card">
            <p>Cleared total</p>
            <strong>{formatMoney(monthPurchaseSummary.clearedTotal)}</strong>
            <small>{monthPurchaseSummary.postedCount + monthPurchaseSummary.reconciledCount} posted/reconciled</small>
          </article>
          <article className="purchase-summary-card">
            <p>Pending exposure</p>
            <strong>{formatMoney(monthPurchaseSummary.pendingTotal)}</strong>
            <small>{monthPurchaseSummary.pendingCount} pending in current month</small>
          </article>
          <article className="purchase-summary-card">
            <p>Tax-deductible</p>
            <strong>{insights.deductibleCount}</strong>
            <small>{formatMoney(filteredPurchaseTotal)} filtered spend base</small>
          </article>
        </div>

        <div className="purchase-insight-grid">
          <article className="purchase-insight-card">
            <p>Ownership split</p>
            <strong>{formatMoney(insights.personalSpend)}</strong>
            <small>personal</small>
            <small>{formatMoney(insights.sharedSpend)} shared</small>
          </article>
          <article className="purchase-insight-card">
            <p>Reconciliation backlog</p>
            <strong>{pendingPurchases}</strong>
            <small>{postedPurchases} posted · {reconciledPurchases} reconciled</small>
          </article>
          <article className="purchase-insight-card">
            <p>Data quality</p>
            <strong>{insights.uncategorized}</strong>
            <small>uncategorized in current filter</small>
          </article>
        </div>

        <div className="purchase-top-merchants">
          <h3>Top merchants (filtered)</h3>
          {insights.topMerchants.length === 0 ? (
            <p className="empty-state">No merchant spend yet for this filter.</p>
          ) : (
            <ul>
              {insights.topMerchants.map((merchant) => (
                <li key={merchant.merchant}>
                  <span>{merchant.merchant}</span>
                  <strong>{formatMoney(merchant.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </section>
  )
}
