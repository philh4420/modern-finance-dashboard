import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { AccountEntry, CardEntry, PurchaseEntry, PurchaseId, ReconciliationStatus } from '../components/financeTypes'
import { useOfflineQueue } from './useOfflineQueue'
import type { MutationHandlers } from './useMutationFeedback'

export type ReconcileAmountBand = 'all' | 'under_25' | '25_100' | '100_250' | '250_500' | '500_plus'

export type ReconcileFilter = {
  query: string
  status: 'all' | ReconciliationStatus
  category: string
  account: 'all' | string
  month: string
  startDate: string
  endDate: string
  amountBand: ReconcileAmountBand
  needsAttentionOnly: boolean
  sortBy: 'date' | 'amount' | 'item' | 'status'
  sortDir: 'asc' | 'desc'
}

export type ReconcileSourceOption = {
  value: string
  label: string
}

export type ReconcileSummary = {
  pendingCount: number
  pendingValue: number
  matchedTodayCount: number
  unresolvedDelta: number
  completionPercent: number
  totalCount: number
  reconciledCount: number
  needsAttentionCount: number
}

type ReconcileUndoAction = {
  purchaseId: PurchaseId
  label: string
  previousStatus: ReconciliationStatus
  previousCategory: string
  previousStatementMonth: string
}

type UseReconciliationSectionArgs = {
  purchases: PurchaseEntry[]
  accounts: AccountEntry[]
  cards: CardEntry[]
  userId: string | null | undefined
  onQueueMetric?: (metric: {
    event: string
    queuedCount: number
    conflictCount: number
    flushAttempted: number
    flushSucceeded: number
  }) => void | Promise<void>
} & MutationHandlers

const statusFromPurchase = (purchase: PurchaseEntry): ReconciliationStatus => purchase.reconciliationStatus ?? 'posted'

const normalizeCategory = (value: string) => value.trim().toLowerCase()

const isLowSignalCategory = (value: string) => {
  const normalized = normalizeCategory(value)
  return normalized.length === 0 || normalized === 'other' || normalized === 'uncategorized' || normalized === 'split / review'
}

const resolveFundingSourceKey = (purchase: PurchaseEntry) => {
  if (purchase.fundingSourceType === 'account' && purchase.fundingSourceId) {
    return `account:${purchase.fundingSourceId}`
  }
  if (purchase.fundingSourceType === 'card' && purchase.fundingSourceId) {
    return `card:${purchase.fundingSourceId}`
  }
  return 'unassigned'
}

const matchesAmountBand = (amount: number, band: ReconcileAmountBand) => {
  const normalizedAmount = Math.abs(amount)
  if (band === 'under_25') return normalizedAmount < 25
  if (band === '25_100') return normalizedAmount >= 25 && normalizedAmount < 100
  if (band === '100_250') return normalizedAmount >= 100 && normalizedAmount < 250
  if (band === '250_500') return normalizedAmount >= 250 && normalizedAmount < 500
  if (band === '500_plus') return normalizedAmount >= 500
  return true
}

export const reconcileDefaultFilter: ReconcileFilter = {
  query: '',
  status: 'all',
  category: 'all',
  account: 'all',
  month: new Date().toISOString().slice(0, 7),
  startDate: '',
  endDate: '',
  amountBand: 'all',
  needsAttentionOnly: false,
  sortBy: 'date',
  sortDir: 'desc',
}

