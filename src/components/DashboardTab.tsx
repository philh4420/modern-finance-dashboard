import type { CSSProperties } from 'react'
import type {
  Cadence,
  CycleAuditLogEntry,
  FinanceAuditEventEntry,
  CustomCadenceUnit,
  DashboardCard,
  GoalWithMetrics,
  Insight,
  InsightSeverity,
  LedgerEntry,
  MonthCloseSnapshotEntry,
  MonthlyCycleRunEntry,
  Summary,
  TopCategory,
  UpcomingCashEvent,
} from './financeTypes'

type DashboardTabProps = {
  dashboardCards: DashboardCard[]
  summary: Summary
  insights: Insight[]
  upcomingCashEvents: UpcomingCashEvent[]
  topCategories: TopCategory[]
  goalsWithMetrics: GoalWithMetrics[]
  cycleAuditLogs: CycleAuditLogEntry[]
  monthlyCycleRuns: MonthlyCycleRunEntry[]
  monthCloseSnapshots: MonthCloseSnapshotEntry[]
  financeAuditEvents: FinanceAuditEventEntry[]
  ledgerEntries: LedgerEntry[]
  counts: {
    incomes: number
    bills: number
    cards: number
    loans: number
    purchases: number
    accounts: number
    goals: number
  }
  formatMoney: (value: number) => string
  formatPercent: (value: number) => string
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  severityLabel: (severity: InsightSeverity) => string
  dateLabel: Intl.DateTimeFormat
  cycleDateLabel: Intl.DateTimeFormat
}

