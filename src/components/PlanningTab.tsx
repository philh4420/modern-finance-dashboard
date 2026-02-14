import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type {
  BillRiskAlert,
  BudgetPerformance,
  EnvelopeBudgetEntry,
  EnvelopeBudgetId,
  ForecastWindow,
  MonthCloseChecklistItem,
  RecurringCandidate,
  ReconciliationStatus,
  RuleMatchType,
  Summary,
  TransactionRuleEntry,
  TransactionRuleId,
} from './financeTypes'

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

type PlanningTabProps = {
  monthKey: string
  summary: Summary
  ruleForm: RuleForm
  setRuleForm: Dispatch<SetStateAction<RuleForm>>
  ruleEditId: TransactionRuleId | null
  setRuleEditId: Dispatch<SetStateAction<TransactionRuleId | null>>
  sortedRules: TransactionRuleEntry[]
  submitRule: (event: FormEvent<HTMLFormElement>) => void
  startRuleEdit: (entry: TransactionRuleEntry) => void
  removeRule: (id: TransactionRuleId) => Promise<void>
  budgetForm: BudgetForm
  setBudgetForm: Dispatch<SetStateAction<BudgetForm>>
  budgetEditId: EnvelopeBudgetId | null
  setBudgetEditId: Dispatch<SetStateAction<EnvelopeBudgetId | null>>
  sortedBudgets: EnvelopeBudgetEntry[]
  submitBudget: (event: FormEvent<HTMLFormElement>) => void
  startBudgetEdit: (entry: EnvelopeBudgetEntry) => void
  removeBudget: (id: EnvelopeBudgetId) => Promise<void>
  whatIfInput: WhatIfInput
  setWhatIfInput: Dispatch<SetStateAction<WhatIfInput>>
  budgetPerformance: BudgetPerformance[]
  recurringCandidates: RecurringCandidate[]
  billRiskAlerts: BillRiskAlert[]
  forecastWindows: ForecastWindow[]
  monthCloseChecklist: MonthCloseChecklistItem[]
  dataQuality: {
    duplicateCount: number
    anomalyCount: number
    missingCategoryCount: number
    pendingReconciliationCount: number
    splitMismatchCount: number
  }
  formatMoney: (value: number) => string
}

