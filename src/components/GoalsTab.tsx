import { useMemo, useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  GoalEditDraft,
  GoalForm,
  GoalId,
  GoalPriority,
  GoalPriorityOption,
  GoalWithMetrics,
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
  goalPriorityOptions: GoalPriorityOption[]
  priorityLabel: (priority: GoalPriority) => string
  formatMoney: (value: number) => string
  formatPercent: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

const priorityRank: Record<GoalPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const goalStatus = (goal: GoalWithMetrics): Exclude<GoalStatusFilter, 'all'> => {
  if (goal.progressPercent >= 100) return 'completed'
  if (goal.daysLeft < 0) return 'overdue'
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

const daysLeftLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`
  if (daysLeft === 0) return 'due today'
  return `${daysLeft}d left`
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
  goalPriorityOptions,
  priorityLabel,
  formatMoney,
  formatPercent,
  dateLabel,
}: GoalsTabProps) {
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | GoalPriority>('all')
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>('all')
  const [sortKey, setSortKey] = useState<GoalSortKey>('due_asc')

  const summary = useMemo(() => {
    const targetTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.targetAmount, 0)
    const fundedTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.currentAmount, 0)
    const remainingTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.remaining, 0)
    const completedCount = goalsWithMetrics.filter((goal) => goal.progressPercent >= 100).length
    const overdueCount = goalsWithMetrics.filter((goal) => goal.daysLeft < 0 && goal.progressPercent < 100).length
    const weightedProgress = targetTotal > 0 ? (fundedTotal / targetTotal) * 100 : 0

    return {
      targetTotal,
      fundedTotal,
      remainingTotal,
      completedCount,
      overdueCount,
      weightedProgress,
    }
  }, [goalsWithMetrics])

  const visibleGoals = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = goalsWithMetrics.filter((goal) => {
      const status = goalStatus(goal)
      const queryMatch =
        query.length === 0
          ? true
          : `${goal.title} ${goal.priority} ${priorityLabel(goal.priority)} ${status}`.toLowerCase().includes(query)
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
  }, [goalsWithMetrics, priorityFilter, priorityLabel, search, sortKey, statusFilter])

  const hasFilters =
    search.length > 0 || priorityFilter !== 'all' || statusFilter !== 'all' || sortKey !== 'due_asc'

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
              <label htmlFor="goal-date">Target date</label>
              <input
                id="goal-date"
                type="date"
                value={goalForm.targetDate}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
                required
              />
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
          </div>

          <p id="goal-form-hint" className="form-hint">
            Tip: keep high-priority goals realistic with near-term target dates so progress stays actionable.
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
              placeholder="Search title, priority, status..."
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
            <select
              aria-label="Sort goals"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as GoalSortKey)}
            >
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
              Showing {visibleGoals.length} of {goalsWithMetrics.length} goal
              {goalsWithMetrics.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide" data-testid="goals-table">
                <caption className="sr-only">Goals</caption>
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Target</th>
                    <th scope="col">Current</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">Date</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGoals.map((goal) => {
                    const isEditing = goalEditId === goal._id
                    const status = goalStatus(goal)
                    const progressWidth = `${Math.max(0, Math.min(goal.progressPercent, 100)).toFixed(1)}%`
                    const progressStyle = { '--bar-width': progressWidth } as CSSProperties

                    return (
                      <tr key={goal._id} className={isEditing ? 'table-row--editing' : undefined}>
                        <td>
                          {isEditing ? (
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
                          ) : (
                            goal.title
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
                          ) : (
                            <span title={dateLabel.format(new Date(`${goal.targetDate}T00:00:00`))}>{daysLeftLabel(goal.daysLeft)}</span>
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
                          <div className="goal-preview-row">
                            <strong>{formatPercent(goal.progressPercent / 100)}</strong>
                          </div>
                          <span className="bar-track" aria-hidden="true">
                            <span className="bar-fill" style={progressStyle} />
                          </span>
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
