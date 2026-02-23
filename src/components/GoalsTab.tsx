import { useMemo, useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountEntry,
  Cadence,
  CadenceOption,
  CardEntry,
  CustomCadenceUnitOption,
  GoalEditDraft,
  GoalForm,
  GoalFundingSourceFormRow,
  GoalFundingSourceType,
  GoalId,
  GoalPriority,
  GoalPriorityOption,
  GoalType,
  GoalTypeOption,
  GoalWithMetrics,
  IncomeEntry,
} from './financeTypes'

type GoalSortKey = 'title_asc' | 'due_asc' | 'progress_desc' | 'remaining_desc' | 'priority_desc'
type GoalStatusFilter = 'all' | 'on_track' | 'at_risk' | 'overdue' | 'completed'

type GoalsTabProps = {
  goalsWithMetrics: GoalWithMetrics[]
  goalForm: GoalForm
  setGoalForm: Dispatch<SetStateAction<GoalForm>>
  goalEditId: GoalId | null
  setGoalEditId: Dispatch<SetStateAction<GoalId | null>>
  goalEditDraft: GoalEditDraft
  setGoalEditDraft: Dispatch<SetStateAction<GoalEditDraft>>
  onAddGoal: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteGoal: (id: GoalId) => Promise<void>
  saveGoalEdit: () => Promise<void>
  startGoalEdit: (entry: GoalWithMetrics) => void
  incomes: IncomeEntry[]
  accounts: AccountEntry[]
  cards: CardEntry[]
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  goalPriorityOptions: GoalPriorityOption[]
  goalTypeOptions: GoalTypeOption[]
  goalFundingSourceTypeOptions: Array<{ value: GoalFundingSourceType; label: string }>
  priorityLabel: (priority: GoalPriority) => string
  goalTypeLabel: (goalType: GoalType) => string
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: GoalForm['customUnit']) => string
  formatMoney: (value: number) => string
  formatPercent: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

type GoalFormState = GoalForm | GoalEditDraft

const priorityRank: Record<GoalPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const createEmptyFundingSourceRow = (): GoalFundingSourceFormRow => ({
  sourceType: 'account',
  sourceId: '',
  allocationPercent: '',
})

const goalStatus = (goal: GoalWithMetrics): Exclude<GoalStatusFilter, 'all'> => {
  if (goal.progressPercent >= 100) return 'completed'
  if (goal.daysLeft < 0) return 'overdue'

  const paceShortfall =
    goal.requiredMonthlyContribution > 0 &&
    goal.plannedMonthlyContribution + 0.009 < goal.requiredMonthlyContribution &&
    goal.daysLeft <= 180

  if (paceShortfall) return 'at_risk'
  if (goal.daysLeft <= 30 && goal.progressPercent < 70) return 'at_risk'
  return 'on_track'
}