export const useReconciliationSection = ({
  purchases,
  accounts,
  cards,
  userId,
  onQueueMetric,
  clearError,
  handleMutationError,
}: UseReconciliationSectionArgs) => {
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const bulkUpdatePurchaseCategory = useMutation(api.phase2.bulkUpdatePurchaseCategory)
  const bulkDeletePurchases = useMutation(api.phase2.bulkDeletePurchases)

  const [filter, setFilter] = useState<ReconcileFilter>(reconcileDefaultFilter)
  const [selectedIds, setSelectedIds] = useState<PurchaseId[]>([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [undoByPurchaseId, setUndoByPurchaseId] = useState<Record<string, ReconcileUndoAction>>({})

  const queue = useOfflineQueue({
    storageKey: 'finance-offline-queue-v2-reconcile',
    executors: {
      bulkUpdatePurchaseReconciliation: async (args) => {
        await bulkUpdatePurchaseReconciliation(args as Parameters<typeof bulkUpdatePurchaseReconciliation>[0])
      },
      bulkUpdatePurchaseCategory: async (args) => {
        await bulkUpdatePurchaseCategory(args as Parameters<typeof bulkUpdatePurchaseCategory>[0])
      },
      bulkDeletePurchases: async (args) => {
        await bulkDeletePurchases(args as Parameters<typeof bulkDeletePurchases>[0])
      },
    },
    userId,
    onMetric: onQueueMetric,
  })

  const accountNameById = useMemo(
    () => new Map<string, string>(accounts.map((account) => [String(account._id), account.name])),
    [accounts],
  )
  const cardNameById = useMemo(() => new Map<string, string>(cards.map((card) => [String(card._id), card.name])), [cards])

  const sourceOptions = useMemo<ReconcileSourceOption[]>(() => {
    const options = new Map<string, string>()
    options.set('unassigned', 'Unassigned cash pool')

    purchases.forEach((purchase) => {
      const key = resolveFundingSourceKey(purchase)
      if (key === 'unassigned') {
        return
      }
      if (key.startsWith('account:')) {
        const accountId = key.slice('account:'.length)
        const accountName = accountNameById.get(accountId) ?? 'Unknown account'
        options.set(key, `Account • ${accountName}`)
        return
      }
      if (key.startsWith('card:')) {
        const cardId = key.slice('card:'.length)
        const cardName = cardNameById.get(cardId) ?? 'Unknown card'
        options.set(key, `Card • ${cardName}`)
      }
    })

    return [{ value: 'all', label: 'All sources' }, ...Array.from(options.entries()).map(([value, label]) => ({ value, label }))].sort(
      (left, right) => {
        if (left.value === 'all') return -1
        if (right.value === 'all') return 1
        return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
      },
    )
  }, [accountNameById, cardNameById, purchases])

  const purchaseById = useMemo(() => new Map<string, PurchaseEntry>(purchases.map((purchase) => [String(purchase._id), purchase])), [purchases])

  const categories = useMemo(
    () => Array.from(new Set(purchases.map((purchase) => purchase.category))).sort((a, b) => a.localeCompare(b)),
    [purchases],
  )

  const filteredPurchases = useMemo(() => {
    const query = filter.query.trim().toLowerCase()

    const list = purchases.filter((purchase) => {
      const status = statusFromPurchase(purchase)
      const month = purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)
      const source = resolveFundingSourceKey(purchase)
      const needsAttention = status === 'pending' || isLowSignalCategory(purchase.category)
      const matchesQuery =
        query.length === 0 ||
        purchase.item.toLowerCase().includes(query) ||
        purchase.category.toLowerCase().includes(query) ||
        (purchase.notes ?? '').toLowerCase().includes(query)
      const matchesStatus = filter.status === 'all' || status === filter.status
      const matchesCategory = filter.category === 'all' || purchase.category === filter.category
      const matchesSource = filter.account === 'all' || source === filter.account
      const matchesMonth = filter.month.length === 0 || month === filter.month
      const matchesStartDate = filter.startDate.length === 0 || purchase.purchaseDate >= filter.startDate
      const matchesEndDate = filter.endDate.length === 0 || purchase.purchaseDate <= filter.endDate
      const matchesAmount = matchesAmountBand(purchase.amount, filter.amountBand)
      const matchesNeedsAttention = !filter.needsAttentionOnly || needsAttention

      return (
        matchesQuery &&
        matchesStatus &&
        matchesCategory &&
        matchesSource &&
        matchesMonth &&
        matchesStartDate &&
        matchesEndDate &&
        matchesAmount &&
        matchesNeedsAttention
      )
    })

    list.sort((left, right) => {
      const direction = filter.sortDir === 'asc' ? 1 : -1
      if (filter.sortBy === 'amount') {
        return (left.amount - right.amount) * direction
      }
      if (filter.sortBy === 'item') {
        return left.item.localeCompare(right.item) * direction
      }
      if (filter.sortBy === 'status') {
        return statusFromPurchase(left).localeCompare(statusFromPurchase(right)) * direction
      }
      return left.purchaseDate.localeCompare(right.purchaseDate) * direction
    })

    return list
  }, [filter, purchases])

  const summary = useMemo<ReconcileSummary>(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startOfDayAt = startOfDay.getTime()

    const totals = filteredPurchases.reduce(
      (accumulator, purchase) => {
        const status = statusFromPurchase(purchase)
        if (status === 'pending') {
          accumulator.pendingCount += 1
          accumulator.pendingValue += purchase.amount
        }
        if (status === 'reconciled') {
          accumulator.reconciledCount += 1
        } else {
          accumulator.unresolvedDelta += purchase.amount
        }

        if (status === 'pending' || isLowSignalCategory(purchase.category)) {
          accumulator.needsAttentionCount += 1
        }

        const matchedAt = purchase.reconciledAt ?? purchase.postedAt
        if (typeof matchedAt === 'number' && matchedAt >= startOfDayAt) {
          accumulator.matchedTodayCount += 1
        }
        return accumulator
      },
      {
        pendingCount: 0,
        pendingValue: 0,
        matchedTodayCount: 0,
        unresolvedDelta: 0,
        reconciledCount: 0,
        needsAttentionCount: 0,
      },
    )

    const totalCount = filteredPurchases.length
    return {
      ...totals,
      totalCount,
      completionPercent: totalCount === 0 ? 0 : (totals.reconciledCount / totalCount) * 100,
    }
  }, [filteredPurchases])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedCount = selectedIds.length
  const selectedTotal = useMemo(
    () => purchases.filter((purchase) => selectedSet.has(purchase._id)).reduce((sum, purchase) => sum + purchase.amount, 0),
    [purchases, selectedSet],
  )

  const toggleSelected = (id: PurchaseId) => {
    setSelectedIds((previous) => (previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]))
  }

  const toggleSelectVisible = () => {
    const visibleIds = filteredPurchases.map((purchase) => purchase._id)
    const allVisibleSelected = visibleIds.every((id) => selectedSet.has(id))
    if (allVisibleSelected) {
      setSelectedIds((previous) => previous.filter((id) => !visibleIds.includes(id)))
      return
    }
    setSelectedIds((previous) => Array.from(new Set([...previous, ...visibleIds])))
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const runQueuedBulkStatus = async (input: Parameters<typeof bulkUpdatePurchaseReconciliation>[0]) => {
    await queue.runOrQueue(
      'bulkUpdatePurchaseReconciliation',
      input,
      async (args) => bulkUpdatePurchaseReconciliation(args as Parameters<typeof bulkUpdatePurchaseReconciliation>[0]),
    )
  }

  const runQueuedBulkCategory = async (input: Parameters<typeof bulkUpdatePurchaseCategory>[0]) => {
    await queue.runOrQueue(
      'bulkUpdatePurchaseCategory',
      input,
      async (args) => bulkUpdatePurchaseCategory(args as Parameters<typeof bulkUpdatePurchaseCategory>[0]),
    )
  }

  const runQueuedBulkDelete = async (input: Parameters<typeof bulkDeletePurchases>[0]) => {
    await queue.runOrQueue('bulkDeletePurchases', input, async (args) => bulkDeletePurchases(args as Parameters<typeof bulkDeletePurchases>[0]))
  }

  const rememberUndo = (purchase: PurchaseEntry, label: string) => {
    setUndoByPurchaseId((previous) => ({
      ...previous,
      [String(purchase._id)]: {
        purchaseId: purchase._id,
        label,
        previousStatus: statusFromPurchase(purchase),
        previousCategory: purchase.category,
        previousStatementMonth: purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7),
      },
    }))
  }

  const resolveStatementMonth = (purchase: PurchaseEntry) => {
    return purchase.statementMonth ?? (filter.month || purchase.purchaseDate.slice(0, 7))
  }

  const runBulkStatus = async (status: ReconciliationStatus) => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await runQueuedBulkStatus({
        ids: selectedIds,
        reconciliationStatus: status,
        statementMonth: filter.month || undefined,
      })
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkCategory = async () => {
    if (selectedIds.length === 0 || bulkCategory.trim().length === 0) return
    clearError()
    try {
      await runQueuedBulkCategory({
        ids: selectedIds,
        category: bulkCategory,
      })
      clearSelection()
      setBulkCategory('')
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickMatch = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Match')
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'posted',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickSplit = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Split')
      await runQueuedBulkCategory({
        ids: [purchaseId],
        category: 'Split / review',
      })
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'pending',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickMarkReviewed = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Reviewed')
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'reconciled',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickExclude = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Exclude')
      await runQueuedBulkCategory({
        ids: [purchaseId],
        category: 'Excluded',
      })
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'reconciled',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickUndo = async (purchaseId: PurchaseId) => {
    const key = String(purchaseId)
    const action = undoByPurchaseId[key]
    if (!action) return
    clearError()
    try {
      await runQueuedBulkCategory({
        ids: [purchaseId],
        category: action.previousCategory,
      })
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: action.previousStatus,
        statementMonth: action.previousStatementMonth,
      })
      setUndoByPurchaseId((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkDelete = async () => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await runQueuedBulkDelete({
        ids: selectedIds,
      })
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    filter,
    setFilter,
    sourceOptions,
    summary,
    categories,
    filteredPurchases,
    selectedIds,
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
  }
}
