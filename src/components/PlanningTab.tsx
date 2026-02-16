import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
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

type RuleSortKey = 'priority_desc' | 'priority_asc' | 'name_asc' | 'category_asc' | 'status_asc'
type BudgetSortKey = 'category_asc' | 'target_desc' | 'spent_desc' | 'variance_asc' | 'status_priority'

const emptyRuleForm: RuleForm = {
  name: '',
  matchType: 'contains',
  merchantPattern: '',
  category: '',
  reconciliationStatus: '',
  priority: '10',
  active: true,
}

const budgetStatusRank: Record<BudgetPerformance['status'], number> = {
  over: 0,
  warning: 1,
  on_track: 2,
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
  const [ruleQuery, setRuleQuery] = useState('')
  const [ruleSortKey, setRuleSortKey] = useState<RuleSortKey>('priority_desc')
  const [budgetQuery, setBudgetQuery] = useState('')
  const [budgetStatusFilter, setBudgetStatusFilter] = useState<'all' | BudgetPerformance['status']>('all')
  const [budgetSortKey, setBudgetSortKey] = useState<BudgetSortKey>('category_asc')

  const incomeDelta = Number.parseFloat(whatIfInput.incomeDeltaPercent || '0') / 100
  const commitmentDelta = Number.parseFloat(whatIfInput.commitmentDeltaPercent || '0') / 100
  const spendDelta = Number.parseFloat(whatIfInput.spendDeltaPercent || '0') / 100
  const baselineMonthlySpend = summary.purchasesThisMonth
  const baselineMonthlyNet = summary.projectedMonthlyNet
  const scenarioMonthlyNet =
    summary.monthlyIncome * (1 + incomeDelta) -
    summary.monthlyCommitments * (1 + commitmentDelta) -
    baselineMonthlySpend * (1 + spendDelta)
  const scenarioDelta = scenarioMonthlyNet - baselineMonthlyNet

  const forecastByWindow = useMemo(
    () => new Map<ForecastWindow['days'], ForecastWindow>(forecastWindows.map((window) => [window.days, window])),
    [forecastWindows],
  )

  const budgetById = useMemo(() => {
    const lookup = new Map<string, EnvelopeBudgetEntry>()
    sortedBudgets.forEach((entry) => {
      lookup.set(String(entry._id), entry)
    })
    return lookup
  }, [sortedBudgets])

  const visibleRules = useMemo(() => {
    const query = ruleQuery.trim().toLowerCase()
    const filtered = query
      ? sortedRules.filter((rule) =>
          `${rule.name} ${rule.merchantPattern} ${rule.category}`.toLowerCase().includes(query),
        )
      : sortedRules.slice()

    return filtered.sort((a, b) => {
      switch (ruleSortKey) {
        case 'priority_desc':
          return b.priority - a.priority || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'priority_asc':
          return a.priority - b.priority || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'category_asc':
          return a.category.localeCompare(b.category, undefined, { sensitivity: 'base' })
        case 'status_asc': {
          const aKey = a.active ? 0 : 1
          const bKey = b.active ? 0 : 1
          return aKey - bKey || b.priority - a.priority
        }
        default:
          return 0
      }
    })
  }, [ruleQuery, ruleSortKey, sortedRules])

  const visibleBudgetPerformance = useMemo(() => {
    const query = budgetQuery.trim().toLowerCase()
    const filtered = budgetPerformance.filter((entry) => {
      const statusMatch = budgetStatusFilter === 'all' ? true : entry.status === budgetStatusFilter
      const queryMatch = query.length === 0 ? true : entry.category.toLowerCase().includes(query)
      return statusMatch && queryMatch
    })

    return filtered.sort((a, b) => {
      switch (budgetSortKey) {
        case 'category_asc':
          return a.category.localeCompare(b.category, undefined, { sensitivity: 'base' })
        case 'target_desc':
          return b.effectiveTarget - a.effectiveTarget
        case 'spent_desc':
          return b.spent - a.spent
        case 'variance_asc':
          return a.variance - b.variance
        case 'status_priority':
          return budgetStatusRank[a.status] - budgetStatusRank[b.status] || a.variance - b.variance
        default:
          return 0
      }
    })
  }, [budgetPerformance, budgetQuery, budgetSortKey, budgetStatusFilter])

  const activeRuleCount = sortedRules.filter((rule) => rule.active).length
  const overBudgetCount = budgetPerformance.filter((entry) => entry.status === 'over').length
  const warningBudgetCount = budgetPerformance.filter((entry) => entry.status === 'warning').length
  const criticalRiskCount = billRiskAlerts.filter((alert) => alert.risk === 'critical').length
  const warningRiskCount = billRiskAlerts.filter((alert) => alert.risk === 'warning').length
  const monthCloseDoneCount = monthCloseChecklist.filter((item) => item.done).length
  const monthCloseCompletion =
    monthCloseChecklist.length > 0 ? Math.round((monthCloseDoneCount / monthCloseChecklist.length) * 100) : 0
  const qualityIssueCount =
    dataQuality.duplicateCount +
    dataQuality.anomalyCount +
    dataQuality.missingCategoryCount +
    dataQuality.pendingReconciliationCount +
    dataQuality.splitMismatchCount

  const scenarioDeltaPill = scenarioDelta >= 0 ? 'pill pill--good' : 'pill pill--critical'
  const ruleStatusPill = (active: boolean) => (active ? 'pill pill--good' : 'pill pill--neutral')
  const recStatusPill = (status: ReconciliationStatus | undefined) => {
    if (status === 'reconciled') return 'pill pill--good'
    if (status === 'pending') return 'pill pill--warning'
    return 'pill pill--neutral'
  }
  const budgetStatusPill = (status: BudgetPerformance['status']) => {
    if (status === 'over') return 'pill pill--critical'
    if (status === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }
  const forecastRiskPill = (risk: ForecastWindow['risk']) => {
    if (risk === 'critical') return 'pill pill--critical'
    if (risk === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }
  const billRiskPill = (risk: BillRiskAlert['risk']) => {
    if (risk === 'critical') return 'pill pill--critical'
    if (risk === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }

  const resetRuleForm = () => {
    setRuleEditId(null)
    setRuleForm(emptyRuleForm)
  }

  const resetBudgetForm = () => {
    setBudgetEditId(null)
    setBudgetForm({
      month: monthKey,
      category: '',
      targetAmount: '',
      rolloverEnabled: true,
      carryoverAmount: '',
    })
  }

  const forecast30 = forecastByWindow.get(30)
  const forecast90 = forecastByWindow.get(90)
  const forecast365 = forecastByWindow.get(365)
  const hasRuleFilters = ruleQuery.length > 0 || ruleSortKey !== 'priority_desc'
  const hasBudgetFilters = budgetQuery.length > 0 || budgetStatusFilter !== 'all' || budgetSortKey !== 'category_asc'

  return (
    <section className="content-grid" aria-label="Planning and automation">
      <article className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Planning</p>
            <h2>Command center</h2>
            <p className="panel-value">{monthKey}</p>
          </div>
        </header>
        <div className="trust-kpi-grid" aria-label="Planning KPI summary">
          <div className="trust-kpi-tile">
            <p>Rules active</p>
            <strong>{activeRuleCount}</strong>
            <small>{sortedRules.length} total configured</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Budgets in month</p>
            <strong>{budgetPerformance.length}</strong>
            <small>
              {overBudgetCount} over / {warningBudgetCount} warning
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Bill risk alerts</p>
            <strong>{billRiskAlerts.length}</strong>
            <small>
              {criticalRiskCount} critical / {warningRiskCount} warning
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Data quality issues</p>
            <strong>{qualityIssueCount}</strong>
            <small>{dataQuality.pendingReconciliationCount} pending reconcile</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Month close progress</p>
            <strong>{monthCloseCompletion}%</strong>
            <small>
              {monthCloseDoneCount} / {monthCloseChecklist.length || 0} checklist items
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Scenario delta</p>
            <strong>{formatMoney(scenarioDelta)}</strong>
            <small>{scenarioDelta >= 0 ? 'Improves monthly net' : 'Reduces monthly net'}</small>
          </div>
        </div>
      </article>

      <article className="panel panel-launch">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">At a glance</p>
            <h2>Forecast + scenario</h2>
          </div>
          <span className={scenarioDeltaPill}>{scenarioDelta >= 0 ? 'Positive' : 'Negative'}</span>
        </header>
        <ul className="launch-readiness">
          <li>
            <span>30-day cash outlook</span>
            <strong>{forecast30 ? formatMoney(forecast30.projectedCash) : 'Not available'}</strong>
          </li>
          <li>
            <span>90-day cash outlook</span>
            <strong>{forecast90 ? formatMoney(forecast90.projectedCash) : 'Not available'}</strong>
          </li>
          <li>
            <span>365-day cash outlook</span>
            <strong>{forecast365 ? formatMoney(forecast365.projectedCash) : 'Not available'}</strong>
          </li>
          <li>
            <span>Scenario monthly net</span>
            <strong>{formatMoney(scenarioMonthlyNet)}</strong>
          </li>
          <li>
            <span>Recurring candidates</span>
            <strong>{recurringCandidates.length}</strong>
          </li>
        </ul>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Rules engine</p>
            <h2>Transaction rule editor</h2>
            <p className="panel-value">{sortedRules.length} rules total</p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={submitRule}>
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="rule-name">Rule name</label>
              <input
                id="rule-name"
                value={ruleForm.name}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="rule-match-type">Match type</label>
              <select
                id="rule-match-type"
                value={ruleForm.matchType}
                onChange={(event) =>
                  setRuleForm((previous) => ({ ...previous, matchType: event.target.value as RuleMatchType }))
                }
              >
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
                <option value="exact">Exact</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="rule-priority">Priority</label>
              <input
                id="rule-priority"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={ruleForm.priority}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, priority: event.target.value }))}
                required
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="rule-pattern">Merchant pattern</label>
              <input
                id="rule-pattern"
                value={ruleForm.merchantPattern}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, merchantPattern: event.target.value }))}
                placeholder="e.g. TESCO, NETFLIX"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="rule-category">Category</label>
              <input
                id="rule-category"
                value={ruleForm.category}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, category: event.target.value }))}
                placeholder="e.g. Groceries"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="rule-status">Default reconciliation</label>
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
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="rule-active">
                <input
                  id="rule-active"
                  type="checkbox"
                  checked={ruleForm.active}
                  onChange={(event) => setRuleForm((previous) => ({ ...previous, active: event.target.checked }))}
                />
                Rule active
              </label>
            </div>
          </div>

          <p className="form-hint">
            Tip: combine <strong>priority</strong> with precise merchant patterns so the strongest matching rule wins.
          </p>

          <div className="form-actions row-actions">
            <button type="submit" className="btn btn-primary">
              {ruleEditId ? 'Update rule' : 'Add rule'}
            </button>
            {ruleEditId ? (
              <button type="button" className="btn btn-ghost" onClick={resetRuleForm}>
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
            <h2>Rule library</h2>
            <p className="panel-value">{visibleRules.length} in view</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search transaction rules"
              placeholder="Search name, matcher, category…"
              value={ruleQuery}
              onChange={(event) => setRuleQuery(event.target.value)}
            />
            <select
              aria-label="Sort rules"
              value={ruleSortKey}
              onChange={(event) => setRuleSortKey(event.target.value as RuleSortKey)}
            >
              <option value="priority_desc">Priority (high-low)</option>
              <option value="priority_asc">Priority (low-high)</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="category_asc">Category (A-Z)</option>
              <option value="status_asc">Status (active first)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setRuleQuery('')
                setRuleSortKey('priority_desc')
              }}
              disabled={!hasRuleFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {sortedRules.length === 0 ? (
          <p className="empty-state">No transaction rules configured yet.</p>
        ) : visibleRules.length === 0 ? (
          <p className="empty-state">No rules match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleRules.length} of {sortedRules.length} rule{sortedRules.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide">
                <caption className="sr-only">Transaction rule entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Matcher</th>
                    <th scope="col">Category</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Default status</th>
                    <th scope="col">State</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRules.map((rule) => (
                    <tr key={rule._id} className={ruleEditId === rule._id ? 'table-row--editing' : undefined}>
                      <td>{rule.name}</td>
                      <td>
                        <span className="cell-truncate" title={`${rule.matchType}: ${rule.merchantPattern}`}>
                          {rule.matchType}: {rule.merchantPattern}
                        </span>
                      </td>
                      <td>
                        <span className="pill pill--neutral">{rule.category}</span>
                      </td>
                      <td className="table-amount">{rule.priority}</td>
                      <td>
                        <span className={recStatusPill(rule.reconciliationStatus)}>
                          {rule.reconciliationStatus ?? 'inherit'}
                        </span>
                      </td>
                      <td>
                        <span className={ruleStatusPill(rule.active)}>{rule.active ? 'active' : 'disabled'}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => startRuleEdit(rule)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost btn--sm" onClick={() => void removeRule(rule._id)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Envelope budgeting</p>
            <h2>Budget editor</h2>
            <p className="panel-value">{budgetPerformance.length} category budgets</p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={submitBudget}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="budget-month">Month</label>
              <input
                id="budget-month"
                type="month"
                value={budgetForm.month}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, month: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="budget-category">Category</label>
              <input
                id="budget-category"
                value={budgetForm.category}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, category: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="budget-target">Target amount</label>
              <input
                id="budget-target"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={budgetForm.targetAmount}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, targetAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="budget-carryover">Carryover</label>
              <input
                id="budget-carryover"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={budgetForm.carryoverAmount}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, carryoverAmount: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="budget-rollover-enabled">
                <input
                  id="budget-rollover-enabled"
                  type="checkbox"
                  checked={budgetForm.rolloverEnabled}
                  onChange={(event) =>
                    setBudgetForm((previous) => ({ ...previous, rolloverEnabled: event.target.checked }))
                  }
                />
                Enable rollover into next month
              </label>
            </div>
          </div>

          <p className="form-hint">
            Tip: use carryover to represent unspent funds, then compare <strong>projected month-end</strong> to target.
          </p>

          <div className="form-actions row-actions">
            <button type="submit" className="btn btn-primary">
              {budgetEditId ? 'Update budget' : 'Add budget'}
            </button>
            {budgetEditId ? (
              <button type="button" className="btn btn-ghost" onClick={resetBudgetForm}>
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
            <h2>Targets vs actuals</h2>
            <p className="panel-value">
              {formatMoney(budgetPerformance.reduce((sum, entry) => sum + entry.effectiveTarget, 0))} total targets
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search budget categories"
              placeholder="Search categories…"
              value={budgetQuery}
              onChange={(event) => setBudgetQuery(event.target.value)}
            />
            <select
              aria-label="Filter budget status"
              value={budgetStatusFilter}
              onChange={(event) => setBudgetStatusFilter(event.target.value as 'all' | BudgetPerformance['status'])}
            >
              <option value="all">All statuses</option>
              <option value="on_track">On track</option>
              <option value="warning">Warning</option>
              <option value="over">Over</option>
            </select>
            <select
              aria-label="Sort budgets"
              value={budgetSortKey}
              onChange={(event) => setBudgetSortKey(event.target.value as BudgetSortKey)}
            >
              <option value="category_asc">Category (A-Z)</option>
              <option value="target_desc">Target (high-low)</option>
              <option value="spent_desc">Spent (high-low)</option>
              <option value="variance_asc">Variance (most negative first)</option>
              <option value="status_priority">Status (over first)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setBudgetQuery('')
                setBudgetStatusFilter('all')
                setBudgetSortKey('category_asc')
              }}
              disabled={!hasBudgetFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {budgetPerformance.length === 0 ? (
          <p className="empty-state">No budgets configured for this month.</p>
        ) : visibleBudgetPerformance.length === 0 ? (
          <p className="empty-state">No budgets match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleBudgetPerformance.length} of {budgetPerformance.length} budget
              {budgetPerformance.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide">
                <caption className="sr-only">Budget performance table</caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Target</th>
                    <th scope="col">Spent</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Projected</th>
                    <th scope="col">Rollover</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBudgetPerformance.map((entry) => {
                    const budgetEntry = budgetById.get(entry.id)
                    return (
                      <tr key={entry.id} className={budgetEntry?._id === budgetEditId ? 'table-row--editing' : undefined}>
                        <td>{entry.category}</td>
                        <td className="table-amount">{formatMoney(entry.effectiveTarget)}</td>
                        <td className="table-amount amount-negative">{formatMoney(entry.spent)}</td>
                        <td className={`table-amount ${entry.variance < 0 ? 'amount-negative' : 'amount-positive'}`}>
                          {formatMoney(entry.variance)}
                        </td>
                        <td className="table-amount">{formatMoney(entry.projectedMonthEnd)}</td>
                        <td>
                          <span className={entry.rolloverEnabled ? 'pill pill--good' : 'pill pill--neutral'}>
                            {entry.rolloverEnabled ? 'enabled' : 'off'}
                          </span>
                        </td>
                        <td>
                          <span className={budgetStatusPill(entry.status)}>{entry.status}</span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn--sm"
                              onClick={() => {
                                if (budgetEntry) startBudgetEdit(budgetEntry)
                              }}
                              disabled={!budgetEntry}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => {
                                if (budgetEntry) void removeBudget(budgetEntry._id)
                              }}
                              disabled={!budgetEntry}
                            >
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

      <article className="panel panel-cash-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Forecast</p>
            <h2>30 / 90 / 365 outlook</h2>
          </div>
        </header>
        {forecastWindows.length === 0 ? (
          <p className="empty-state">Forecast unavailable until data is added.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table">
              <caption className="sr-only">Forecast windows</caption>
              <thead>
                <tr>
                  <th scope="col">Window</th>
                  <th scope="col">Projected cash</th>
                  <th scope="col">Projected net</th>
                  <th scope="col">Coverage</th>
                  <th scope="col">Risk</th>
                </tr>
              </thead>
              <tbody>
                {forecastWindows.map((window) => (
                  <tr key={window.days}>
                    <td>{window.days} days</td>
                    <td className="table-amount">{formatMoney(window.projectedCash)}</td>
                    <td className={`table-amount ${window.projectedNet < 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {formatMoney(window.projectedNet)}
                    </td>
                    <td>{window.coverageMonths.toFixed(1)} months</td>
                    <td>
                      <span className={forecastRiskPill(window.risk)}>{window.risk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-cash-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">What-If</p>
            <h2>Scenario simulator</h2>
          </div>
        </header>
        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="whatif-income">Income delta %</label>
              <input
                id="whatif-income"
                type="number"
                inputMode="decimal"
                step="1"
                value={whatIfInput.incomeDeltaPercent}
                onChange={(event) =>
                  setWhatIfInput((previous) => ({ ...previous, incomeDeltaPercent: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="whatif-commitments">Commitments delta %</label>
              <input
                id="whatif-commitments"
                type="number"
                inputMode="decimal"
                step="1"
                value={whatIfInput.commitmentDeltaPercent}
                onChange={(event) =>
                  setWhatIfInput((previous) => ({ ...previous, commitmentDeltaPercent: event.target.value }))
                }
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="whatif-spend">Variable spend delta %</label>
              <input
                id="whatif-spend"
                type="number"
                inputMode="decimal"
                step="1"
                value={whatIfInput.spendDeltaPercent}
                onChange={(event) => setWhatIfInput((previous) => ({ ...previous, spendDeltaPercent: event.target.value }))}
              />
            </div>
          </div>

          <div className="bulk-summary">
            <div>
              <p>Baseline monthly net</p>
              <strong>{formatMoney(baselineMonthlyNet)}</strong>
              <small>Current projection</small>
            </div>
            <div>
              <p>Scenario monthly net</p>
              <strong>{formatMoney(scenarioMonthlyNet)}</strong>
              <small>
                <span className={scenarioDeltaPill}>
                  {scenarioDelta >= 0 ? '+' : ''}
                  {formatMoney(scenarioDelta)}
                </span>
              </small>
            </div>
          </div>
        </div>
      </article>

      <article className="panel panel-categories">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Risk Alerts</p>
            <h2>Upcoming bill risk</h2>
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
                    {alert.daysAway} days • {formatMoney(alert.amount)} due • expected {formatMoney(alert.expectedAvailable)} •{' '}
                    {alert.autopay ? 'autopay' : 'manual'}
                  </small>
                </div>
                <span className={billRiskPill(alert.risk)}>{alert.risk}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel panel-goal-preview">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data Quality</p>
            <h2>Quality + recurrence</h2>
            <p className="panel-value">{qualityIssueCount} issue signals</p>
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
            <span>Pending reconciliation</span>
            <strong>{dataQuality.pendingReconciliationCount}</strong>
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
                <span className={candidate.confidence >= 75 ? 'pill pill--good' : 'pill pill--warning'}>
                  {candidate.confidence.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="panel panel-audit-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Month Close</p>
            <h2>Checklist status</h2>
            <p className="panel-value">
              {monthCloseDoneCount}/{monthCloseChecklist.length || 0} complete
            </p>
          </div>
          <span className={monthCloseCompletion >= 80 ? 'pill pill--good' : 'pill pill--warning'}>{monthCloseCompletion}%</span>
        </header>
        {monthCloseChecklist.length === 0 ? (
          <p className="empty-state">Checklist is unavailable.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table">
              <caption className="sr-only">Month close checklist</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Detail</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthCloseChecklist.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>{item.detail}</td>
                    <td>
                      <span className={item.done ? 'pill pill--good' : 'pill pill--warning'}>{item.done ? 'done' : 'todo'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}
