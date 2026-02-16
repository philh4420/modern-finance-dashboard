import type {
  AccountEntry,
  BillEntry,
  CardEntry,
  CycleAuditLogEntry,
  FinanceAuditEventEntry,
  FinancePreference,
  GoalEntry,
  IncomeEntry,
  KpiSnapshot,
  LoanEntry,
  MonthCloseSnapshotEntry,
  MonthlyCycleRunEntry,
  PurchaseEntry,
  Summary,
} from './financeTypes'
import type { PrintReportConfig } from './PrintReportModal'

type PrintReportProps = {
  config: PrintReportConfig
  preference: FinancePreference
  summary: Summary
  kpis: KpiSnapshot | null
  monthCloseSnapshots: MonthCloseSnapshotEntry[]
  incomes: IncomeEntry[]
  bills: BillEntry[]
  cards: CardEntry[]
  loans: LoanEntry[]
  accounts: AccountEntry[]
  goals: GoalEntry[]
  purchases: PurchaseEntry[]
  cycleAuditLogs: CycleAuditLogEntry[]
  monthlyCycleRuns: MonthlyCycleRunEntry[]
  financeAuditEvents: FinanceAuditEventEntry[]
  formatMoney: (value: number) => string
  cycleDateLabel: Intl.DateTimeFormat
}

const normalizeText = (value: string) => value.trim().toLowerCase()

const isGenericCategory = (value: string) => {
  const normalized = normalizeText(value)
  return normalized.length === 0 || normalized === 'uncategorized' || normalized === 'other' || normalized === 'misc'
}

const monthKeyFromPurchase = (purchase: PurchaseEntry) => {
  if (typeof purchase.purchaseDate === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchaseDate)) {
      return purchase.purchaseDate.slice(0, 7)
    }
    if (/^\d{4}-\d{2}$/.test(purchase.purchaseDate)) {
      return purchase.purchaseDate
    }
  }
  if (purchase.statementMonth && /^\d{4}-\d{2}$/.test(purchase.statementMonth)) {
    return purchase.statementMonth
  }
  return new Date(purchase.createdAt).toISOString().slice(0, 7)
}

const inMonthRange = (monthKey: string, startMonth: string, endMonth: string) =>
  monthKey >= startMonth && monthKey <= endMonth

