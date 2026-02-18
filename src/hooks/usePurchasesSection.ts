import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  PurchaseEditDraft,
  PurchaseEntry,
  PurchaseFilter,
  PurchaseForm,
  PurchaseId,
  PurchaseSavedView,
  ReconciliationStatus,
} from '../components/financeTypes'
import { parseFloatInput, toIsoToday } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UsePurchasesSectionArgs = {
  purchases: PurchaseEntry[]
} & MutationHandlers

const initialPurchaseForm: PurchaseForm = {
  item: '',
  amount: '',
  category: '',
  purchaseDate: toIsoToday(),
  reconciliationStatus: 'posted',
  statementMonth: new Date().toISOString().slice(0, 7),
  ownership: 'shared',
  taxDeductible: false,
  fundingSourceType: 'unassigned',
  fundingSourceId: '',
  notes: '',
}

const initialPurchaseEditDraft: PurchaseEditDraft = {
  item: '',
  amount: '',
  category: '',
  purchaseDate: toIsoToday(),
  reconciliationStatus: 'posted',
  statementMonth: new Date().toISOString().slice(0, 7),
  ownership: 'shared',
  taxDeductible: false,
  fundingSourceType: 'unassigned',
  fundingSourceId: '',
  notes: '',
}

const initialPurchaseFilter: PurchaseFilter = {
  query: '',
  category: 'all',
  month: new Date().toISOString().slice(0, 7),
  reconciliationStatus: 'all',
  ownership: 'all',
  taxDeductible: 'all',
  fundingSourceType: 'all',
}

const monthOnlyViews: PurchaseSavedView[] = ['month_all', 'month_pending', 'month_unreconciled', 'month_reconciled']

const matchesSavedView = (filter: PurchaseFilter, savedView: PurchaseSavedView, currentMonth: string) => {
  const month = filter.month.length === 0 ? '' : filter.month
  const monthMatch = monthOnlyViews.includes(savedView) ? month === currentMonth : month.length === 0

  if (savedView === 'month_all') {
    return monthMatch && filter.reconciliationStatus === 'all'
  }
  if (savedView === 'month_pending') {
    return monthMatch && filter.reconciliationStatus === 'pending'
  }
  if (savedView === 'month_unreconciled') {
    return monthMatch && filter.reconciliationStatus === 'posted'
  }
  if (savedView === 'month_reconciled') {
    return monthMatch && filter.reconciliationStatus === 'reconciled'
  }
  if (savedView === 'all_unreconciled') {
    return monthMatch && filter.reconciliationStatus === 'posted'
  }
  return monthMatch && filter.reconciliationStatus === 'all'
}

const applySavedViewToFilter = (savedView: PurchaseSavedView, currentMonth: string, filter: PurchaseFilter): PurchaseFilter => {
  const base: PurchaseFilter = {
    ...filter,
    month: monthOnlyViews.includes(savedView) ? currentMonth : '',
  }

  if (savedView === 'month_pending') {
    return { ...base, reconciliationStatus: 'pending' }
  }
  if (savedView === 'month_unreconciled') {
    return { ...base, reconciliationStatus: 'posted' }
  }
  if (savedView === 'month_reconciled') {
    return { ...base, reconciliationStatus: 'reconciled' }
  }
  if (savedView === 'all_unreconciled') {
    return { ...base, reconciliationStatus: 'posted' }
  }
  return { ...base, reconciliationStatus: 'all' }
}

