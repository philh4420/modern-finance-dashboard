import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { AccountId, BillEditDraft, BillEntry, BillForm, BillId, BillPaymentCheckId } from '../components/financeTypes'
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
  linkedAccountId: '',
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
  linkedAccountId: '',
  autopay: false,
  notes: '',
}

export const useBillsSection = ({ bills, clearError, handleMutationError }: UseBillsSectionArgs) => {
  const addBill = useMutation(api.finance.addBill)
  const updateBill = useMutation(api.finance.updateBill)
  const removeBill = useMutation(api.finance.removeBill)
  const upsertBillPaymentCheck = useMutation(api.finance.upsertBillPaymentCheck)
  const removeBillPaymentCheck = useMutation(api.finance.removeBillPaymentCheck)

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
        linkedAccountId: billForm.linkedAccountId ? (billForm.linkedAccountId as AccountId) : undefined,
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
      linkedAccountId: entry.linkedAccountId ? String(entry.linkedAccountId) : '',
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
        linkedAccountId: billEditDraft.linkedAccountId ? (billEditDraft.linkedAccountId as AccountId) : undefined,
        autopay: billEditDraft.autopay,
        notes: billEditDraft.notes || undefined,
      })
      setBillEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onUpsertBillPaymentCheck = async (args: {
    billId: BillId
    cycleMonth: string
    expectedAmount: string
    actualAmount?: string
    paidDay?: string
    note?: string
  }) => {
    clearError()
    try {
      const expectedAmount = parseFloatInput(args.expectedAmount, 'Planned amount')
      const actualAmountText = args.actualAmount?.trim() ?? ''
      const paidDayText = args.paidDay?.trim() ?? ''

      const actualAmount = actualAmountText.length > 0 ? parseFloatInput(actualAmountText, 'Actual paid amount') : undefined
      const paidDay = paidDayText.length > 0 ? parseIntInput(paidDayText, 'Paid day') : undefined

      await upsertBillPaymentCheck({
        billId: args.billId,
        cycleMonth: args.cycleMonth.trim(),
        expectedAmount,
        actualAmount,
        paidDay,
        note: args.note?.trim() || undefined,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteBillPaymentCheck = async (id: BillPaymentCheckId) => {
    clearError()
    try {
      await removeBillPaymentCheck({ id })
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
    onUpsertBillPaymentCheck,
    onDeleteBillPaymentCheck,
    startBillEdit,
    saveBillEdit,
    bills,
  }
}