const formatMonthLabel = (locale: string, monthKey: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01T00:00:00`))

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const sumBy = <T,>(values: T[], selector: (value: T) => number) =>
  values.reduce((sum, entry) => sum + selector(entry), 0)

const monthsBetweenInclusive = (startMonth: string, endMonth: string) => {
  const [sy, sm] = startMonth.split('-').map((part) => Number(part))
  const [ey, em] = endMonth.split('-').map((part) => Number(part))
  if (!Number.isFinite(sy) || !Number.isFinite(sm) || !Number.isFinite(ey) || !Number.isFinite(em)) return 1
  return (ey - sy) * 12 + (em - sm) + 1
}

export function PrintReport({
  config,
  preference,
  summary,
  kpis,
  monthCloseSnapshots,
  incomes,
  bills,
  cards,
  loans,
  accounts,
  goals,
  purchases,
  cycleAuditLogs,
  monthlyCycleRuns,
  financeAuditEvents,
  formatMoney,
  cycleDateLabel,
}: PrintReportProps) {
  const locale = preference.locale || 'en-US'
  const generatedAt = new Date()
  const rangeMonths = monthsBetweenInclusive(config.startMonth, config.endMonth)

  const purchasesInRange = purchases
    .map((purchase) => ({ purchase, monthKey: monthKeyFromPurchase(purchase) }))
    .filter((row) => inMonthRange(row.monthKey, config.startMonth, config.endMonth))

  const purchasesTotal = sumBy(purchasesInRange, (row) => row.purchase.amount)

  const monthGroups = new Map<string, PurchaseEntry[]>()
  purchasesInRange.forEach((row) => {
    const current = monthGroups.get(row.monthKey) ?? []
    current.push(row.purchase)
    monthGroups.set(row.monthKey, current)
  })

  const sortedMonthKeys = Array.from(monthGroups.keys()).sort()
  const snapshotsInRange = monthCloseSnapshots
    .filter((snapshot) => inMonthRange(snapshot.cycleKey, config.startMonth, config.endMonth))
    .sort((a, b) => a.cycleKey.localeCompare(b.cycleKey))

  const rangeKpis = (() => {
    if (purchasesInRange.length === 0) {
      return {
        purchaseCount: 0,
        pendingCount: 0,
        missingCategoryCount: 0,
        duplicateCount: 0,
        anomalyCount: 0,
        reconciliationCompletionRate: 1,
      }
    }

    const purchaseCount = purchasesInRange.length
    const pendingCount = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'pending').length
    const missingCategoryCount = purchasesInRange.filter((row) => isGenericCategory(row.purchase.category)).length

    const duplicateMap = new Map<string, number>()
    purchasesInRange.forEach((row) => {
      const purchase = row.purchase
      const key = `${normalizeText(purchase.item)}::${Math.round(purchase.amount * 100) / 100}::${purchase.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = Array.from(duplicateMap.values()).filter((count) => count > 1).length

    const amounts = purchasesInRange.map((row) => row.purchase.amount)
    const mean = amounts.reduce((sum, value) => sum + value, 0) / Math.max(amounts.length, 1)
    const variance =
      amounts.length > 1
        ? amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (amounts.length - 1)
        : 0
    const std = Math.sqrt(variance)
    const anomalyCount = purchasesInRange.filter((row) => std > 0 && row.purchase.amount > mean + std * 2.5 && row.purchase.amount > 50).length

    const postedOrReconciled = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') !== 'pending')
    const reconciled = postedOrReconciled.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'reconciled').length
    const reconciliationCompletionRate = postedOrReconciled.length > 0 ? reconciled / postedOrReconciled.length : 1

    return {
      purchaseCount,
      pendingCount,
      missingCategoryCount,
      duplicateCount,
      anomalyCount,
      reconciliationCompletionRate,
    }
  })()

  const filteredAuditLogs = config.includeAuditLogs
    ? {
        cycleAuditLogs: cycleAuditLogs
          .filter((entry) => (entry.cycleKey ? inMonthRange(entry.cycleKey, config.startMonth, config.endMonth) : false))
          .sort((a, b) => b.ranAt - a.ranAt),
        monthlyCycleRuns: monthlyCycleRuns
          .filter((run) => inMonthRange(run.cycleKey, config.startMonth, config.endMonth))
          .sort((a, b) => b.ranAt - a.ranAt),
        financeAuditEvents: financeAuditEvents
          .filter((event) => {
            const key = new Date(event.createdAt).toISOString().slice(0, 7)
            return inMonthRange(key, config.startMonth, config.endMonth)
          })
          .sort((a, b) => b.createdAt - a.createdAt),
      }
    : null

  const baselineRangeNet =
    summary.monthlyIncome * rangeMonths - summary.monthlyCommitments * rangeMonths - purchasesTotal

  return (
    <article className="print-report" aria-label="Print report">
      <header className="print-cover">
        <div>
          <p className="print-kicker">Adaptive Finance OS</p>
          <h1 className="print-title">Personal Finance Report</h1>
          <p className="print-meta">
            Range {config.startMonth} to {config.endMonth} ({rangeMonths} month{rangeMonths === 1 ? '' : 's'}) • Generated{' '}
            {generatedAt.toLocaleString(locale)} • {preference.currency} / {preference.locale}
          </p>
        </div>
        <div className="print-badge">
          <strong>{formatMoney(purchasesTotal)}</strong>
          <span>purchases in range</span>
        </div>
      </header>

      <section className="print-section print-section--summary">
        <h2>Summary</h2>
        <div className="print-summary-grid">
          <div className="print-summary-card">
            <p>Baseline income (monthly)</p>
            <strong>{formatMoney(summary.monthlyIncome)}</strong>
            <small>{formatMoney(summary.monthlyIncome * rangeMonths)} over range</small>
          </div>
          <div className="print-summary-card">
            <p>Baseline commitments (monthly)</p>
            <strong>{formatMoney(summary.monthlyCommitments)}</strong>
            <small>{formatMoney(summary.monthlyCommitments * rangeMonths)} over range</small>
          </div>
          <div className="print-summary-card">
            <p>Purchases (range)</p>
            <strong>{formatMoney(purchasesTotal)}</strong>
            <small>
              {sortedMonthKeys.length > 0 ? `${sortedMonthKeys.length} month group${sortedMonthKeys.length === 1 ? '' : 's'}` : 'No purchases'}
            </small>
          </div>
          <div className="print-summary-card">
            <p>Baseline net (range)</p>
            <strong>{formatMoney(baselineRangeNet)}</strong>
            <small>income - commitments - purchases</small>
          </div>
        </div>

        <div className="print-kpi-grid">
          <div className="print-kpi">
            <p>Reconciliation</p>
            <strong>{formatPercent(rangeKpis.reconciliationCompletionRate)}</strong>
            <small>
              {rangeKpis.purchaseCount} purchases • {rangeKpis.pendingCount} pending
            </small>
          </div>
          <div className="print-kpi">
            <p>Missing categories</p>
            <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.missingCategoryCount / rangeKpis.purchaseCount) : '0%'}</strong>
            <small>{rangeKpis.missingCategoryCount} flagged</small>
          </div>
          <div className="print-kpi">
            <p>Duplicates</p>
            <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.duplicateCount / rangeKpis.purchaseCount) : '0%'}</strong>
            <small>{rangeKpis.duplicateCount} possible groups</small>
          </div>
          <div className="print-kpi">
            <p>Anomalies</p>
            <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.anomalyCount / rangeKpis.purchaseCount) : '0%'}</strong>
            <small>{rangeKpis.anomalyCount} outliers</small>
          </div>
        </div>

        {kpis ? (
          <p className="print-subnote">
            Trust KPIs (last {kpis.windowDays} days): accuracy {formatPercent(kpis.accuracyRate)}
            {kpis.syncFailureRate === null ? '' : ` • sync failures ${formatPercent(kpis.syncFailureRate)}`} • cycle success{' '}
            {formatPercent(kpis.cycleSuccessRate)} • reconciliation {formatPercent(kpis.reconciliationCompletionRate)}.
          </p>
        ) : null}
      </section>

      <section className="print-section print-section--compact">
        <h2>Month Close Snapshots</h2>
        {snapshotsInRange.length === 0 ? (
          <p className="print-subnote">No month-close snapshots recorded in this range yet. Run monthly cycle to generate snapshots.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Income</th>
                  <th scope="col">Commitments</th>
                  <th scope="col">Liabilities</th>
                  <th scope="col">Net Worth</th>
                  <th scope="col">Runway</th>
                </tr>
              </thead>
              <tbody>
                {snapshotsInRange.map((snapshot) => (
                  <tr key={snapshot._id}>
                    <td>{snapshot.cycleKey}</td>
                    <td className="table-amount">{formatMoney(snapshot.summary.monthlyIncome)}</td>
                    <td className="table-amount">{formatMoney(snapshot.summary.monthlyCommitments)}</td>
                    <td className="table-amount">{formatMoney(snapshot.summary.totalLiabilities)}</td>
                    <td className="table-amount">{formatMoney(snapshot.summary.netWorth)}</td>
                    <td>{snapshot.summary.runwayMonths.toFixed(1)} mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="print-core-grid">
        <section className="print-section print-section--compact">
        <h2>Income</h2>
        {incomes.length === 0 ? (
          <p className="print-subnote">No income entries.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Cadence</th>
                  <th scope="col">Received</th>
                  {config.includeNotes ? <th scope="col">Notes</th> : null}
                </tr>
              </thead>
              <tbody>
                {incomes.map((income) => (
                  <tr key={income._id}>
                    <td>{income.source}</td>
                    <td className="table-amount">{formatMoney(income.amount)}</td>
                    <td>{income.cadence}</td>
                    <td>{income.receivedDay ? `Day ${income.receivedDay}` : 'n/a'}</td>
                    {config.includeNotes ? <td>{income.notes ?? ''}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        <section className="print-section print-section--compact">
        <h2>Bills</h2>
        {bills.length === 0 ? (
          <p className="print-subnote">No bill entries.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Due</th>
                  <th scope="col">Cadence</th>
                  <th scope="col">Autopay</th>
                  {config.includeNotes ? <th scope="col">Notes</th> : null}
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill._id}>
                    <td>{bill.name}</td>
                    <td className="table-amount">{formatMoney(bill.amount)}</td>
                    <td>Day {bill.dueDay}</td>
                    <td>{bill.cadence}</td>
                    <td>{bill.autopay ? 'yes' : 'no'}</td>
                    {config.includeNotes ? <td>{bill.notes ?? ''}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        <section className="print-section print-section--compact">
        <h2>Cards</h2>
        {cards.length === 0 ? (
          <p className="print-subnote">No card entries.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Limit</th>
                  <th scope="col">Used</th>
                  <th scope="col">Min Payment</th>
                  <th scope="col">Monthly Spend</th>
                  <th scope="col">APR</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card._id}>
                    <td>{card.name}</td>
                    <td className="table-amount">{formatMoney(card.creditLimit)}</td>
                    <td className="table-amount">{formatMoney(card.usedLimit)}</td>
                    <td className="table-amount">{formatMoney(card.minimumPayment)}</td>
                    <td className="table-amount">{formatMoney(card.spendPerMonth)}</td>
                    <td>{card.interestRate ? `${card.interestRate.toFixed(2)}%` : 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        <section className="print-section print-section--compact">
        <h2>Loans</h2>
        {loans.length === 0 ? (
          <p className="print-subnote">No loan entries.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Min Payment</th>
                  <th scope="col">Subscription</th>
                  <th scope="col">APR</th>
                  <th scope="col">Due</th>
                  <th scope="col">Cadence</th>
                  {config.includeNotes ? <th scope="col">Notes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan._id}>
                    <td>{loan.name}</td>
                    <td className="table-amount">{formatMoney(loan.balance)}</td>
                    <td className="table-amount">{formatMoney(loan.minimumPayment)}</td>
                    <td className="table-amount">{formatMoney(loan.subscriptionCost ?? 0)}</td>
                    <td>{loan.interestRate ? `${loan.interestRate.toFixed(2)}%` : 'n/a'}</td>
                    <td>Day {loan.dueDay}</td>
                    <td>{loan.cadence}</td>
                    {config.includeNotes ? <td>{loan.notes ?? ''}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        <section className="print-section print-section--compact">
        <h2>Accounts</h2>
        {accounts.length === 0 ? (
          <p className="print-subnote">No account entries.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Balance</th>
                  <th scope="col">Liquid</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account._id}>
                    <td>{account.name}</td>
                    <td>{account.type}</td>
                    <td className="table-amount">{formatMoney(account.balance)}</td>
                    <td>{account.liquid ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>

        <section className="print-section print-section--compact">
        <h2>Goals</h2>
        {goals.length === 0 ? (
          <p className="print-subnote">No goal entries.</p>
        ) : (
          <div className="print-table-wrap">
            <table className="print-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Target</th>
                  <th scope="col">Current</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Target Date</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal) => (
                  <tr key={goal._id}>
                    <td>{goal.title}</td>
                    <td className="table-amount">{formatMoney(goal.targetAmount)}</td>
                    <td className="table-amount">{formatMoney(goal.currentAmount)}</td>
                    <td>{goal.priority}</td>
                    <td>{goal.targetDate ? goal.targetDate : 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </section>
      </div>

      {config.includePurchases ? (
        <section className="print-section print-section--major">
          <h2>Purchases</h2>
          {purchasesInRange.length === 0 ? (
            <p className="print-subnote">No purchases in this range.</p>
          ) : (
            <>
              {sortedMonthKeys.map((key) => {
                const monthPurchases = (monthGroups.get(key) ?? []).slice().sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
                const monthTotal = sumBy(monthPurchases, (purchase) => purchase.amount)
                return (
                  <div className="print-month-group" key={key}>
                    <div className="print-month-head">
                      <h3>{formatMonthLabel(locale, key)}</h3>
                      <p className="print-month-total">{formatMoney(monthTotal)}</p>
                    </div>
                    <div className="print-table-wrap">
                      <table className="print-table">
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Item</th>
                            <th scope="col">Category</th>
                            <th scope="col">Status</th>
                            <th scope="col">Amount</th>
                            {config.includeNotes ? <th scope="col">Notes</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {monthPurchases.map((purchase) => (
                            <tr key={purchase._id}>
                              <td>{purchase.purchaseDate}</td>
                              <td>{purchase.item}</td>
                              <td>{purchase.category}</td>
                              <td>{purchase.reconciliationStatus ?? 'posted'}</td>
                              <td className="table-amount">{formatMoney(purchase.amount)}</td>
                              {config.includeNotes ? <td>{purchase.notes ?? ''}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
              <p className="print-subnote">
                Purchases total for range: <strong>{formatMoney(purchasesTotal)}</strong>
              </p>
            </>
          )}
        </section>
      ) : null}

      {filteredAuditLogs ? (
        <section className="print-section print-section--major">
          <h2>Audit Logs</h2>

          <h3 className="print-subhead">Monthly Cycle Runs</h3>
          {filteredAuditLogs.monthlyCycleRuns.length === 0 ? (
            <p className="print-subnote">No cycle runs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Cycle Key</th>
                    <th scope="col">Source</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.monthlyCycleRuns.map((run) => (
                    <tr key={run._id}>
                      <td>{run.cycleKey}</td>
                      <td>{run.source}</td>
                      <td>{run.status}</td>
                      <td>
                        {run.updatedCards} cards / {run.updatedLoans} loans
                      </td>
                      <td>{cycleDateLabel.format(new Date(run.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Cycle Audit Logs</h3>
          {filteredAuditLogs.cycleAuditLogs.length === 0 ? (
            <p className="print-subnote">No cycle audit logs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Cycle Key</th>
                    <th scope="col">Source</th>
                    <th scope="col">Cards</th>
                    <th scope="col">Loans</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.cycleAuditLogs.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.cycleKey}</td>
                      <td>{entry.source}</td>
                      <td>
                        {entry.updatedCards} ({entry.cardCyclesApplied} cycles)
                      </td>
                      <td>
                        {entry.updatedLoans} ({entry.loanCyclesApplied} cycles)
                      </td>
                      <td>{cycleDateLabel.format(new Date(entry.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Finance Audit Events</h3>
          {filteredAuditLogs.financeAuditEvents.length === 0 ? (
            <p className="print-subnote">No finance audit events in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Entity</th>
                    <th scope="col">Action</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.financeAuditEvents.map((event) => (
                    <tr key={event._id}>
                      <td>
                        {event.entityType} ({event.entityId})
                      </td>
                      <td>{event.action}</td>
                      <td>{cycleDateLabel.format(new Date(event.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </article>
  )
}