export const usePurchasesSection = ({ purchases, clearError, handleMutationError }: UsePurchasesSectionArgs) => {
  const addPurchase = useMutation(api.finance.addPurchase)
  const updatePurchase = useMutation(api.finance.updatePurchase)
  const removePurchase = useMutation(api.finance.removePurchase)
  const setPurchaseReconciliation = useMutation(api.finance.setPurchaseReconciliation)
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const bulkUpdatePurchaseCategory = useMutation(api.phase2.bulkUpdatePurchaseCategory)
  const bulkDeletePurchases = useMutation(api.phase2.bulkDeletePurchases)

  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(initialPurchaseForm)
  const [purchaseEditId, setPurchaseEditId] = useState<PurchaseId | null>(null)
  const [purchaseEditDraft, setPurchaseEditDraft] = useState<PurchaseEditDraft>(initialPurchaseEditDraft)
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>(initialPurchaseFilter)
  const [savedView, setSavedView] = useState<PurchaseSavedView>('month_all')
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<PurchaseId[]>([])
  const [bulkCategory, setBulkCategory] = useState('')

  const currentMonth = new Date().toISOString().slice(0, 7)

  const activeSavedView = useMemo<PurchaseSavedView>(() => {
    if (matchesSavedView(purchaseFilter, savedView, currentMonth)) {
      return savedView
    }
    return 'all_purchases'
  }, [currentMonth, purchaseFilter, savedView])

  const purchaseCategories = useMemo(() => {
    return Array.from(new Set(purchases.map((entry) => entry.category))).sort((a, b) => a.localeCompare(b))
  }, [purchases])

  const filteredPurchases = useMemo(() => {
    const search = purchaseFilter.query.trim().toLowerCase()

    return purchases.filter((entry) => {
      const matchesQuery =
        search.length === 0 ||
        entry.item.toLowerCase().includes(search) ||
        entry.category.toLowerCase().includes(search) ||
        (entry.notes ?? '').toLowerCase().includes(search)

      const matchesCategory = purchaseFilter.category === 'all' || entry.category === purchaseFilter.category
      const entryMonth = entry.statementMonth ?? entry.purchaseDate.slice(0, 7)
      const matchesMonth = purchaseFilter.month.length === 0 || entryMonth === purchaseFilter.month
      const entryStatus = entry.reconciliationStatus ?? 'posted'
      const matchesReconciliation =
        purchaseFilter.reconciliationStatus === 'all' || entryStatus === purchaseFilter.reconciliationStatus
      const entryOwnership = entry.ownership ?? 'shared'
      const matchesOwnership = purchaseFilter.ownership === 'all' || entryOwnership === purchaseFilter.ownership
      const entryTaxDeductible = Boolean(entry.taxDeductible)
      const matchesTaxDeductible =
        purchaseFilter.taxDeductible === 'all' ||
        (purchaseFilter.taxDeductible === 'yes' ? entryTaxDeductible : !entryTaxDeductible)
      const entryFundingSourceType = entry.fundingSourceType ?? 'unassigned'
      const matchesFundingSource =
        purchaseFilter.fundingSourceType === 'all' || entryFundingSourceType === purchaseFilter.fundingSourceType

      return (
        matchesQuery &&
        matchesCategory &&
        matchesMonth &&
        matchesReconciliation &&
        matchesOwnership &&
        matchesTaxDeductible &&
        matchesFundingSource
      )
    })
  }, [purchases, purchaseFilter])

  const filteredPurchaseTotal = filteredPurchases.reduce((sum, entry) => sum + entry.amount, 0)
  const filteredPurchaseAverage = filteredPurchases.length > 0 ? filteredPurchaseTotal / filteredPurchases.length : 0

  const monthPurchases = useMemo(() => {
    const monthKey = purchaseFilter.month.length > 0 ? purchaseFilter.month : currentMonth
    return purchases.filter((entry) => (entry.statementMonth ?? entry.purchaseDate.slice(0, 7)) === monthKey)
  }, [currentMonth, purchaseFilter.month, purchases])

  const monthPurchaseSummary = useMemo(() => {
    let pendingTotal = 0
    let postedTotal = 0
    let reconciledTotal = 0

    monthPurchases.forEach((entry) => {
      const status = entry.reconciliationStatus ?? 'posted'
      if (status === 'pending') {
        pendingTotal += entry.amount
      } else if (status === 'reconciled') {
        reconciledTotal += entry.amount
      } else {
        postedTotal += entry.amount
      }
    })

    return {
      monthTotal: pendingTotal + postedTotal + reconciledTotal,
      pendingTotal,
      postedTotal,
      reconciledTotal,
      clearedTotal: postedTotal + reconciledTotal,
      pendingCount: monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'pending').length,
      postedCount: monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'posted').length,
      reconciledCount: monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'reconciled').length,
    }
  }, [monthPurchases])

  const filteredStatusCounts = useMemo(() => {
    return filteredPurchases.reduce(
      (acc, entry) => {
        const status = entry.reconciliationStatus ?? 'posted'
        if (status === 'pending') acc.pending += 1
        else if (status === 'reconciled') acc.reconciled += 1
        else acc.posted += 1
        return acc
      },
      { pending: 0, posted: 0, reconciled: 0 },
    )
  }, [filteredPurchases])

  const validPurchaseIdSet = useMemo(() => new Set(purchases.map((entry) => entry._id)), [purchases])
  const selectedPurchaseIdsNormalized = useMemo(
    () => selectedPurchaseIds.filter((id) => validPurchaseIdSet.has(id)),
    [selectedPurchaseIds, validPurchaseIdSet],
  )
  const selectedPurchaseSet = useMemo(() => new Set(selectedPurchaseIdsNormalized), [selectedPurchaseIdsNormalized])
  const selectedPurchaseCount = selectedPurchaseIdsNormalized.length
  const selectedPurchaseTotal = useMemo(
    () => purchases.filter((entry) => selectedPurchaseSet.has(entry._id)).reduce((sum, entry) => sum + entry.amount, 0),
    [purchases, selectedPurchaseSet],
  )

  const toggleSelectedPurchase = (id: PurchaseId) => {
    setSelectedPurchaseIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    )
  }

  const toggleSelectFilteredPurchases = () => {
    const visibleIds = filteredPurchases.map((entry) => entry._id)
    if (visibleIds.length === 0) {
      return
    }

    const allVisibleSelected = visibleIds.every((id) => selectedPurchaseSet.has(id))
    if (allVisibleSelected) {
      setSelectedPurchaseIds((previous) => previous.filter((id) => !visibleIds.includes(id)))
      return
    }

    setSelectedPurchaseIds((previous) => Array.from(new Set([...previous, ...visibleIds])))
  }

  const clearSelectedPurchases = () => {
    setSelectedPurchaseIds([])
  }

  const onAddPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addPurchase({
        item: purchaseForm.item,
        amount: parseFloatInput(purchaseForm.amount, 'Purchase amount'),
        category: purchaseForm.category,
        purchaseDate: purchaseForm.purchaseDate,
        reconciliationStatus: purchaseForm.reconciliationStatus,
        statementMonth: purchaseForm.statementMonth,
        ownership: purchaseForm.ownership,
        taxDeductible: purchaseForm.taxDeductible,
        fundingSourceType: purchaseForm.fundingSourceType,
        fundingSourceId:
          purchaseForm.fundingSourceType === 'unassigned' || purchaseForm.fundingSourceId.trim().length === 0
            ? undefined
            : purchaseForm.fundingSourceId,
        notes: purchaseForm.notes || undefined,
      })

      setPurchaseForm(initialPurchaseForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeletePurchase = async (id: PurchaseId) => {
    clearError()
    try {
      if (purchaseEditId === id) {
        setPurchaseEditId(null)
      }
      setSelectedPurchaseIds((previous) => previous.filter((entry) => entry !== id))
      await removePurchase({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startPurchaseEdit = (entry: PurchaseEntry) => {
    setPurchaseEditId(entry._id)
    setPurchaseEditDraft({
      item: entry.item,
      amount: String(entry.amount),
      category: entry.category,
      purchaseDate: entry.purchaseDate,
      reconciliationStatus: entry.reconciliationStatus ?? 'posted',
      statementMonth: entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
      ownership: entry.ownership ?? 'shared',
      taxDeductible: Boolean(entry.taxDeductible),
      fundingSourceType: entry.fundingSourceType ?? 'unassigned',
      fundingSourceId: entry.fundingSourceId ?? '',
      notes: entry.notes ?? '',
    })
  }

  const savePurchaseEdit = async () => {
    if (!purchaseEditId) return

    clearError()
    try {
      await updatePurchase({
        id: purchaseEditId,
        item: purchaseEditDraft.item,
        amount: parseFloatInput(purchaseEditDraft.amount, 'Purchase amount'),
        category: purchaseEditDraft.category,
        purchaseDate: purchaseEditDraft.purchaseDate,
        reconciliationStatus: purchaseEditDraft.reconciliationStatus,
        statementMonth: purchaseEditDraft.statementMonth,
        ownership: purchaseEditDraft.ownership,
        taxDeductible: purchaseEditDraft.taxDeductible,
        fundingSourceType: purchaseEditDraft.fundingSourceType,
        fundingSourceId:
          purchaseEditDraft.fundingSourceType === 'unassigned' || purchaseEditDraft.fundingSourceId.trim().length === 0
            ? undefined
            : purchaseEditDraft.fundingSourceId,
        notes: purchaseEditDraft.notes || undefined,
      })
      setPurchaseEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onSetPurchaseReconciliation = async (id: PurchaseId, reconciliationStatus: ReconciliationStatus) => {
    clearError()
    try {
      const entry = purchases.find((purchase) => purchase._id === id)
      if (!entry) {
        return
      }

      await setPurchaseReconciliation({
        id,
        reconciliationStatus,
        statementMonth: entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const duplicatePurchase = async (entry: PurchaseEntry) => {
    clearError()

    const today = toIsoToday()
    try {
      await addPurchase({
        item: entry.item,
        amount: entry.amount,
        category: entry.category,
        purchaseDate: today,
        reconciliationStatus: 'posted',
        statementMonth: today.slice(0, 7),
        ownership: entry.ownership ?? 'shared',
        taxDeductible: Boolean(entry.taxDeductible),
        fundingSourceType: entry.fundingSourceType ?? 'unassigned',
        fundingSourceId: entry.fundingSourceId,
        notes: entry.notes,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkStatus = async (status: ReconciliationStatus) => {
    if (selectedPurchaseIdsNormalized.length === 0) return

    clearError()
    try {
      await bulkUpdatePurchaseReconciliation({
        ids: selectedPurchaseIdsNormalized,
        reconciliationStatus: status,
        statementMonth: purchaseFilter.month || undefined,
      })
      clearSelectedPurchases()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkCategory = async () => {
    if (selectedPurchaseIdsNormalized.length === 0 || bulkCategory.trim().length === 0) {
      return
    }

    clearError()
    try {
      await bulkUpdatePurchaseCategory({
        ids: selectedPurchaseIdsNormalized,
        category: bulkCategory,
      })
      setBulkCategory('')
      clearSelectedPurchases()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkDelete = async () => {
    if (selectedPurchaseIdsNormalized.length === 0) return

    clearError()
    try {
      await bulkDeletePurchases({ ids: selectedPurchaseIdsNormalized })
      clearSelectedPurchases()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const applySavedView = (nextView: PurchaseSavedView) => {
    setSavedView(nextView)
    setPurchaseFilter((previous) => applySavedViewToFilter(nextView, currentMonth, previous))
  }

  return {
    purchaseForm,
    setPurchaseForm,
    purchaseEditId,
    setPurchaseEditId,
    purchaseEditDraft,
    setPurchaseEditDraft,
    purchaseFilter,
    setPurchaseFilter,
    purchaseCategories,
    filteredPurchases,
    filteredPurchaseTotal,
    filteredPurchaseAverage,
    monthPurchaseSummary,
    filteredStatusCounts,
    selectedPurchaseIds: selectedPurchaseIdsNormalized,
    selectedPurchaseSet,
    selectedPurchaseCount,
    selectedPurchaseTotal,
    toggleSelectedPurchase,
    toggleSelectFilteredPurchases,
    clearSelectedPurchases,
    bulkCategory,
    setBulkCategory,
    savedView: activeSavedView,
    applySavedView,
    onAddPurchase,
    onDeletePurchase,
    startPurchaseEdit,
    savePurchaseEdit,
    onSetPurchaseReconciliation,
    duplicatePurchase,
    runBulkStatus,
    runBulkCategory,
    runBulkDelete,
    purchases,
  }
}
