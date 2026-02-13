import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { BillEditDraft, BillEntry, BillForm, BillId } from '../components/financeTypes'
import { isCustomCadence, parseCustomInterval, parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseBillsSectionArgs = {
  bills: BillEntry[]
} & MutationHandlers

const initialBillForm: BillForm = {
  name: '',
  amount: '',
  dueDay: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  autopay: true,
  notes: '',
}

const initialBillEditDraft: BillEditDraft = {
  name: '',
  amount: '',
  dueDay: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  autopay: false,
  notes: '',
}

export const useBillsSection = ({ bills, clearError, handleMutationError }: UseBillsSectionArgs) => {
  const addBill = useMutation(api.finance.addBill)
  const updateBill = useMutation(api.finance.updateBill)
  const removeBill = useMutation(api.finance.removeBill)

  const [billForm, setBillForm] = useState<BillForm>(initialBillForm)
  const [billEditId, setBillEditId] = useState<BillId | null>(null)
  const [billEditDraft, setBillEditDraft] = useState<BillEditDraft>(initialBillEditDraft)

  const onAddBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const customInterval = isCustomCadence(billForm.cadence) ? parseCustomInterval(billForm.customInterval) : undefined

      await addBill({
        name: billForm.name,
        amount: parseFloatInput(billForm.amount, 'Bill amount'),
        dueDay: parseIntInput(billForm.dueDay, 'Due day'),
        cadence: billForm.cadence,
        customInterval,
        customUnit: isCustomCadence(billForm.cadence) ? billForm.customUnit : undefined,
        autopay: billForm.autopay,
        notes: billForm.notes || undefined,
      })

      setBillForm(initialBillForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteBill = async (id: BillId) => {
    clearError()
    try {
      if (billEditId === id) {
        setBillEditId(null)
      }
      await removeBill({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startBillEdit = (entry: BillEntry) => {
    setBillEditId(entry._id)
    setBillEditDraft({
      name: entry.name,
      amount: String(entry.amount),
      dueDay: String(entry.dueDay),
      cadence: entry.cadence,
      customInterval: entry.customInterval ? String(entry.customInterval) : '',
      customUnit: entry.customUnit ?? 'weeks',
      autopay: entry.autopay,
      notes: entry.notes ?? '',
    })
  }

  const saveBillEdit = async () => {
    if (!billEditId) return

    clearError()
    try {
      const customInterval = isCustomCadence(billEditDraft.cadence)
        ? parseCustomInterval(billEditDraft.customInterval)
        : undefined

      await updateBill({
        id: billEditId,
        name: billEditDraft.name,
        amount: parseFloatInput(billEditDraft.amount, 'Bill amount'),
        dueDay: parseIntInput(billEditDraft.dueDay, 'Due day'),
        cadence: billEditDraft.cadence,
        customInterval,
        customUnit: isCustomCadence(billEditDraft.cadence) ? billEditDraft.customUnit : undefined,
        autopay: billEditDraft.autopay,
        notes: billEditDraft.notes || undefined,
      })
      setBillEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    billForm,
    setBillForm,
    billEditId,
    setBillEditId,
    billEditDraft,
    setBillEditDraft,
    onAddBill,
    onDeleteBill,
    startBillEdit,
    saveBillEdit,
    bills,
  }
}