const goalStatusPill = (status: Exclude<GoalStatusFilter, 'all'>) => {
  if (status === 'completed') return 'pill pill--good'
  if (status === 'overdue') return 'pill pill--critical'
  if (status === 'at_risk') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const priorityPill = (priority: GoalPriority) => {
  if (priority === 'high') return 'pill pill--critical'
  if (priority === 'medium') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const goalTypePill = (goalType: GoalType) => {
  if (goalType === 'emergency_fund') return 'pill pill--good'
  if (goalType === 'debt_payoff') return 'pill pill--warning'
  if (goalType === 'big_purchase') return 'pill pill--cadence'
  return 'pill pill--neutral'
}

const daysLeftLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`
  if (daysLeft === 0) return 'due today'
  return `${daysLeft}d left`
}

const goalFundingSourceKindLabel = (value: GoalFundingSourceType) => {
  if (value === 'income') return 'Income'
  if (value === 'card') return 'Card'
  return 'Account'
}

const normalizeFundingRows = (rows: GoalFundingSourceFormRow[] | undefined) => (rows && rows.length > 0 ? rows : [createEmptyFundingSourceRow()])

const updateFundingRow = <T extends GoalFormState>(
  setter: Dispatch<SetStateAction<T>>,
  index: number,
  patch: Partial<GoalFundingSourceFormRow>,
) => {
  setter((prev) => {
    const nextRows = normalizeFundingRows(prev.fundingSources).map((row, rowIndex) => {
      if (rowIndex !== index) return row
      return { ...row, ...patch }
    })
    return { ...prev, fundingSources: nextRows } as T
  })
}

const addFundingRow = <T extends GoalFormState>(setter: Dispatch<SetStateAction<T>>) => {
  setter((prev) => ({
    ...prev,
    fundingSources: [...normalizeFundingRows(prev.fundingSources), createEmptyFundingSourceRow()],
  }))
}

const removeFundingRow = <T extends GoalFormState>(setter: Dispatch<SetStateAction<T>>, index: number) => {
  setter((prev) => {
    const nextRows = normalizeFundingRows(prev.fundingSources).filter((_, rowIndex) => rowIndex !== index)
    return {
      ...prev,
      fundingSources: nextRows.length > 0 ? nextRows : [createEmptyFundingSourceRow()],
    } as T
  })
}

const formatShortDate = (value: string, dateLabel: Intl.DateTimeFormat) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return dateLabel.format(new Date(`${value}T00:00:00`))
}

export function GoalsTab({
  goalsWithMetrics,
  goalForm,
  setGoalForm,
  goalEditId,
  setGoalEditId,
  goalEditDraft,
  setGoalEditDraft,
  onAddGoal,
  onDeleteGoal,
  saveGoalEdit,
  startGoalEdit,
  incomes,
  accounts,
  cards,
  cadenceOptions,
  customCadenceUnitOptions,
  goalPriorityOptions,
  goalTypeOptions,
  goalFundingSourceTypeOptions,
  priorityLabel,
  goalTypeLabel,
  cadenceLabel,
  formatMoney,
  formatPercent,
  dateLabel,
}: GoalsTabProps) {
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | GoalPriority>('all')
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>('all')
  const [sortKey, setSortKey] = useState<GoalSortKey>('due_asc')

  const sourceLabelMaps = useMemo(() => {
    const accountMap = new Map(accounts.map((entry) => [String(entry._id), entry.name] as const))
    const cardMap = new Map(cards.map((entry) => [String(entry._id), entry.name] as const))
    const incomeMap = new Map(incomes.map((entry) => [String(entry._id), entry.source] as const))
    return { accountMap, cardMap, incomeMap }
  }, [accounts, cards, incomes])

  const summary = useMemo(() => {
    const targetTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.targetAmount, 0)
    const fundedTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.currentAmount, 0)
    const remainingTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.remaining, 0)
    const completedCount = goalsWithMetrics.filter((goal) => goal.progressPercent >= 100).length
    const overdueCount = goalsWithMetrics.filter((goal) => goal.daysLeft < 0 && goal.progressPercent < 100).length
    const weightedProgress = targetTotal > 0 ? (fundedTotal / targetTotal) * 100 : 0
    const plannedMonthlyContributionTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.plannedMonthlyContribution, 0)
    const requiredMonthlyContributionTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.requiredMonthlyContribution, 0)

    return {
      targetTotal,
      fundedTotal,
      remainingTotal,
      completedCount,
      overdueCount,
      weightedProgress,
      plannedMonthlyContributionTotal,
      requiredMonthlyContributionTotal,
    }
  }, [goalsWithMetrics])

  const visibleGoals = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = goalsWithMetrics.filter((goal) => {
      const status = goalStatus(goal)
      const queryMatch =
        query.length === 0
          ? true
          : `${goal.title} ${goal.priority} ${priorityLabel(goal.priority)} ${status} ${goal.goalTypeValue} ${goalTypeLabel(
              goal.goalTypeValue,
            )}`
              .toLowerCase()
              .includes(query)
      const priorityMatch = priorityFilter === 'all' ? true : goal.priority === priorityFilter
      const statusMatch = statusFilter === 'all' ? true : status === statusFilter
      return queryMatch && priorityMatch && statusMatch
    })

    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'title_asc':
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
        case 'due_asc':
          return a.daysLeft - b.daysLeft || b.progressPercent - a.progressPercent
        case 'progress_desc':
          return b.progressPercent - a.progressPercent
        case 'remaining_desc':
          return b.remaining - a.remaining
        case 'priority_desc':
          return priorityRank[a.priority] - priorityRank[b.priority] || a.daysLeft - b.daysLeft
        default:
          return 0
      }
    })
  }, [goalTypeLabel, goalsWithMetrics, priorityFilter, priorityLabel, search, sortKey, statusFilter])

  const hasFilters =
    search.length > 0 || priorityFilter !== 'all' || statusFilter !== 'all' || sortKey !== 'due_asc'

  const sourceOptionsByType = useMemo(
    () => ({
      account: accounts.map((entry) => ({ value: String(entry._id), label: entry.name })),
      card: cards.map((entry) => ({ value: String(entry._id), label: entry.name })),
      income: incomes.map((entry) => ({ value: String(entry._id), label: entry.source })),
    }),
    [accounts, cards, incomes],
  )

  const getFundingSourceDisplay = (sourceType: GoalFundingSourceType, sourceId: string) => {
    if (sourceType === 'account') return sourceLabelMaps.accountMap.get(sourceId) ?? 'Unknown account'
    if (sourceType === 'card') return sourceLabelMaps.cardMap.get(sourceId) ?? 'Unknown card'
    return sourceLabelMaps.incomeMap.get(sourceId) ?? 'Unknown income'
  }

  const renderFundingMapEditor = <T extends GoalFormState>(
    draft: T,
    setDraft: Dispatch<SetStateAction<T>>,
    prefix: 'goal-form' | 'goal-edit',
  ) => {
    const rows = normalizeFundingRows(draft.fundingSources)

    return (
      <div className="goal-funding-map-editor">
        <div className="goal-funding-map-editor__head">
          <span>Funding source map</span>
          <button type="button" className="btn btn-ghost btn--sm" onClick={() => addFundingRow(setDraft)}>
            Add source
          </button>
        </div>
        <div className="goal-funding-map-editor__rows">
          {rows.map((row, index) => {
            const options = sourceOptionsByType[row.sourceType]
            return (
              <div key={`${prefix}-${index}`} className="goal-funding-map-row">
                <select
                  className="inline-select"
                  aria-label={`Funding source type ${index + 1}`}
                  value={row.sourceType}
                  onChange={(event) =>
                    updateFundingRow(setDraft, index, {
                      sourceType: event.target.value as GoalFundingSourceType,
                      sourceId: '',
                    })
                  }
                >
                  {goalFundingSourceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="inline-select"
                  aria-label={`Funding source ${index + 1}`}
                  value={row.sourceId}
                  onChange={(event) => updateFundingRow(setDraft, index, { sourceId: event.target.value })}
                >
                  <option value="">Select {goalFundingSourceKindLabel(row.sourceType).toLowerCase()}...</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="inline-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="% (optional)"
                  aria-label={`Funding allocation percent ${index + 1}`}
                  value={row.allocationPercent}
                  onChange={(event) => updateFundingRow(setDraft, index, { allocationPercent: event.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn--sm"
                  onClick={() => removeFundingRow(setDraft, index)}
                  disabled={rows.length === 1 && row.sourceId.trim().length === 0 && row.allocationPercent.trim().length === 0}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
        <p className="form-hint">
          Optional % allocation lets you model how this goal is funded across accounts, cards, and income sources.
        </p>
      </div>
    )
  }

  return (
    <section className="editor-grid" aria-label="Goal management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Goals</p>
            <h2>Create goal</h2>
            <p className="panel-value">
              {goalsWithMetrics.length} goal{goalsWithMetrics.length === 1 ? '' : 's'} tracked
            </p>
          </div>
        </header>

        <div className="bulk-summary" aria-label="Goal summary metrics">
          <div>
            <p>Target total</p>
            <strong>{formatMoney(summary.targetTotal)}</strong>
            <small>{formatMoney(summary.remainingTotal)} remaining</small>
          </div>
          <div>
            <p>Funded total</p>
            <strong>{formatMoney(summary.fundedTotal)}</strong>
            <small>{formatPercent(summary.weightedProgress / 100)} funded</small>
          </div>
          <div>
            <p>Planned monthly</p>
            <strong>{formatMoney(summary.plannedMonthlyContributionTotal)}</strong>
            <small>{formatMoney(summary.requiredMonthlyContributionTotal)} required pace</small>
          </div>
        </div>

        <form className="entry-form entry-form--grid" onSubmit={onAddGoal} aria-describedby="goal-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="goal-title">Goal title</label>
              <input
                id="goal-title"
                value={goalForm.title}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-type">Goal type</label>
              <select
                id="goal-type"
                value={goalForm.goalType}
                onChange={(event) =>
                  setGoalForm((prev) => ({
                    ...prev,
                    goalType: event.target.value as GoalType,
                  }))
                }
              >
                {goalTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="goal-priority">Priority</label>
              <select
                id="goal-priority"
                value={goalForm.priority}
                onChange={(event) =>
                  setGoalForm((prev) => ({
                    ...prev,
                    priority: event.target.value as GoalPriority,
                  }))
                }
              >
                {goalPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="goal-target">Target amount</label>
              <input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={goalForm.targetAmount}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, targetAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-current">Current amount</label>
              <input
                id="goal-current"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={goalForm.currentAmount}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, currentAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-contribution">Planned contribution</label>
              <input
                id="goal-contribution"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={goalForm.contributionAmount}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, contributionAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-date">Due / target date</label>
              <input
                id="goal-date"
                type="date"
                value={goalForm.targetDate}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-cadence">Contribution cadence</label>
              <select
                id="goal-cadence"
                value={goalForm.cadence}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, cadence: event.target.value as Cadence }))}
              >
                {cadenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {goalForm.cadence === 'custom' ? (
              <>
                <div className="form-field">
                  <label htmlFor="goal-custom-interval">Custom interval</label>
                  <input
                    id="goal-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={goalForm.customInterval}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, customInterval: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="goal-custom-unit">Custom unit</label>
                  <select
                    id="goal-custom-unit"
                    value={goalForm.customUnit}
                    onChange={(event) =>
                      setGoalForm((prev) => ({ ...prev, customUnit: event.target.value as GoalForm['customUnit'] }))
                    }
                  >
                    {customCadenceUnitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <div className="form-field form-field--span2">{renderFundingMapEditor(goalForm, setGoalForm, 'goal-form')}</div>
          </div>

          <p id="goal-form-hint" className="form-hint">
            Phase 1 goals include type, contribution schedule, milestone path (25/50/75/100%), and funding source mapping.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save goal
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Goals</p>
            <h2>Current goals</h2>
            <p className="panel-value">
              {summary.completedCount} complete · {summary.overdueCount} overdue
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search goals"
              placeholder="Search title, type, priority, status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Filter goals by priority"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as 'all' | GoalPriority)}
            >
              <option value="all">All priorities</option>
              {goalPriorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter goals by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as GoalStatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="on_track">On track</option>
              <option value="at_risk">At risk</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
            </select>
            <select aria-label="Sort goals" value={sortKey} onChange={(event) => setSortKey(event.target.value as GoalSortKey)}>
              <option value="due_asc">Due date (soonest)</option>
              <option value="progress_desc">Progress (high-low)</option>
              <option value="remaining_desc">Remaining (high-low)</option>
              <option value="priority_desc">Priority (high first)</option>
              <option value="title_asc">Title (A-Z)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setPriorityFilter('all')
                setStatusFilter('all')
                setSortKey('due_asc')
              }}
              disabled={!hasFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {goalsWithMetrics.length === 0 ? (
          <p className="empty-state">No goals created yet.</p>
        ) : visibleGoals.length === 0 ? (
          <p className="empty-state">No goals match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleGoals.length} of {goalsWithMetrics.length} goal{goalsWithMetrics.length === 1 ? '' : 's'} ·
              Planned {formatMoney(summary.plannedMonthlyContributionTotal)} / month across all goals.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide" data-testid="goals-table">
                <caption className="sr-only">Goals</caption>
                <thead>
                  <tr>
                    <th scope="col">Goal</th>
                    <th scope="col">Target</th>
                    <th scope="col">Current</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress path</th>
                    <th scope="col">Funding map</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGoals.map((goal) => {
                    const isEditing = goalEditId === goal._id
                    const status = goalStatus(goal)
                    const progressWidth = `${Math.max(0, Math.min(goal.progressPercent, 100)).toFixed(1)}%`
                    const progressStyle = { '--bar-width': progressWidth } as CSSProperties
                    const fundingSources = goal.fundingSourcesValue
                    const editFundingRows = normalizeFundingRows(goalEditDraft.fundingSources)

                    return (
                      <tr key={goal._id} className={isEditing ? 'table-row--editing' : undefined}>
                        <td>
                          {isEditing ? (
                            <div className="cell-stack">
                              <input
                                className="inline-input"
                                value={goalEditDraft.title}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    title: event.target.value,
                                  }))
                                }
                              />
                              <select
                                className="inline-select"
                                value={goalEditDraft.goalType}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    goalType: event.target.value as GoalType,
                                  }))
                                }
                              >
                                {goalTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="cell-stack">
                              <strong>{goal.title}</strong>
                              <span className={goalTypePill(goal.goalTypeValue)}>{goalTypeLabel(goal.goalTypeValue)}</span>
                              <small title={formatShortDate(goal.targetDate, dateLabel)}>
                                Due {goal.targetDate} · {daysLeftLabel(goal.daysLeft)}
                              </small>
                            </div>
                          )}
                        </td>
                        <td className="table-amount">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              value={goalEditDraft.targetAmount}
                              onChange={(event) =>
                                setGoalEditDraft((prev) => ({
                                  ...prev,
                                  targetAmount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            formatMoney(goal.targetAmount)
                          )}
                        </td>
                        <td className="table-amount amount-positive">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={goalEditDraft.currentAmount}
                              onChange={(event) =>
                                setGoalEditDraft((prev) => ({
                                  ...prev,
                                  currentAmount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            formatMoney(goal.currentAmount)
                          )}
                        </td>
                        <td className="table-amount amount-negative">{formatMoney(goal.remaining)}</td>
                        <td>
                          {isEditing ? (
                            <div className="goal-inline-editor">
                              <input
                                className="inline-input"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                placeholder="Contribution"
                                value={goalEditDraft.contributionAmount}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    contributionAmount: event.target.value,
                                  }))
                                }
                              />
                              <select
                                className="inline-select"
                                value={goalEditDraft.cadence}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    cadence: event.target.value as Cadence,
                                  }))
                                }
                              >
                                {cadenceOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {goalEditDraft.cadence === 'custom' ? (
                                <>
                                  <input
                                    className="inline-input"
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    step="1"
                                    placeholder="Interval"
                                    value={goalEditDraft.customInterval}
                                    onChange={(event) =>
                                      setGoalEditDraft((prev) => ({
                                        ...prev,
                                        customInterval: event.target.value,
                                      }))
                                    }
                                  />
                                  <select
                                    className="inline-select"
                                    value={goalEditDraft.customUnit}
                                    onChange={(event) =>
                                      setGoalEditDraft((prev) => ({
                                        ...prev,
                                        customUnit: event.target.value as GoalEditDraft['customUnit'],
                                      }))
                                    }
                                  >
                                    {customCadenceUnitOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : null}
                              <input
                                className="inline-input"
                                type="date"
                                value={goalEditDraft.targetDate}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    targetDate: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          ) : (
                            <div className="cell-stack">
                              <strong>{formatMoney(goal.contributionAmountValue)}</strong>
                              <span className="pill pill--cadence">
                                {cadenceLabel(goal.cadenceValue, goal.customIntervalValue, goal.customUnitValue)}
                              </span>
                              <small>{formatMoney(goal.plannedMonthlyContribution)} / mo planned</small>
                              <small>
                                {formatMoney(goal.requiredMonthlyContribution)} / mo required pace
                              </small>
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="inline-select"
                              value={goalEditDraft.priority}
                              onChange={(event) =>
                                setGoalEditDraft((prev) => ({
                                  ...prev,
                                  priority: event.target.value as GoalPriority,
                                }))
                              }
                            >
                              {goalPriorityOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={priorityPill(goal.priority)}>{priorityLabel(goal.priority)}</span>
                          )}
                        </td>
                        <td>
                          <span className={goalStatusPill(status)}>{status.replace('_', ' ')}</span>
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="cell-stack">
                              <small>Milestones update after save from target date + progress path.</small>
                              <div className="goal-milestone-grid">
                                {[25, 50, 75, 100].map((percent) => (
                                  <span key={percent} className="goal-milestone-pill">
                                    {percent}%
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="cell-stack">
                              <div className="goal-preview-row">
                                <strong>{formatPercent(goal.progressPercent / 100)}</strong>
                              </div>
                              <span className="bar-track" aria-hidden="true">
                                <span className="bar-fill" style={progressStyle} />
                              </span>
                              <div className="goal-milestone-grid" aria-label="Goal milestones">
                                {goal.milestones.map((milestone) => (
                                  <span
                                    key={`${goal._id}-${milestone.percent}`}
                                    className={`goal-milestone-pill ${milestone.achieved ? 'goal-milestone-pill--done' : ''}`}
                                    title={`${milestone.label} target: ${formatShortDate(milestone.targetDate, dateLabel)}`}
                                  >
                                    {milestone.label} · {milestone.targetDate.slice(5)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="goal-funding-cell-editor">
                              {editFundingRows.map((row, index) => {
                                const options = sourceOptionsByType[row.sourceType]
                                return (
                                  <div key={`edit-${goal._id}-${index}`} className="goal-funding-map-row">
                                    <select
                                      className="inline-select"
                                      value={row.sourceType}
                                      onChange={(event) =>
                                        updateFundingRow(setGoalEditDraft, index, {
                                          sourceType: event.target.value as GoalFundingSourceType,
                                          sourceId: '',
                                        })
                                      }
                                    >
                                      {goalFundingSourceTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="inline-select"
                                      value={row.sourceId}
                                      onChange={(event) => updateFundingRow(setGoalEditDraft, index, { sourceId: event.target.value })}
                                    >
                                      <option value="">Select...</option>
                                      {options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      placeholder="%"
                                      value={row.allocationPercent}
                                      onChange={(event) =>
                                        updateFundingRow(setGoalEditDraft, index, { allocationPercent: event.target.value })
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn--sm"
                                      onClick={() => removeFundingRow(setGoalEditDraft, index)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )
                              })}
                              <button type="button" className="btn btn-ghost btn--sm" onClick={() => addFundingRow(setGoalEditDraft)}>
                                Add source
                              </button>
                            </div>
                          ) : fundingSources.length === 0 ? (
                            <span className="cell-truncate">No sources mapped</span>
                          ) : (
                            <div className="cell-stack">
                              {fundingSources.map((entry, index) => (
                                <span key={`${goal._id}-${entry.sourceType}-${entry.sourceId}-${index}`} className="pill pill--neutral">
                                  {goalFundingSourceKindLabel(entry.sourceType)}: {getFundingSourceDisplay(entry.sourceType, entry.sourceId)}
                                  {entry.allocationPercent !== undefined ? ` · ${entry.allocationPercent}%` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            {isEditing ? (
                              <>
                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveGoalEdit()}>
                                  Save
                                </button>
                                <button type="button" className="btn btn-ghost btn--sm" onClick={() => setGoalEditId(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startGoalEdit(goal)}>
                                Edit
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteGoal(goal._id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  )
}
