import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  Cadence,
  CustomCadenceUnit,
  GoalEditDraft,
  GoalEntry,
  GoalForm,
  GoalFundingSourceFormRow,
  GoalId,
  GoalMilestone,
  GoalType,
  GoalWithMetrics,
} from '../components/financeTypes'
import { daysUntilDate, parseCustomInterval, parseFloatInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseGoalsSectionArgs = {
  goals: GoalEntry[]
} & MutationHandlers

const DEFAULT_GOAL_TYPE: GoalType = 'sinking_fund'
const DEFAULT_GOAL_CADENCE: Cadence = 'monthly'
const DEFAULT_GOAL_CUSTOM_UNIT: CustomCadenceUnit = 'weeks'

const createEmptyGoalFundingSourceRow = (): GoalFundingSourceFormRow => ({
  sourceType: 'account',
  sourceId: '',
  allocationPercent: '',
})

const initialGoalForm: GoalForm = {
  title: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  priority: 'medium',
  goalType: DEFAULT_GOAL_TYPE,
  contributionAmount: '0',
  cadence: DEFAULT_GOAL_CADENCE,
  customInterval: '',
  customUnit: DEFAULT_GOAL_CUSTOM_UNIT,
  fundingSources: [createEmptyGoalFundingSourceRow()],
}

const initialGoalEditDraft: GoalEditDraft = {
  title: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  priority: 'medium',
  goalType: DEFAULT_GOAL_TYPE,
  contributionAmount: '0',
  cadence: DEFAULT_GOAL_CADENCE,
  customInterval: '',
  customUnit: DEFAULT_GOAL_CUSTOM_UNIT,
  fundingSources: [createEmptyGoalFundingSourceRow()],
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const parseOptionalNonNegativeFloat = (value: string, label: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  const parsed = parseFloatInput(trimmed, label)
  if (parsed < 0) {
    throw new Error(`${label} cannot be negative.`)
  }
  return roundCurrency(parsed)
}

const normalizeGoalFundingSourcesForMutation = (rows: GoalFundingSourceFormRow[]) => {
  const filtered = rows.filter((row) => row.sourceId.trim().length > 0)
  if (filtered.length === 0) {
    return [] as Array<{
      sourceType: GoalFundingSourceFormRow['sourceType']
      sourceId: string
      allocationPercent?: number
    }>
  }

  const seen = new Set<string>()
  let allocationTotal = 0

  return filtered.map((row) => {
    const sourceId = row.sourceId.trim()
    const dedupeKey = `${row.sourceType}:${sourceId}`
    if (seen.has(dedupeKey)) {
      throw new Error('Duplicate goal funding source rows are not allowed.')
    }
    seen.add(dedupeKey)

    const allocationPercent = parseOptionalNonNegativeFloat(row.allocationPercent, 'Funding allocation %')
    if (allocationPercent !== undefined && allocationPercent > 100) {
      throw new Error('Funding allocation % must be 100 or less.')
    }
    allocationTotal += allocationPercent ?? 0

    return {
      sourceType: row.sourceType,
      sourceId,
      allocationPercent,
    }
  }).map((entry, index, array) => {
    if (index === array.length - 1 && allocationTotal > 100.000001) {
      throw new Error('Funding allocation total cannot exceed 100%.')
    }
    return entry
  })
}

const toMonthlyAmount = (
  amount: number,
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0
  }

  switch (cadence) {
    case 'weekly':
      return (amount * 52) / 12
    case 'biweekly':
      return (amount * 26) / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }
      if (customUnit === 'days') return (amount * 365.2425) / (customInterval * 12)
      if (customUnit === 'weeks') return (amount * 365.2425) / (customInterval * 7 * 12)
      if (customUnit === 'months') return amount / customInterval
      return amount / (customInterval * 12)
    case 'one_time':
      return 0
    default:
      return amount
  }
}

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10)

const buildGoalMilestones = (goal: GoalEntry, progressPercent: number): GoalMilestone[] => {
  const targetDate = parseIsoDate(goal.targetDate)
  const createdDate = new Date(goal.createdAt)
  const createdStart = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate())

  if (!targetDate) {
    return [
      { percent: 25, label: '25%', targetDate: goal.targetDate, achieved: progressPercent >= 25 },
      { percent: 50, label: '50%', targetDate: goal.targetDate, achieved: progressPercent >= 50 },
      { percent: 75, label: '75%', targetDate: goal.targetDate, achieved: progressPercent >= 75 },
      { percent: 100, label: '100%', targetDate: goal.targetDate, achieved: progressPercent >= 100 },
    ]
  }

  const startMs = createdStart.getTime()
  const endMs = targetDate.getTime()
  const spanMs = Math.max(endMs - startMs, 0)
  const milestones: Array<25 | 50 | 75 | 100> = [25, 50, 75, 100]

  return milestones.map((percent) => {
    const targetMs = spanMs === 0 ? endMs : startMs + Math.round(spanMs * (percent / 100))
    return {
      percent,
      label: `${percent}%`,
      targetDate: formatIsoDate(targetMs),
      achieved: progressPercent >= percent,
    }
  })
}