export function PlanningTab({
  monthKey,
  summary,
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
  budgetPerformance,
  recurringCandidates,
  billRiskAlerts,
  forecastWindows,
  monthCloseChecklist,
  dataQuality,
  formatMoney,
}: PlanningTabProps) {
  const incomeDelta = Number.parseFloat(whatIfInput.incomeDeltaPercent || '0') / 100
  const commitmentDelta = Number.parseFloat(whatIfInput.commitmentDeltaPercent || '0') / 100
  const spendDelta = Number.parseFloat(whatIfInput.spendDeltaPercent || '0') / 100
  const baselineMonthlySpend = summary.purchasesThisMonth
  const scenarioMonthlyNet =
    summary.monthlyIncome * (1 + incomeDelta) -
    summary.monthlyCommitments * (1 + commitmentDelta) -
    baselineMonthlySpend * (1 + spendDelta)

  return (
    <section className="content-grid" aria-label="Planning and automation">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Rules Engine</p>
            <h2>Transaction Rules</h2>
          </div>
        </header>
        <form className="entry-form" onSubmit={submitRule}>
          <label htmlFor="rule-name">Rule Name</label>
          <input
            id="rule-name"
            value={ruleForm.name}
            onChange={(event) => setRuleForm((previous) => ({ ...previous, name: event.target.value }))}
            required
          />
          <label htmlFor="rule-match-type">Match Type</label>
          <select
            id="rule-match-type"
            value={ruleForm.matchType}
            onChange={(event) =>
              setRuleForm((previous) => ({ ...previous, matchType: event.target.value as RuleMatchType }))
            }
          >
            <option value="contains">Contains</option>
            <option value="starts_with">Starts With</option>
            <option value="exact">Exact</option>
          </select>
          <label htmlFor="rule-pattern">Merchant Pattern</label>
          <input
            id="rule-pattern"
            value={ruleForm.merchantPattern}
            onChange={(event) => setRuleForm((previous) => ({ ...previous, merchantPattern: event.target.value }))}
            required
          />
          <label htmlFor="rule-category">Category</label>
          <input
            id="rule-category"
            value={ruleForm.category}
            onChange={(event) => setRuleForm((previous) => ({ ...previous, category: event.target.value }))}
            required
          />
          <label htmlFor="rule-status">Default Reconciliation</label>
          <select
            id="rule-status"
            value={ruleForm.reconciliationStatus}
            onChange={(event) =>
              setRuleForm((previous) => ({
                ...previous,
                reconciliationStatus: event.target.value as '' | ReconciliationStatus,
              }))
            }
          >
            <option value="">No override</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
            <option value="reconciled">Reconciled</option>
          </select>
          <label htmlFor="rule-priority">Priority</label>
          <input
            id="rule-priority"
            type="number"
            min={0}
            step={1}
            value={ruleForm.priority}
            onChange={(event) => setRuleForm((previous) => ({ ...previous, priority: event.target.value }))}
            required
          />
          <label className="checkbox-row" htmlFor="rule-active">
            <input
              id="rule-active"
              type="checkbox"
              checked={ruleForm.active}
              onChange={(event) => setRuleForm((previous) => ({ ...previous, active: event.target.checked }))}
            />
            Rule active
          </label>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary">
              {ruleEditId ? 'Update Rule' : 'Add Rule'}
            </button>
            {ruleEditId ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setRuleEditId(null)
                  setRuleForm({
                    name: '',
                    matchType: 'contains',
                    merchantPattern: '',
                    category: '',
                    reconciliationStatus: '',
                    priority: '10',
                    active: true,
                  })
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Rules</p>
            <h2>Active Rule Set</h2>
          </div>
          <p className="panel-value">{sortedRules.length} rules</p>
        </header>
        {sortedRules.length === 0 ? (
          <p className="empty-state">No transaction rules configured yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Transaction rule entries</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Matcher</th>
                  <th scope="col">Category</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedRules.map((rule) => (
                  <tr key={rule._id}>
                    <td>{rule.name}</td>
                    <td>
                      {rule.matchType}: {rule.merchantPattern}
                    </td>
                    <td>{rule.category}</td>
                    <td>{rule.priority}</td>
                    <td>{rule.active ? 'active' : 'disabled'}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => startRuleEdit(rule)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void removeRule(rule._id)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Envelope Budgeting</p>
            <h2>Budget Setup</h2>
          </div>
        </header>
        <form className="entry-form" onSubmit={submitBudget}>
          <label htmlFor="budget-month">Month</label>
          <input
            id="budget-month"
            type="month"
            value={budgetForm.month}
            onChange={(event) => setBudgetForm((previous) => ({ ...previous, month: event.target.value }))}
            required
          />
          <label htmlFor="budget-category">Category</label>
          <input
            id="budget-category"
            value={budgetForm.category}
            onChange={(event) => setBudgetForm((previous) => ({ ...previous, category: event.target.value }))}
            required
          />
          <label htmlFor="budget-target">Target Amount</label>
          <input
            id="budget-target"
            type="number"
            min="0.01"
            step="0.01"
            value={budgetForm.targetAmount}
            onChange={(event) => setBudgetForm((previous) => ({ ...previous, targetAmount: event.target.value }))}
            required
          />
          <label htmlFor="budget-carryover">Carryover</label>
          <input
            id="budget-carryover"
            type="number"
            min="0"
            step="0.01"
            value={budgetForm.carryoverAmount}
            onChange={(event) => setBudgetForm((previous) => ({ ...previous, carryoverAmount: event.target.value }))}
          />
          <label className="checkbox-row" htmlFor="budget-rollover-enabled">
            <input
              id="budget-rollover-enabled"
              type="checkbox"
              checked={budgetForm.rolloverEnabled}
              onChange={(event) => setBudgetForm((previous) => ({ ...previous, rolloverEnabled: event.target.checked }))}
            />
            Enable rollover
          </label>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary">
              {budgetEditId ? 'Update Budget' : 'Add Budget'}
            </button>
            {budgetEditId ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setBudgetEditId(null)
                  setBudgetForm({
                    month: monthKey,
                    category: '',
                    targetAmount: '',
                    rolloverEnabled: true,
                    carryoverAmount: '',
                  })
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Budgets</p>
            <h2>Targets vs Actuals</h2>
          </div>
          <p className="panel-value">{monthKey}</p>
        </header>
        {budgetPerformance.length === 0 ? (
          <p className="empty-state">No budgets configured for this month.</p>
        ) : (
          <ul className="timeline-list">
            {budgetPerformance.map((entry) => (
              <li key={entry.id}>
                <div>
                  <p>{entry.category}</p>
                  <small>
                    {formatMoney(entry.spent)} spent / {formatMoney(entry.effectiveTarget)} target • projected{' '}
                    {formatMoney(entry.projectedMonthEnd)}
                  </small>
                </div>
                <div className="row-actions">
                  <span className={`severity severity--${entry.status === 'over' ? 'critical' : entry.status === 'warning' ? 'warning' : 'good'}`}>
                    {entry.status}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const budget = sortedBudgets.find((candidate) => String(candidate._id) === entry.id)
                      if (budget) startBudgetEdit(budget)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      const budget = sortedBudgets.find((candidate) => String(candidate._id) === entry.id)
                      if (budget) void removeBudget(budget._id)
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel panel-cash-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Forecast</p>
            <h2>30 / 90 / 365 Outlook</h2>
          </div>
        </header>
        {forecastWindows.length === 0 ? (
          <p className="empty-state">Forecast unavailable until data is added.</p>
        ) : (
          <ul className="status-list">
            {forecastWindows.map((window) => (
              <li key={window.days}>
                <span>{window.days} days</span>
                <strong>{formatMoney(window.projectedCash)}</strong>
                <small>
                  {formatMoney(window.projectedNet)} net • {window.coverageMonths.toFixed(1)} months cover • {window.risk}
                </small>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel panel-insights">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">What-If</p>
            <h2>Scenario Simulator</h2>
          </div>
        </header>
        <div className="entry-form">
          <label htmlFor="whatif-income">Income delta %</label>
          <input
            id="whatif-income"
            type="number"
            step="1"
            value={whatIfInput.incomeDeltaPercent}
            onChange={(event) => setWhatIfInput((previous) => ({ ...previous, incomeDeltaPercent: event.target.value }))}
          />
          <label htmlFor="whatif-commitments">Commitment delta %</label>
          <input
            id="whatif-commitments"
            type="number"
            step="1"
            value={whatIfInput.commitmentDeltaPercent}
            onChange={(event) =>
              setWhatIfInput((previous) => ({ ...previous, commitmentDeltaPercent: event.target.value }))
            }
          />
          <label htmlFor="whatif-spend">Variable spend delta %</label>
          <input
            id="whatif-spend"
            type="number"
            step="1"
            value={whatIfInput.spendDeltaPercent}
            onChange={(event) => setWhatIfInput((previous) => ({ ...previous, spendDeltaPercent: event.target.value }))}
          />
          <p className="panel-value">{formatMoney(scenarioMonthlyNet)} scenario monthly net</p>
        </div>
      </article>

      <article className="panel panel-categories">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Risk Alerts</p>
            <h2>Upcoming Bill Risk</h2>
          </div>
        </header>
        {billRiskAlerts.length === 0 ? (
          <p className="empty-state">No bill risk alerts in the next 45 days.</p>
        ) : (
          <ul className="timeline-list">
            {billRiskAlerts.map((alert) => (
              <li key={alert.id}>
                <div>
                  <p>{alert.name}</p>
                  <small>
                    {alert.daysAway} days • {formatMoney(alert.amount)} due • expected {formatMoney(alert.expectedAvailable)}
                  </small>
                </div>
                <span className={`severity severity--${alert.risk === 'critical' ? 'critical' : alert.risk === 'warning' ? 'warning' : 'good'}`}>
                  {alert.risk}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel panel-goal-preview">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data Quality</p>
            <h2>Quality + Recurrence</h2>
          </div>
        </header>
        <ul className="status-list">
          <li>
            <span>Potential duplicates</span>
            <strong>{dataQuality.duplicateCount}</strong>
          </li>
          <li>
            <span>Anomalies</span>
            <strong>{dataQuality.anomalyCount}</strong>
          </li>
          <li>
            <span>Missing categories</span>
            <strong>{dataQuality.missingCategoryCount}</strong>
          </li>
          <li>
            <span>Split mismatches</span>
            <strong>{dataQuality.splitMismatchCount}</strong>
          </li>
        </ul>
        {recurringCandidates.length > 0 ? (
          <ul className="timeline-list">
            {recurringCandidates.slice(0, 4).map((candidate) => (
              <li key={candidate.id}>
                <div>
                  <p>{candidate.label}</p>
                  <small>
                    Every {candidate.averageIntervalDays.toFixed(1)} days • next {candidate.nextExpectedDate}
                  </small>
                </div>
                <strong>{candidate.confidence.toFixed(0)}%</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="panel panel-snapshot">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Month Close</p>
            <h2>Checklist</h2>
          </div>
        </header>
        {monthCloseChecklist.length === 0 ? (
          <p className="empty-state">Checklist is unavailable.</p>
        ) : (
          <ul className="timeline-list">
            {monthCloseChecklist.map((item) => (
              <li key={item.id}>
                <div>
                  <p>{item.label}</p>
                  <small>{item.detail}</small>
                </div>
                <span className={`severity severity--${item.done ? 'good' : 'warning'}`}>{item.done ? 'done' : 'todo'}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}

