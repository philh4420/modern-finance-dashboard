import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { PurchaseEntry, PurchaseId, ReconciliationStatus } from '../components/financeTypes'
import { useOfflineQueue } from './useOfflineQueue'
import type { MutationHandlers } from './useMutationFeedback'

type ReconcileFilter = {
  query: string
  status: 'all' | ReconciliationStatus
  category: string
  month: string
  sortBy: 'date' | 'amount' | 'item' | 'status'
  sortDir: 'asc' | 'desc'
}

type UseReconciliationSectionArgs = {
  purchases: PurchaseEntry[]
  userId: string | null | undefined
  onQueueMetric?: (metric: {
    event: string
    queuedCount: number
    conflictCount: number
    flushAttempted: number
    flushSucceeded: number
  }) => void | Promise<void>
} & MutationHandlers

const defaultFilter: ReconcileFilter = {
  query: '',
  status: 'all',
  category: 'all',
  month: new Date().toISOString().slice(0, 7),
  sortBy: 'date',
  sortDir: 'desc',
}

export const useReconciliationSection = ({ purchases, userId, onQueueMetric, clearError, handleMutationError }: UseReconciliationSectionArgs) => {
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const bulkUpdatePurchaseCategory = useMutation(api.phase2.bulkUpdatePurchaseCategory)
  const bulkDeletePurchases = useMutation(api.phase2.bulkDeletePurchases)

  const [filter, setFilter] = useState<ReconcileFilter>(defaultFilter)
  const [selectedIds, setSelectedIds] = useState<PurchaseId[]>([])
  const [bulkCategory, setBulkCategory] = useState('')

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

  const categories = useMemo(
    () => Array.from(new Set(purchases.map((purchase) => purchase.category))).sort((a, b) => a.localeCompare(b)),
    [purchases],
  )

  const filteredPurchases = useMemo(() => {
    const query = filter.query.trim().toLowerCase()

    const list = purchases.filter((purchase) => {
      const status = purchase.reconciliationStatus ?? 'posted'
      const month = purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)
      const matchesQuery =
        query.length === 0 ||
        purchase.item.toLowerCase().includes(query) ||
        purchase.category.toLowerCase().includes(query) ||
        (purchase.notes ?? '').toLowerCase().includes(query)
      const matchesStatus = filter.status === 'all' || status === filter.status
      const matchesCategory = filter.category === 'all' || purchase.category === filter.category
      const matchesMonth = filter.month.length === 0 || month === filter.month

      return matchesQuery && matchesStatus && matchesCategory && matchesMonth
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
        return (left.reconciliationStatus ?? 'posted').localeCompare(right.reconciliationStatus ?? 'posted') * direction
      }
      return left.purchaseDate.localeCompare(right.purchaseDate) * direction
    })

    return list
  }, [filter, purchases])

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

  const runBulkStatus = async (status: ReconciliationStatus) => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await queue.runOrQueue(
        'bulkUpdatePurchaseReconciliation',
        {
          ids: selectedIds,
          reconciliationStatus: status,
          statementMonth: filter.month || undefined,
        },
        async (args) => bulkUpdatePurchaseReconciliation(args),
      )
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkCategory = async () => {
    if (selectedIds.length === 0 || bulkCategory.trim().length === 0) return
    clearError()
    try {
      await queue.runOrQueue(
        'bulkUpdatePurchaseCategory',
        {
          ids: selectedIds,
          category: bulkCategory,
        },
        async (args) => bulkUpdatePurchaseCategory(args),
      )
      clearSelection()
      setBulkCategory('')
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkDelete = async () => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await queue.runOrQueue(
        'bulkDeletePurchases',
        {
          ids: selectedIds,
        },
        async (args) => bulkDeletePurchases(args),
      )
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    filter,
    setFilter,
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
    queue,
  }
}
