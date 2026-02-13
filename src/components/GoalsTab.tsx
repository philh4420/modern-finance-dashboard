import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type {
  GoalEditDraft,
  GoalForm,
  GoalId,
  GoalPriority,
  GoalPriorityOption,
  GoalWithMetrics,
} from './financeTypes'

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
  return (
    <section className="editor-grid" aria-label="Goal management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Goals</p>
            <h2>Create Goal</h2>
          </div>
        </header>

        <form className="entry-form" onSubmit={onAddGoal}>
          <label htmlFor="goal-title">Goal Title</label>
          <input
            id="goal-title"
            value={goalForm.title}
            onChange={(event) => setGoalForm((prev) => ({ ...prev, title: event.target.value }))}
            required
          />

          <label htmlFor="goal-target">Target Amount</label>
          <input
            id="goal-target"
            type="number"
            min="0.01"
            step="0.01"
            value={goalForm.targetAmount}
            onChange={(event) => setGoalForm((prev) => ({ ...prev, targetAmount: event.target.value }))}
            required
          />

          <label htmlFor="goal-current">Current Amount</label>
          <input
            id="goal-current"
            type="number"
            min="0"
            step="0.01"
            value={goalForm.currentAmount}
            onChange={(event) => setGoalForm((prev) => ({ ...prev, currentAmount: event.target.value }))}
            required
          />

          <label htmlFor="goal-date">Target Date</label>
          <input
            id="goal-date"
            type="date"
            value={goalForm.targetDate}
            onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
            required
          />

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

          <button type="submit" className="btn btn-primary">
            Save Goal
          </button>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Goals</p>
            <h2>Current Goals</h2>
          </div>
        </header>

        {goalsWithMetrics.length === 0 ? (
          <p className="empty-state">No goals created yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Goals</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Target</th>
                  <th scope="col">Current</th>
                  <th scope="col">Date</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {goalsWithMetrics.map((goal) => {
                  const isEditing = goalEditId === goal._id

                  return (
                    <tr key={goal._id}>
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
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
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
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
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
                          dateLabel.format(new Date(`${goal.targetDate}T00:00:00`))
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
                          priorityLabel(goal.priority)
                        )}
                      </td>
                      <td>{formatPercent(goal.progressPercent / 100)}</td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-secondary" onClick={() => void saveGoalEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setGoalEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startGoalEdit(goal)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeleteGoal(goal._id)}>
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
        )}
      </article>
    </section>
  )
}
