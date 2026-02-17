import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  EnvelopeBudgetEntry,
  EnvelopeBudgetId,
  IncomeAllocationRuleEntry,
  IncomeAllocationRuleId,
  IncomeAllocationTarget,
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

type AllocationRuleForm = {
  target: IncomeAllocationTarget
  percentage: string
  active: boolean
}

type UsePlanningSectionArgs = {
  monthKey: string
  transactionRules: TransactionRuleEntry[]
  envelopeBudgets: EnvelopeBudgetEntry[]
  incomeAllocationRules: IncomeAllocationRuleEntry[]
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

const emptyAllocationRuleForm: AllocationRuleForm = {
  target: 'bills',
  percentage: '',
  active: true,
}

export const usePlanningSection = ({
  monthKey,
  transactionRules,
  envelopeBudgets,
  incomeAllocationRules,
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
  const addIncomeAllocationRule = useMutation(api.phase2.addIncomeAllocationRule)
  const updateIncomeAllocationRule = useMutation(api.phase2.updateIncomeAllocationRule)
  const removeIncomeAllocationRule = useMutation(api.phase2.removeIncomeAllocationRule)
  const applyIncomeAutoAllocationNow = useMutation(api.phase2.applyIncomeAutoAllocationNow)

  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm)
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(emptyBudgetForm(monthKey))
  const [allocationRuleForm, setAllocationRuleForm] = useState<AllocationRuleForm>(emptyAllocationRuleForm)
  const [ruleEditId, setRuleEditId] = useState<TransactionRuleId | null>(null)
  const [budgetEditId, setBudgetEditId] = useState<EnvelopeBudgetId | null>(null)
  const [allocationRuleEditId, setAllocationRuleEditId] = useState<IncomeAllocationRuleId | null>(null)
  const [whatIfInput, setWhatIfInput] = useState<WhatIfInput>(defaultWhatIf)
  const [isApplyingAutoAllocation, setIsApplyingAutoAllocation] = useState(false)
  const [autoAllocationLastRunNote, setAutoAllocationLastRunNote] = useState<string | null>(null)

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
      addIncomeAllocationRule: async (args) => {
        await addIncomeAllocationRule(args as Parameters<typeof addIncomeAllocationRule>[0])
      },
      updateIncomeAllocationRule: async (args) => {
        await updateIncomeAllocationRule(args as Parameters<typeof updateIncomeAllocationRule>[0])
      },
      removeIncomeAllocationRule: async (args) => {
        await removeIncomeAllocationRule(args as Parameters<typeof removeIncomeAllocationRule>[0])
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

  const sortedIncomeAllocationRules = useMemo(
    () => [...incomeAllocationRules].sort((a, b) => a.target.localeCompare(b.target) || b.createdAt - a.createdAt),
    [incomeAllocationRules],
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

  const submitAllocationRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    const payload = {
      target: allocationRuleForm.target,
      percentage: parseFloatInput(allocationRuleForm.percentage, 'Allocation percentage'),
      active: allocationRuleForm.active,
    }

    try {
      if (allocationRuleEditId) {
        await queue.runOrQueue('updateIncomeAllocationRule', { id: allocationRuleEditId, ...payload }, async (args) =>
          updateIncomeAllocationRule(args),
        )
      } else {
        await queue.runOrQueue('addIncomeAllocationRule', payload, async (args) => addIncomeAllocationRule(args))
      }

      setAllocationRuleForm(emptyAllocationRuleForm)
      setAllocationRuleEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startAllocationRuleEdit = (entry: IncomeAllocationRuleEntry) => {
    setAllocationRuleEditId(entry._id)
    setAllocationRuleForm({
      target: entry.target,
      percentage: String(entry.percentage),
      active: entry.active,
    })
  }

  const removeAllocationRule = async (id: IncomeAllocationRuleId) => {
    clearError()
    try {
      await queue.runOrQueue('removeIncomeAllocationRule', { id }, async (args) => removeIncomeAllocationRule(args))
      if (allocationRuleEditId === id) {
        setAllocationRuleEditId(null)
        setAllocationRuleForm(emptyAllocationRuleForm)
      }
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onApplyAutoAllocationNow = async () => {
    clearError()
    setIsApplyingAutoAllocation(true)
    try {
      const result = await applyIncomeAutoAllocationNow({ month: monthKey })
      setAutoAllocationLastRunNote(
        `Generated ${result.suggestionsCreated} suggestion${result.suggestionsCreated === 1 ? '' : 's'} for ${result.monthKey}.`,
      )
    } catch (error) {
      setAutoAllocationLastRunNote(null)
      handleMutationError(error)
    } finally {
      setIsApplyingAutoAllocation(false)
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
    allocationRuleForm,
    setAllocationRuleForm,
    allocationRuleEditId,
    setAllocationRuleEditId,
    sortedIncomeAllocationRules,
    submitAllocationRule,
    startAllocationRuleEdit,
    removeAllocationRule,
    isApplyingAutoAllocation,
    autoAllocationLastRunNote,
    onApplyAutoAllocationNow,
    whatIfInput,
    setWhatIfInput,
    queue,
  }
}
