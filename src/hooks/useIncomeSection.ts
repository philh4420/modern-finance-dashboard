import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { IncomeEditDraft, IncomeEntry, IncomeForm, IncomeId } from '../components/financeTypes'
import { isCustomCadence, parseCustomInterval, parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseIncomeSectionArgs = {
  incomes: IncomeEntry[]
} & MutationHandlers

const initialIncomeForm: IncomeForm = {
  source: '',
  amount: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  receivedDay: '',
  notes: '',
}

const initialIncomeEditDraft: IncomeEditDraft = {
  source: '',
  amount: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  receivedDay: '',
  notes: '',
}

export const useIncomeSection = ({ incomes, clearError, handleMutationError }: UseIncomeSectionArgs) => {
  const addIncome = useMutation(api.finance.addIncome)
  const updateIncome = useMutation(api.finance.updateIncome)
  const removeIncome = useMutation(api.finance.removeIncome)

  const [incomeForm, setIncomeForm] = useState<IncomeForm>(initialIncomeForm)
  const [incomeEditId, setIncomeEditId] = useState<IncomeId | null>(null)
  const [incomeEditDraft, setIncomeEditDraft] = useState<IncomeEditDraft>(initialIncomeEditDraft)

  const onAddIncome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const customInterval = isCustomCadence(incomeForm.cadence)
        ? parseCustomInterval(incomeForm.customInterval)
        : undefined

      await addIncome({
        source: incomeForm.source,
        amount: parseFloatInput(incomeForm.amount, 'Income amount'),
        cadence: incomeForm.cadence,
        customInterval,
        customUnit: isCustomCadence(incomeForm.cadence) ? incomeForm.customUnit : undefined,
        receivedDay: incomeForm.receivedDay ? parseIntInput(incomeForm.receivedDay, 'Received day') : undefined,
        notes: incomeForm.notes || undefined,
      })

      setIncomeForm(initialIncomeForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteIncome = async (id: IncomeId) => {
    clearError()
    try {
      if (incomeEditId === id) {
        setIncomeEditId(null)
      }
      await removeIncome({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startIncomeEdit = (entry: IncomeEntry) => {
    setIncomeEditId(entry._id)
    setIncomeEditDraft({
      source: entry.source,
      amount: String(entry.amount),
      cadence: entry.cadence,
      customInterval: entry.customInterval ? String(entry.customInterval) : '',
      customUnit: entry.customUnit ?? 'weeks',
      receivedDay: entry.receivedDay ? String(entry.receivedDay) : '',
      notes: entry.notes ?? '',
    })
  }

  const saveIncomeEdit = async () => {
    if (!incomeEditId) return

    clearError()
    try {
      const customInterval = isCustomCadence(incomeEditDraft.cadence)
        ? parseCustomInterval(incomeEditDraft.customInterval)
        : undefined

      await updateIncome({
        id: incomeEditId,
        source: incomeEditDraft.source,
        amount: parseFloatInput(incomeEditDraft.amount, 'Income amount'),
        cadence: incomeEditDraft.cadence,
        customInterval,
        customUnit: isCustomCadence(incomeEditDraft.cadence) ? incomeEditDraft.customUnit : undefined,
        receivedDay: incomeEditDraft.receivedDay
          ? parseIntInput(incomeEditDraft.receivedDay, 'Received day')
          : undefined,
        notes: incomeEditDraft.notes || undefined,
      })
      setIncomeEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    incomeForm,
    setIncomeForm,
    incomeEditId,
    setIncomeEditId,
    incomeEditDraft,
    setIncomeEditDraft,
    onAddIncome,
    onDeleteIncome,
    startIncomeEdit,
    saveIncomeEdit,
    incomes,
  }
}