export function DashboardTab({
  dashboardCards,
  summary,
  insights,
  upcomingCashEvents,
  topCategories,
  goalsWithMetrics,
  cycleAuditLogs,
  monthlyCycleRuns,
  monthCloseSnapshots,
  financeAuditEvents,
  ledgerEntries,
  counts,
  formatMoney,
  formatPercent,
  cadenceLabel,
  severityLabel,
  dateLabel,
  cycleDateLabel,
}: DashboardTabProps) {
  return (
    <>
      <section className="metric-grid" aria-label="Finance intelligence metrics">
        {dashboardCards.map((card) => (
          <article className="metric-card" key={card.id}>
            <p className="metric-label">{card.label}</p>
            <p className="metric-value">{card.value}</p>
            <p className={`metric-change metric-change--${card.trend}`}>{card.note}</p>
          </article>
        ))}
      </section>

      <section className="content-grid" aria-label="Finance intelligence panels">
        <article className="panel panel-health">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Health</p>
              <h2>System Status</h2>
            </div>
          </header>
          <div className="health-ring-wrap">
            <div
              className="health-ring"
              style={{ '--ring-score': `${Math.min(Math.max(summary.healthScore, 0), 100)}%` } as CSSProperties}
            >
              <div className="health-ring-inner">
                <strong>{summary.healthScore}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <ul className="status-list">
              <li>
                <span>Savings Rate</span>
                <strong>{formatPercent(summary.savingsRatePercent / 100)}</strong>
              </li>
              <li>
                <span>Card Utilization</span>
                <strong>{formatPercent(summary.cardUtilizationPercent / 100)}</strong>
              </li>
              <li>
                <span>Goal Funding</span>
                <strong>{formatPercent(summary.goalsFundedPercent / 100)}</strong>
              </li>
              <li>
                <span>Reconciled Purchases</span>
                <strong>
                  {summary.reconciledPurchases} / {summary.postedPurchases}
                </strong>
              </li>
            </ul>
          </div>
        </article>

        <article className="panel panel-insights">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Insights</p>
              <h2>Automated Finance Brief</h2>
            </div>
          </header>
          {insights.length === 0 ? (
            <p className="empty-state">Add finance data to generate contextual insights.</p>
          ) : (
            <ul className="insight-list">
              {insights.map((insight) => (
                <li key={insight.id}>
                  <div>
                    <p>{insight.title}</p>
                    <small>{insight.detail}</small>
                  </div>
                  <span className={`severity severity--${insight.severity}`}>{severityLabel(insight.severity)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-cash-events">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Flow</p>
              <h2>Upcoming Cash Events</h2>
            </div>
          </header>
          {upcomingCashEvents.length === 0 ? (
            <p className="empty-state">No recurring events scheduled in the next 60 days.</p>
          ) : (
            <ul className="timeline-list">
              {upcomingCashEvents.map((event) => (
                <li key={event.id}>
                  <div>
                    <p>{event.label}</p>
                    <small>
                      {dateLabel.format(new Date(`${event.date}T00:00:00`))} • {event.daysAway} day
                      {event.daysAway === 1 ? '' : 's'} • {cadenceLabel(event.cadence, event.customInterval, event.customUnit)}
                    </small>
                  </div>
                  <strong className={event.type === 'income' ? 'amount-positive' : 'amount-negative'}>
                    {formatMoney(event.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-categories">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Spending</p>
              <h2>Category Concentration</h2>
            </div>
            <p className="panel-value">{formatMoney(summary.purchasesThisMonth)} this month</p>
          </header>
          {topCategories.length === 0 ? (
            <p className="empty-state">No purchases this month yet.</p>
          ) : (
            <ul className="category-bars">
              {topCategories.map((category) => (
                <li key={category.category}>
                  <div className="category-row">
                    <span>{category.category}</span>
                    <strong>{formatMoney(category.total)}</strong>
                  </div>
                  <div className="bar-track">
                    <span className="bar-fill" style={{ '--bar-width': `${category.sharePercent}%` } as CSSProperties} />
                  </div>
                  <small>{formatPercent(category.sharePercent / 100)} of monthly purchases</small>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-goal-preview">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Goals</p>
              <h2>Progress Tracker</h2>
            </div>
          </header>
          {goalsWithMetrics.length === 0 ? (
            <p className="empty-state">No goals yet. Add one in the Goals section.</p>
          ) : (
            <ul className="goal-preview-list">
              {goalsWithMetrics.slice(0, 4).map((goal) => (
                <li key={goal._id}>
                  <div className="goal-preview-row">
                    <span>{goal.title}</span>
                    <strong>{formatPercent(goal.progressPercent / 100)}</strong>
                  </div>
                  <div className="bar-track">
                    <span className="bar-fill" style={{ '--bar-width': `${goal.progressPercent}%` } as CSSProperties} />
                  </div>
                  <small>{formatMoney(goal.remaining)} remaining</small>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-cycle-log">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Cycle Engine</p>
              <h2>Monthly Cycle Audit Log</h2>
            </div>
          </header>
          {cycleAuditLogs.length === 0 ? (
            <p className="empty-state">No cycle runs logged yet.</p>
          ) : (
            <ul className="cycle-log-list">
              {cycleAuditLogs.map((entry) => (
                <li key={entry._id}>
                  <div className="cycle-log-row">
                    <p>{entry.source === 'manual' ? 'Manual Run' : 'Automatic Sync'}</p>
                    <strong>{cycleDateLabel.format(new Date(entry.ranAt))}</strong>
                  </div>
                  <small>
                    {entry.updatedCards} cards ({entry.cardCyclesApplied} cycles), {entry.updatedLoans} loans (
                    {entry.loanCyclesApplied} cycles)
                  </small>
                  <small>
                    {formatMoney(entry.cardInterestAccrued)} card interest, {formatMoney(entry.loanInterestAccrued)} loan
                    interest, {formatMoney(entry.cardPaymentsApplied + entry.loanPaymentsApplied)} total payments
                  </small>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-cycle-runs">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Cycle Control</p>
              <h2>Deterministic Run Journal</h2>
            </div>
          </header>
          {monthlyCycleRuns.length === 0 ? (
            <p className="empty-state">No deterministic cycle runs yet.</p>
          ) : (
            <ul className="timeline-list">
              {monthlyCycleRuns.slice(0, 8).map((run) => (
                <li key={run._id}>
                  <div>
                    <p>
                      {run.cycleKey} ({run.source})
                    </p>
                    <small>
                      {run.updatedCards} cards + {run.updatedLoans} loans updated
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(run.ranAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-month-close">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Month Close</p>
              <h2>Snapshots</h2>
            </div>
          </header>
          {monthCloseSnapshots.length === 0 ? (
            <p className="empty-state">No month-close snapshots yet.</p>
          ) : (
            <ul className="timeline-list">
              {monthCloseSnapshots.slice(0, 6).map((snapshot) => (
                <li key={snapshot._id}>
                  <div>
                    <p>{snapshot.cycleKey}</p>
                    <small>
                      Net worth {formatMoney(snapshot.summary.netWorth)} • Commitments{' '}
                      {formatMoney(snapshot.summary.monthlyCommitments)}
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(snapshot.ranAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-ledger">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Ledger</p>
              <h2>Recent Entries</h2>
            </div>
          </header>
          {ledgerEntries.length === 0 ? (
            <p className="empty-state">No ledger entries yet.</p>
          ) : (
            <ul className="timeline-list">
              {ledgerEntries.slice(0, 10).map((entry) => (
                <li key={entry._id}>
                  <div>
                    <p>{entry.description}</p>
                    <small>
                      {entry.entryType} • {entry.referenceType ?? 'system'}
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(entry.occurredAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-audit-events">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Audit Trail</p>
              <h2>Finance Change Events</h2>
            </div>
          </header>
          {financeAuditEvents.length === 0 ? (
            <p className="empty-state">No finance events recorded yet.</p>
          ) : (
            <ul className="timeline-list">
              {financeAuditEvents.slice(0, 10).map((event) => (
                <li key={event._id}>
                  <div>
                    <p>
                      {event.entityType}: {event.action}
                    </p>
                    <small>{event.entityId}</small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(event.createdAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel panel-snapshot">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Snapshot</p>
              <h2>Data Coverage</h2>
            </div>
          </header>
          <ul className="snapshot-list">
            <li>
              <span>Income entries</span>
              <strong>{counts.incomes}</strong>
            </li>
            <li>
              <span>Bill entries</span>
              <strong>{counts.bills}</strong>
            </li>
            <li>
              <span>Card entries</span>
              <strong>{counts.cards}</strong>
            </li>
            <li>
              <span>Loan entries</span>
              <strong>{counts.loans}</strong>
            </li>
            <li>
              <span>Purchase entries</span>
              <strong>{counts.purchases}</strong>
            </li>
            <li>
              <span>Account entries</span>
              <strong>{counts.accounts}</strong>
            </li>
            <li>
              <span>Goal entries</span>
              <strong>{counts.goals}</strong>
            </li>
          </ul>
        </article>
      </section>
    </>
  )
}
