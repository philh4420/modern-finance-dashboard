import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  PurchaseEditDraft,
  PurchaseEntry,
  PurchaseFilter,
  PurchaseForm,
  PurchaseId,
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
  notes: '',
}

const initialPurchaseEditDraft: PurchaseEditDraft = {
  item: '',
  amount: '',
  category: '',
  purchaseDate: toIsoToday(),
  notes: '',
}

const initialPurchaseFilter: PurchaseFilter = {
  query: '',
  category: 'all',
  month: new Date().toISOString().slice(0, 7),
}

export const usePurchasesSection = ({ purchases, clearError, handleMutationError }: UsePurchasesSectionArgs) => {
  const addPurchase = useMutation(api.finance.addPurchase)
  const updatePurchase = useMutation(api.finance.updatePurchase)
  const removePurchase = useMutation(api.finance.removePurchase)

  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(initialPurchaseForm)
  const [purchaseEditId, setPurchaseEditId] = useState<PurchaseId | null>(null)
  const [purchaseEditDraft, setPurchaseEditDraft] = useState<PurchaseEditDraft>(initialPurchaseEditDraft)
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>(initialPurchaseFilter)

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
      const matchesMonth = purchaseFilter.month.length === 0 || entry.purchaseDate.startsWith(purchaseFilter.month)

      return matchesQuery && matchesCategory && matchesMonth
    })
  }, [purchases, purchaseFilter])

  const filteredPurchaseTotal = filteredPurchases.reduce((sum, entry) => sum + entry.amount, 0)
  const filteredPurchaseAverage = filteredPurchases.length > 0 ? filteredPurchaseTotal / filteredPurchases.length : 0

  const onAddPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addPurchase({
        item: purchaseForm.item,
        amount: parseFloatInput(purchaseForm.amount, 'Purchase amount'),
        category: purchaseForm.category,
        purchaseDate: purchaseForm.purchaseDate,
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
        notes: purchaseEditDraft.notes || undefined,
      })
      setPurchaseEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
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
    onAddPurchase,
    onDeletePurchase,
    startPurchaseEdit,
    savePurchaseEdit,
    purchases,
  }
}
