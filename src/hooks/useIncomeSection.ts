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
  grossAmount: '',
  taxAmount: '',
  nationalInsuranceAmount: '',
  pensionAmount: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  receivedDay: '',
  notes: '',
}

const initialIncomeEditDraft: IncomeEditDraft = {
  source: '',
  amount: '',
  grossAmount: '',
  taxAmount: '',
  nationalInsuranceAmount: '',
  pensionAmount: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  receivedDay: '',
  notes: '',
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const parseOptionalNonNegativeFloat = (value: string, label: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = parseFloatInput(trimmed, label)
  if (parsed < 0) {
    throw new Error(`${label} cannot be negative.`)
  }
  return parsed
}

const parseIncomeAmounts = (input: Pick<IncomeForm, 'amount' | 'grossAmount' | 'taxAmount' | 'nationalInsuranceAmount' | 'pensionAmount'>) => {
  const grossAmount = parseOptionalNonNegativeFloat(input.grossAmount, 'Income gross amount')
  const taxAmount = parseOptionalNonNegativeFloat(input.taxAmount, 'Income tax deduction')
  const nationalInsuranceAmount = parseOptionalNonNegativeFloat(input.nationalInsuranceAmount, 'Income NI deduction')
  const pensionAmount = parseOptionalNonNegativeFloat(input.pensionAmount, 'Income pension deduction')

  const deductionTotal = (taxAmount ?? 0) + (nationalInsuranceAmount ?? 0) + (pensionAmount ?? 0)
  if (deductionTotal > 0.000001 && grossAmount === undefined) {
    throw new Error('Gross amount is required when entering deductions.')
  }

  if (grossAmount !== undefined && deductionTotal > grossAmount + 0.000001) {
    throw new Error('Income deductions cannot exceed gross amount.')
  }

  const netAmount =
    grossAmount !== undefined || deductionTotal > 0
      ? Math.max((grossAmount ?? 0) - deductionTotal, 0)
      : parseFloatInput(input.amount, 'Income net amount')

  if (!Number.isFinite(netAmount) || netAmount <= 0) {
    throw new Error('Income net amount must be greater than 0.')
  }

  return {
    amount: roundCurrency(netAmount),
    grossAmount,
    taxAmount,
    nationalInsuranceAmount,
    pensionAmount,
  }
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
      const parsedAmounts = parseIncomeAmounts(incomeForm)

      await addIncome({
        source: incomeForm.source,
        ...parsedAmounts,
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
      grossAmount: entry.grossAmount !== undefined ? String(entry.grossAmount) : '',
      taxAmount: entry.taxAmount !== undefined ? String(entry.taxAmount) : '',
      nationalInsuranceAmount: entry.nationalInsuranceAmount !== undefined ? String(entry.nationalInsuranceAmount) : '',
      pensionAmount: entry.pensionAmount !== undefined ? String(entry.pensionAmount) : '',
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
      const parsedAmounts = parseIncomeAmounts(incomeEditDraft)

      await updateIncome({
        id: incomeEditId,
        source: incomeEditDraft.source,
        ...parsedAmounts,
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
