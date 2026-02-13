import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  GoalEditDraft,
  GoalEntry,
  GoalForm,
  GoalId,
  GoalWithMetrics,
} from '../components/financeTypes'
import { daysUntilDate, parseFloatInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseGoalsSectionArgs = {
  goals: GoalEntry[]
} & MutationHandlers

const initialGoalForm: GoalForm = {
  title: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  priority: 'medium',
}

const initialGoalEditDraft: GoalEditDraft = {
  title: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  priority: 'medium',
}

export const useGoalsSection = ({ goals, clearError, handleMutationError }: UseGoalsSectionArgs) => {
  const addGoal = useMutation(api.finance.addGoal)
  const updateGoal = useMutation(api.finance.updateGoal)
  const removeGoal = useMutation(api.finance.removeGoal)

  const [goalForm, setGoalForm] = useState<GoalForm>(initialGoalForm)
  const [goalEditId, setGoalEditId] = useState<GoalId | null>(null)
  const [goalEditDraft, setGoalEditDraft] = useState<GoalEditDraft>(initialGoalEditDraft)

  const goalsWithMetrics = useMemo<GoalWithMetrics[]>(() => {
    return goals.map((goal) => {
      const progressPercent = Math.min((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100, 100)
      const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0)
      const daysLeft = daysUntilDate(goal.targetDate)

      return {
        ...goal,
        progressPercent,
        remaining,
        daysLeft,
      }
    })
  }, [goals])

  const onAddGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addGoal({
        title: goalForm.title,
        targetAmount: parseFloatInput(goalForm.targetAmount, 'Target amount'),
        currentAmount: parseFloatInput(goalForm.currentAmount, 'Current amount'),
        targetDate: goalForm.targetDate,
        priority: goalForm.priority,
      })

      setGoalForm(initialGoalForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteGoal = async (id: GoalId) => {
    clearError()
    try {
      if (goalEditId === id) {
        setGoalEditId(null)
      }
      await removeGoal({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startGoalEdit = (entry: GoalWithMetrics) => {
    setGoalEditId(entry._id)
    setGoalEditDraft({
      title: entry.title,
      targetAmount: String(entry.targetAmount),
      currentAmount: String(entry.currentAmount),
      targetDate: entry.targetDate,
      priority: entry.priority,
    })
  }

  const saveGoalEdit = async () => {
    if (!goalEditId) return

    clearError()
    try {
      await updateGoal({
        id: goalEditId,
        title: goalEditDraft.title,
        targetAmount: parseFloatInput(goalEditDraft.targetAmount, 'Goal target amount'),
        currentAmount: parseFloatInput(goalEditDraft.currentAmount, 'Goal current amount'),
        targetDate: goalEditDraft.targetDate,
        priority: goalEditDraft.priority,
      })
      setGoalEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    goalForm,
    setGoalForm,
    goalEditId,
    setGoalEditId,
    goalEditDraft,
    setGoalEditDraft,
    goalsWithMetrics,
    onAddGoal,
    onDeleteGoal,
    startGoalEdit,
    saveGoalEdit,
    goals,
  }
}
