import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  EnvelopeBudgetEntry,
  EnvelopeBudgetId,
  ReconciliationStatus,
  RuleMatchType,
  TransactionRuleEntry,
  TransactionRuleId,
} from '../components/financeTypes'
import { parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import { useOfflineQueue } from './useOfflineQueue'
import type { MutationHandlers } from './useMutationFeedback'

type RuleForm = {
  name: string
  matchType: RuleMatchType
  merchantPattern: string
  category: string
  reconciliationStatus: '' | ReconciliationStatus
  priority: string
  active: boolean
}

type BudgetForm = {
  month: string
  category: string
  targetAmount: string
  rolloverEnabled: boolean
  carryoverAmount: string
}

type WhatIfInput = {
  incomeDeltaPercent: string
  commitmentDeltaPercent: string
  spendDeltaPercent: string
}

type UsePlanningSectionArgs = {
  monthKey: string
  transactionRules: TransactionRuleEntry[]
  envelopeBudgets: EnvelopeBudgetEntry[]
  userId: string | null | undefined
  onQueueMetric?: (metric: {
    event: string
    queuedCount: number
    conflictCount: number
    flushAttempted: number
    flushSucceeded: number
  }) => void | Promise<void>
} & MutationHandlers

const emptyRuleForm: RuleForm = {
  name: '',
  matchType: 'contains',
  merchantPattern: '',
  category: '',
  reconciliationStatus: '',
  priority: '10',
  active: true,
}

const emptyBudgetForm = (monthKey: string): BudgetForm => ({
  month: monthKey,
  category: '',
  targetAmount: '',
  rolloverEnabled: true,
  carryoverAmount: '',
})

const defaultWhatIf: WhatIfInput = {
  incomeDeltaPercent: '0',
  commitmentDeltaPercent: '0',
  spendDeltaPercent: '0',
}

export const usePlanningSection = ({
  monthKey,
  transactionRules,
  envelopeBudgets,
  userId,
  onQueueMetric,
  clearError,
  handleMutationError,
}: UsePlanningSectionArgs) => {
  const addTransactionRule = useMutation(api.phase2.addTransactionRule)
  const updateTransactionRule = useMutation(api.phase2.updateTransactionRule)
  const removeTransactionRule = useMutation(api.phase2.removeTransactionRule)
  const addEnvelopeBudget = useMutation(api.phase2.addEnvelopeBudget)
  const updateEnvelopeBudget = useMutation(api.phase2.updateEnvelopeBudget)
  const removeEnvelopeBudget = useMutation(api.phase2.removeEnvelopeBudget)

  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm)
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(emptyBudgetForm(monthKey))
  const [ruleEditId, setRuleEditId] = useState<TransactionRuleId | null>(null)
  const [budgetEditId, setBudgetEditId] = useState<EnvelopeBudgetId | null>(null)
  const [whatIfInput, setWhatIfInput] = useState<WhatIfInput>(defaultWhatIf)

  const queue = useOfflineQueue({
    storageKey: 'finance-offline-queue-v2-planning',
    executors: {
      addTransactionRule: async (args) => {
        await addTransactionRule(args as Parameters<typeof addTransactionRule>[0])
      },
      updateTransactionRule: async (args) => {
        await updateTransactionRule(args as Parameters<typeof updateTransactionRule>[0])
      },
      removeTransactionRule: async (args) => {
        await removeTransactionRule(args as Parameters<typeof removeTransactionRule>[0])
      },
      addEnvelopeBudget: async (args) => {
        await addEnvelopeBudget(args as Parameters<typeof addEnvelopeBudget>[0])
      },
      updateEnvelopeBudget: async (args) => {
        await updateEnvelopeBudget(args as Parameters<typeof updateEnvelopeBudget>[0])
      },
      removeEnvelopeBudget: async (args) => {
        await removeEnvelopeBudget(args as Parameters<typeof removeEnvelopeBudget>[0])
      },
    },
    userId,
    onMetric: onQueueMetric,
  })

  const sortedRules = useMemo(
    () => [...transactionRules].sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt),
    [transactionRules],
  )

  const sortedBudgets = useMemo(
    () => [...envelopeBudgets].sort((a, b) => a.category.localeCompare(b.category)),
    [envelopeBudgets],
  )

  const submitRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    const payload = {
      name: ruleForm.name,
      matchType: ruleForm.matchType,
      merchantPattern: ruleForm.merchantPattern,
      category: ruleForm.category,
      reconciliationStatus: ruleForm.reconciliationStatus || undefined,
      priority: parseIntInput(ruleForm.priority, 'Rule priority'),
      active: ruleForm.active,
    }

    try {
      if (ruleEditId) {
        await queue.runOrQueue('updateTransactionRule', { id: ruleEditId, ...payload }, async (args) => updateTransactionRule(args))
      } else {
        await queue.runOrQueue('addTransactionRule', payload, async (args) => addTransactionRule(args))
      }

      setRuleForm(emptyRuleForm)
      setRuleEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startRuleEdit = (entry: TransactionRuleEntry) => {
    setRuleEditId(entry._id)
    setRuleForm({
      name: entry.name,
      matchType: entry.matchType,
      merchantPattern: entry.merchantPattern,
      category: entry.category,
      reconciliationStatus: entry.reconciliationStatus ?? '',
      priority: String(entry.priority),
      active: entry.active,
    })
  }

  const removeRule = async (id: TransactionRuleId) => {
    clearError()
    try {
      await queue.runOrQueue('removeTransactionRule', { id }, async (args) => removeTransactionRule(args))
      if (ruleEditId === id) {
        setRuleEditId(null)
        setRuleForm(emptyRuleForm)
      }
    } catch (error) {
      handleMutationError(error)
    }
  }

  const submitBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    const payload = {
      month: budgetForm.month,
      category: budgetForm.category,
      targetAmount: parseFloatInput(budgetForm.targetAmount, 'Budget target'),
      rolloverEnabled: budgetForm.rolloverEnabled,
      carryoverAmount: budgetForm.carryoverAmount.length > 0 ? parseFloatInput(budgetForm.carryoverAmount, 'Carryover') : undefined,
    }

    try {
      if (budgetEditId) {
        await queue.runOrQueue('updateEnvelopeBudget', { id: budgetEditId, ...payload }, async (args) => updateEnvelopeBudget(args))
      } else {
        await queue.runOrQueue('addEnvelopeBudget', payload, async (args) => addEnvelopeBudget(args))
      }

      setBudgetForm(emptyBudgetForm(monthKey))
      setBudgetEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startBudgetEdit = (entry: EnvelopeBudgetEntry) => {
    setBudgetEditId(entry._id)
    setBudgetForm({
      month: entry.month,
      category: entry.category,
      targetAmount: String(entry.targetAmount),
      rolloverEnabled: entry.rolloverEnabled,
      carryoverAmount: entry.carryoverAmount === undefined ? '' : String(entry.carryoverAmount),
    })
  }

  const removeBudget = async (id: EnvelopeBudgetId) => {
    clearError()
    try {
      await queue.runOrQueue('removeEnvelopeBudget', { id }, async (args) => removeEnvelopeBudget(args))
      if (budgetEditId === id) {
        setBudgetEditId(null)
        setBudgetForm(emptyBudgetForm(monthKey))
      }
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    ruleForm,
    setRuleForm,
    ruleEditId,
    setRuleEditId,
    sortedRules,
    submitRule,
    startRuleEdit,
    removeRule,
    budgetForm,
    setBudgetForm,
    budgetEditId,
    setBudgetEditId,
    sortedBudgets,
    submitBudget,
    startBudgetEdit,
    removeBudget,
    whatIfInput,
    setWhatIfInput,
    queue,
  }
}