const normalizeFundingSourcesForView = (goal: GoalEntry) =>
  Array.isArray(goal.fundingSources)
    ? goal.fundingSources
        .filter((entry) => entry && typeof entry.sourceId === 'string' && entry.sourceId.trim().length > 0)
        .map((entry) => ({
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          allocationPercent: isFiniteNumber(entry.allocationPercent) ? roundCurrency(entry.allocationPercent) : undefined,
        }))
    : []

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
      const goalTypeValue = goal.goalType ?? DEFAULT_GOAL_TYPE
      const contributionAmountValue =
        isFiniteNumber(goal.contributionAmount) && goal.contributionAmount > 0 ? roundCurrency(goal.contributionAmount) : 0
      const cadenceValue = goal.cadence ?? DEFAULT_GOAL_CADENCE
      const customIntervalValue =
        cadenceValue === 'custom' && isFiniteNumber(goal.customInterval) && goal.customInterval > 0
          ? Math.round(goal.customInterval)
          : undefined
      const customUnitValue = cadenceValue === 'custom' ? goal.customUnit ?? DEFAULT_GOAL_CUSTOM_UNIT : undefined
      const fundingSourcesValue = normalizeFundingSourcesForView(goal)
      const plannedMonthlyContribution = roundCurrency(
        toMonthlyAmount(contributionAmountValue, cadenceValue, customIntervalValue, customUnitValue),
      )

      const requiredMonthlyContribution =
        remaining <= 0
          ? 0
          : daysLeft <= 0
            ? roundCurrency(remaining)
            : roundCurrency(remaining / Math.max(daysLeft / 30.4375, 1 / 30.4375))

      return {
        ...goal,
        progressPercent,
        remaining,
        daysLeft,
        goalTypeValue,
        contributionAmountValue,
        cadenceValue,
        customIntervalValue,
        customUnitValue,
        fundingSourcesValue,
        plannedMonthlyContribution,
        requiredMonthlyContribution,
        milestones: buildGoalMilestones(goal, progressPercent),
      }
    })
  }, [goals])

  const onAddGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const contributionAmount = parseFloatInput(goalForm.contributionAmount || '0', 'Planned contribution')
      if (contributionAmount < 0) {
        throw new Error('Planned contribution cannot be negative.')
      }

      await addGoal({
        title: goalForm.title,
        targetAmount: parseFloatInput(goalForm.targetAmount, 'Target amount'),
        currentAmount: parseFloatInput(goalForm.currentAmount, 'Current amount'),
        targetDate: goalForm.targetDate,
        priority: goalForm.priority,
        goalType: goalForm.goalType,
        contributionAmount,
        cadence: goalForm.cadence,
        customInterval: goalForm.cadence === 'custom' ? parseCustomInterval(goalForm.customInterval) : undefined,
        customUnit: goalForm.cadence === 'custom' ? goalForm.customUnit : undefined,
        fundingSources: normalizeGoalFundingSourcesForMutation(goalForm.fundingSources),
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
      goalType: entry.goalTypeValue,
      contributionAmount: String(entry.contributionAmountValue),
      cadence: entry.cadenceValue,
      customInterval: entry.customIntervalValue ? String(entry.customIntervalValue) : '',
      customUnit: entry.customUnitValue ?? DEFAULT_GOAL_CUSTOM_UNIT,
      fundingSources:
        entry.fundingSourcesValue.length > 0
          ? entry.fundingSourcesValue.map((source) => ({
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              allocationPercent:
                source.allocationPercent !== undefined ? String(roundCurrency(source.allocationPercent)) : '',
            }))
          : [createEmptyGoalFundingSourceRow()],
    })
  }

  const saveGoalEdit = async () => {
    if (!goalEditId) return

    clearError()
    try {
      const contributionAmount = parseFloatInput(goalEditDraft.contributionAmount || '0', 'Planned contribution')
      if (contributionAmount < 0) {
        throw new Error('Planned contribution cannot be negative.')
      }

      await updateGoal({
        id: goalEditId,
        title: goalEditDraft.title,
        targetAmount: parseFloatInput(goalEditDraft.targetAmount, 'Goal target amount'),
        currentAmount: parseFloatInput(goalEditDraft.currentAmount, 'Goal current amount'),
        targetDate: goalEditDraft.targetDate,
        priority: goalEditDraft.priority,
        goalType: goalEditDraft.goalType,
        contributionAmount,
        cadence: goalEditDraft.cadence,
        customInterval: goalEditDraft.cadence === 'custom' ? parseCustomInterval(goalEditDraft.customInterval) : undefined,
        customUnit: goalEditDraft.cadence === 'custom' ? goalEditDraft.customUnit : undefined,
        fundingSources: normalizeGoalFundingSourcesForMutation(goalEditDraft.fundingSources),
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
