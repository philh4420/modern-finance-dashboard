import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { AccountsTab } from './components/AccountsTab'
import { BillsTab } from './components/BillsTab'
import { CardsTab } from './components/CardsTab'
import { DashboardTab } from './components/DashboardTab'
import { PlanningTab } from './components/PlanningTab'
import { PrintReport } from './components/PrintReport'
import { PrintReportModal, type PrintReportConfig } from './components/PrintReportModal'
import { SettingsTab } from './components/SettingsTab'
import type { DashboardCard, TabKey } from './components/financeTypes'
import { GoalsTab } from './components/GoalsTab'
import { IncomeTab } from './components/IncomeTab'
import { LoansTab } from './components/LoansTab'
import { PwaUpdateToast } from './components/PwaUpdateToast'
import { PurchasesTab } from './components/PurchasesTab'
import { ReconcileTab } from './components/ReconcileTab'
import { useAccountsSection } from './hooks/useAccountsSection'
import { useBillsSection } from './hooks/useBillsSection'
import { useCardsSection } from './hooks/useCardsSection'
import { useFinanceFormat } from './hooks/useFinanceFormat'
import { useGoalsSection } from './hooks/useGoalsSection'
import { useIncomeSection } from './hooks/useIncomeSection'
import { useLoansSection } from './hooks/useLoansSection'
import { useMutationFeedback } from './hooks/useMutationFeedback'
import { usePlanningSection } from './hooks/usePlanningSection'
import { usePurchasesSection } from './hooks/usePurchasesSection'
import { useReconciliationSection } from './hooks/useReconciliationSection'
import { useSettingsSection } from './hooks/useSettingsSection'
import {
  billCategoryOptions,
  billScopeOptions,
  accountTypeOptions,
  cadenceOptions,
  customCadenceUnitOptions,
  dateLabel,
  defaultPreference,
  emptySummary,
  goalPriorityOptions,
  tabs,
} from './lib/financeConstants'
import { initDiagnostics, setDiagnosticsConsent } from './lib/diagnostics'
import {
  accountTypeLabel,
  cadenceLabel,
  isCustomCadence,
  priorityLabel,
  severityLabel,
} from './lib/financeHelpers'
import './App.css'

type CspMode = 'unknown' | 'none' | 'report-only' | 'enforced'

function App() {
  const { userId } = useAuth()
  const financeState = useQuery(api.finance.getFinanceData)
  const phase2MonthKey = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const phase2State = useQuery(api.phase2.getPhase2Data, { month: phase2MonthKey })
  const privacyState = useQuery(api.privacy.getPrivacyData)
  const kpisState = useQuery(api.ops.getKpis, { windowDays: 30 })
  const cleanupLegacySeedData = useMutation(api.finance.cleanupLegacySeedData)
  const runMonthlyCycle = useMutation(api.finance.runMonthlyCycle)
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const logClientOpsMetric = useMutation(api.ops.logClientOpsMetric)

  const cleanupTriggered = useRef(false)
  const monthlyCycleTriggered = useRef(false)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [isRunningMonthlyCycle, setIsRunningMonthlyCycle] = useState(false)
  const [isReconcilingPending, setIsReconcilingPending] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printConfig, setPrintConfig] = useState<PrintReportConfig | null>(null)
  const [cspMode, setCspMode] = useState<CspMode>('unknown')
  const { errorMessage, clearError, handleMutationError } = useMutationFeedback()

  useEffect(() => {
    if (!financeState?.isAuthenticated) {
      cleanupTriggered.current = false
      monthlyCycleTriggered.current = false
      return
    }

    if (!cleanupTriggered.current) {
      cleanupTriggered.current = true
      void cleanupLegacySeedData({})
    }

    if (!monthlyCycleTriggered.current) {
      monthlyCycleTriggered.current = true
      void runMonthlyCycle({ source: 'automatic' })
    }
  }, [cleanupLegacySeedData, financeState?.isAuthenticated, runMonthlyCycle])

  useEffect(() => {
    const enabled = Boolean(privacyState?.consentSettings?.diagnosticsEnabled)
    setDiagnosticsConsent(enabled)
    if (!enabled) return

    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
    if (!dsn) {
      return
    }

    initDiagnostics({ dsn, environment: import.meta.env.MODE })
  }, [privacyState?.consentSettings?.diagnosticsEnabled])

  useEffect(() => {
    if (!financeState?.isAuthenticated) {
      setCspMode('unknown')
      return
    }

    let cancelled = false

    const detect = async () => {
      try {
        const response = await fetch(`${window.location.origin}/`, { cache: 'no-store' })
        const enforced = response.headers.get('content-security-policy')
        const reportOnly = response.headers.get('content-security-policy-report-only')
        if (cancelled) return
        if (enforced) setCspMode('enforced')
        else if (reportOnly) setCspMode('report-only')
        else setCspMode('none')
      } catch {
        if (cancelled) return
        setCspMode('unknown')
      }
    }

    void detect()
    return () => {
      cancelled = true
    }
  }, [financeState?.isAuthenticated])

  const preference = financeState?.data.preference ?? defaultPreference

  const incomes = financeState?.data.incomes ?? []
  const incomePaymentChecks = financeState?.data.incomePaymentChecks ?? []
  const incomeChangeEvents = financeState?.data.incomeChangeEvents ?? []
  const bills = financeState?.data.bills ?? []
  const billPaymentChecks = financeState?.data.billPaymentChecks ?? []
  const subscriptionPriceChanges = financeState?.data.subscriptionPriceChanges ?? []
  const cards = financeState?.data.cards ?? []
  const loans = financeState?.data.loans ?? []
  const purchases = financeState?.data.purchases ?? []
  const accounts = financeState?.data.accounts ?? []
  const goals = financeState?.data.goals ?? []
  const cycleAuditLogs = financeState?.data.cycleAuditLogs ?? []
  const monthlyCycleRuns = financeState?.data.monthlyCycleRuns ?? []
  const monthCloseSnapshots = financeState?.data.monthCloseSnapshots ?? []
  const financeAuditEvents = financeState?.data.financeAuditEvents ?? []
  const ledgerEntries = financeState?.data.ledgerEntries ?? []

  const topCategories = financeState?.data.topCategories ?? []
  const upcomingCashEvents = financeState?.data.upcomingCashEvents ?? []
  const insights = financeState?.data.insights ?? []
  const summary = financeState?.data.summary ?? emptySummary
  const monthlyLoanBasePayments = summary.monthlyLoanBasePayments ?? summary.monthlyLoanPayments
  const monthlyLoanSubscriptionCosts = summary.monthlyLoanSubscriptionCosts ?? 0
  const runwayAvailablePool =
    summary.runwayAvailablePool ?? Math.max(summary.liquidReserves + summary.totalAssets + summary.monthlyIncome, 0)
  const runwayMonthlyPressure =
    summary.runwayMonthlyPressure ?? summary.monthlyCommitments + summary.totalLiabilities + summary.purchasesThisMonth

  const formatSection = useFinanceFormat({
    preference,
    clearError,
    handleMutationError,
  })

  const incomeSection = useIncomeSection({
    incomes,
    clearError,
    handleMutationError,
  })

  const billsSection = useBillsSection({
    bills,
    clearError,
    handleMutationError,
  })

  const cardsSection = useCardsSection({
    cards,
    clearError,
    handleMutationError,
  })

  const loansSection = useLoansSection({
    loans,
    clearError,
    handleMutationError,
  })

  const purchasesSection = usePurchasesSection({
    purchases,
    clearError,
    handleMutationError,
  })

  const accountsSection = useAccountsSection({
    accounts,
    clearError,
    handleMutationError,
  })

  const goalsSection = useGoalsSection({
    goals,
    clearError,
    handleMutationError,
  })

  const connectionNote =
    financeState === undefined || phase2State === undefined || privacyState === undefined || kpisState === undefined
      ? 'Connecting to Convex...'
      : 'Convex synced'

  const phase2Data =
    phase2State ?? {
      monthKey: phase2MonthKey,
      transactionRules: [],
      envelopeBudgets: [],
      incomeAllocationRules: [],
      incomeAllocationSuggestions: [],
      autoAllocationPlan: {
        monthlyIncome: 0,
        totalAllocatedPercent: 0,
        totalAllocatedAmount: 0,
        residualAmount: 0,
        unallocatedPercent: 100,
        overAllocatedPercent: 0,
        buckets: [
          { target: 'bills', label: 'Bills', percentage: 0, monthlyAmount: 0, active: false },
          { target: 'savings', label: 'Savings', percentage: 0, monthlyAmount: 0, active: false },
          { target: 'goals', label: 'Goals', percentage: 0, monthlyAmount: 0, active: false },
          { target: 'debt_overpay', label: 'Debt Overpay', percentage: 0, monthlyAmount: 0, active: false },
        ],
      },
      budgetPerformance: [],
      recurringCandidates: [],
      billRiskAlerts: [],
      forecastWindows: [],
      monthCloseChecklist: [],
      dataQuality: {
        duplicateCount: 0,
        anomalyCount: 0,
        missingCategoryCount: 0,
        pendingReconciliationCount: 0,
        splitMismatchCount: 0,
      },
    }

  const queueMetricHandler =
    privacyState?.consentSettings?.diagnosticsEnabled
      ? async (metric: {
          event: string
          queuedCount: number
          conflictCount: number
          flushAttempted: number
          flushSucceeded: number
        }) => {
          try {
            await logClientOpsMetric(metric)
          } catch {
            // Best-effort metrics.
          }
        }
      : undefined

  const reconciliationSection = useReconciliationSection({
    purchases,
    userId,
    onQueueMetric: queueMetricHandler,
    clearError,
    handleMutationError,
  })

  const planningSection = usePlanningSection({
    monthKey: phase2Data.monthKey,
    transactionRules: phase2Data.transactionRules,
    envelopeBudgets: phase2Data.envelopeBudgets,
    incomeAllocationRules: phase2Data.incomeAllocationRules,
    userId,
    onQueueMetric: queueMetricHandler,
    clearError,
    handleMutationError,
  })

  const settingsSection = useSettingsSection({
    clearError,
    handleMutationError,
  })

  const lastUpdated = new Intl.DateTimeFormat(preference.locale || 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(financeState?.updatedAt ? new Date(financeState.updatedAt) : new Date())

  const cycleDateLabel = new Intl.DateTimeFormat(preference.locale || 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const dashboardCards: DashboardCard[] = [
    {
      id: 'health-score',
      label: 'Financial Health Score',
      value: `${summary.healthScore}/100`,
      note: 'Risk + runway + savings + utilization',
      trend: summary.healthScore >= 70 ? 'up' : summary.healthScore >= 45 ? 'flat' : 'down',
    },
    {
      id: 'monthly-income',
      label: 'Monthly Income',
      value: formatSection.formatMoney(summary.monthlyIncome),
      note: `${incomes.length} sources tracked`,
      trend: 'up',
    },
    {
      id: 'monthly-commitments',
      label: 'Monthly Commitments',
      value: formatSection.formatMoney(summary.monthlyCommitments),
      note: `${formatSection.formatMoney(summary.monthlyBills)} bills • ${formatSection.formatMoney(summary.monthlyCardSpend)} card payments • ${formatSection.formatMoney(summary.monthlyLoanPayments)} loans`,
      trend: 'down',
    },
    {
      id: 'loan-balance',
      label: 'Loan Balance',
      value: formatSection.formatMoney(summary.totalLoanBalance),
      note: `${formatSection.formatMoney(monthlyLoanBasePayments)} payments + ${formatSection.formatMoney(monthlyLoanSubscriptionCosts)} subscription`,
      trend: summary.totalLoanBalance > 0 ? 'down' : 'flat',
    },
    {
      id: 'projected-net',
      label: 'Projected Monthly Net',
      value: formatSection.formatMoney(summary.projectedMonthlyNet),
      note: `${formatSection.formatMoney(summary.monthlyIncome)} income - ${formatSection.formatMoney(summary.monthlyCommitments)} commitments - ${formatSection.formatMoney(summary.totalLoanBalance)} loan balance`,
      trend: summary.projectedMonthlyNet >= 0 ? 'up' : 'down',
    },
    {
      id: 'net-worth',
      label: 'Net Worth',
      value: formatSection.formatMoney(summary.netWorth),
      note: `${formatSection.formatMoney(summary.totalAssets)} assets + ${formatSection.formatMoney(summary.monthlyIncome)} income - ${formatSection.formatMoney(summary.totalLiabilities)} liabilities - ${formatSection.formatMoney(summary.monthlyCommitments)} commitments - ${formatSection.formatMoney(summary.purchasesThisMonth)} purchases`,
      trend: summary.netWorth >= 0 ? 'up' : 'down',
    },
    {
      id: 'runway',
      label: 'Cash Runway',
      value: `${summary.runwayMonths.toFixed(1)} months`,
      note: `${formatSection.formatMoney(runwayAvailablePool)} available pool / ${formatSection.formatMoney(runwayMonthlyPressure)} monthly pressure`,
      trend: summary.runwayMonths >= 3 ? 'up' : summary.runwayMonths >= 1 ? 'flat' : 'down',
    },
  ]

  const downloadSnapshot = () => {
    clearError()

    const payload = {
      generatedAt: new Date().toISOString(),
      preference,
      summary,
      records: {
        incomes,
        incomePaymentChecks,
        bills,
        billPaymentChecks,
        cards,
        loans,
        purchases,
        accounts,
        goals,
        cycleAuditLogs,
        monthlyCycleRuns,
        monthCloseSnapshots,
        financeAuditEvents,
        ledgerEntries,
      },
      insights,
      topCategories,
      upcomingCashEvents,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `finance-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const runMonthlyCycleNow = async () => {
    clearError()
    setIsRunningMonthlyCycle(true)
    try {
      await runMonthlyCycle({ source: 'manual' })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsRunningMonthlyCycle(false)
    }
  }

  const reconcilePendingPurchasesNow = async () => {
    const pendingPurchaseIds = purchases
      .filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending')
      .map((purchase) => purchase._id)
    if (pendingPurchaseIds.length === 0) return
    clearError()
    setIsReconcilingPending(true)
    try {
      await bulkUpdatePurchaseReconciliation({
        ids: pendingPurchaseIds,
        reconciliationStatus: 'reconciled',
      })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsReconcilingPending(false)
    }
  }

  const startPrint = (config: PrintReportConfig) => {
    clearError()
    setPrintModalOpen(false)
    setPrintConfig(config)
  }

  useEffect(() => {
    if (!printConfig) return

    const onAfterPrint = () => {
      setPrintConfig(null)
    }

    window.addEventListener('afterprint', onAfterPrint)

    const timeout = window.setTimeout(() => {
      window.print()
    }, 250)

    return () => {
      window.removeEventListener('afterprint', onAfterPrint)
      window.clearTimeout(timeout)
    }
  }, [printConfig])

  return (
    <main className="dashboard">
      <div className="no-print">
      <header className="topbar">
        <div>
          <p className="eyebrow">Personal Finance Workspace 2026+</p>
          <h1>Adaptive Finance OS</h1>
          <p className="topbar-note">
            Last updated {lastUpdated} - {connectionNote}
          </p>
        </div>
        <div className="topbar-actions">
          <SignedOut>
            <SignInButton mode="modal">
              <button type="button" className="btn btn-secondary">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="btn btn-primary">
                Sign Up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <button type="button" className="btn btn-secondary" onClick={() => setPrintModalOpen(true)}>
              Print Report...
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void runMonthlyCycleNow()}
              disabled={isRunningMonthlyCycle}
            >
              {isRunningMonthlyCycle ? 'Running Cycle...' : 'Run Monthly Cycle Now'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={downloadSnapshot}>
              Export Snapshot
            </button>
            <div className="user-menu">
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </header>

      <SignedOut>
        <section className="auth-panel" aria-label="Authentication required">
          <h2>Sign in to enable your 2026-ready finance stack</h2>
          <p>
            Track income, bills, cards, purchases, accounts, and goals in one workspace. The dashboard updates in
            realtime from your own entries.
          </p>
          <div className="auth-actions">
            <SignInButton mode="modal">
              <button type="button" className="btn btn-secondary">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="btn btn-primary">
                Create Account
              </button>
            </SignUpButton>
          </div>
        </section>
      </SignedOut>

      <SignedIn>
        <section className="panel format-panel" aria-label="Currency and locale settings">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Formatting</p>
              <h2>Currency + Locale</h2>
            </div>
          </header>
          <div className="format-controls">
            <label htmlFor="currency-select" className="sr-only">
              Currency
            </label>
            <select
              id="currency-select"
              value={formatSection.displayedFormat.currency}
              onChange={(event) =>
                formatSection.setFormatOverride((prev) => ({
                  ...prev,
                  currency: event.target.value,
                }))
              }
            >
              {formatSection.currencyOptions.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>

            <label htmlFor="locale-select" className="sr-only">
              Locale
            </label>
            <select
              id="locale-select"
              value={formatSection.displayedFormat.locale}
              onChange={(event) =>
                formatSection.setFormatOverride((prev) => ({
                  ...prev,
                  locale: event.target.value,
                }))
              }
            >
              {formatSection.localeOptions.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>

            <button type="button" className="btn btn-secondary" onClick={() => void formatSection.onSaveFormat()}>
              Apply Format
            </button>
          </div>
        </section>

        <nav className="section-tabs" aria-label="Finance sections">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-btn ${activeTab === tab.key ? 'tab-btn--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

        {activeTab === 'dashboard' ? (
          <DashboardTab
            dashboardCards={dashboardCards}
            cards={cards}
            accounts={accounts}
            summary={summary}
            insights={insights}
            upcomingCashEvents={upcomingCashEvents}
            topCategories={topCategories}
            goalsWithMetrics={goalsSection.goalsWithMetrics}
            cycleAuditLogs={cycleAuditLogs}
            monthlyCycleRuns={monthlyCycleRuns}
            monthCloseSnapshots={monthCloseSnapshots}
            financeAuditEvents={financeAuditEvents}
            ledgerEntries={ledgerEntries}
            forecastWindows={phase2Data.forecastWindows}
	            counts={{
	              incomes: incomes.length,
	              bills: bills.length,
	              cards: cards.length,
	              loans: loans.length,
	              purchases: purchases.length,
	              accounts: accounts.length,
	              goals: goals.length,
	            }}
	            kpis={kpisState ?? null}
	            privacyData={privacyState ?? null}
	            retentionEnabled={settingsSection.retentionPolicies.some((policy) => policy.enabled && policy.retentionDays > 0)}
	            cspMode={cspMode}
	            formatMoney={formatSection.formatMoney}
	            formatPercent={formatSection.formatPercent}
	            cadenceLabel={cadenceLabel}
	            severityLabel={severityLabel}
	            dateLabel={dateLabel}
            cycleDateLabel={cycleDateLabel}
            onActionQueueRecordPayment={cardsSection.onQuickRecordPayment}
            onActionQueueAddCharge={async (cardId, amount) => cardsSection.onQuickAddCharge(cardId, amount)}
            onActionQueueRunMonthlyCycle={runMonthlyCycleNow}
            onActionQueueReconcilePending={reconcilePendingPurchasesNow}
            isRunningMonthlyCycle={isRunningMonthlyCycle}
            isReconcilingPending={isReconcilingPending}
            pendingReconciliationCount={summary.pendingPurchases}
          />
        ) : null}

	        {activeTab === 'income' ? (
	          <IncomeTab
	            incomes={incomes}
              accounts={accounts}
              incomePaymentChecks={incomePaymentChecks}
              incomeChangeEvents={incomeChangeEvents}
	            monthlyIncome={summary.monthlyIncome}
	            incomeForm={incomeSection.incomeForm}
	            setIncomeForm={incomeSection.setIncomeForm}
	            incomeEditId={incomeSection.incomeEditId}
	            setIncomeEditId={incomeSection.setIncomeEditId}
            incomeEditDraft={incomeSection.incomeEditDraft}
            setIncomeEditDraft={incomeSection.setIncomeEditDraft}
            onAddIncome={incomeSection.onAddIncome}
	            onDeleteIncome={incomeSection.onDeleteIncome}
            onAddIncomeChangeEvent={incomeSection.onAddIncomeChangeEvent}
            onDeleteIncomeChangeEvent={incomeSection.onDeleteIncomeChangeEvent}
            saveIncomeEdit={incomeSection.saveIncomeEdit}
            startIncomeEdit={incomeSection.startIncomeEdit}
            onUpsertIncomePaymentCheck={incomeSection.onUpsertIncomePaymentCheck}
            onBulkUpsertIncomePaymentChecks={incomeSection.onBulkUpsertIncomePaymentChecks}
            onDeleteIncomePaymentCheck={incomeSection.onDeleteIncomePaymentCheck}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

	        {activeTab === 'bills' ? (
	          <BillsTab
            accounts={accounts}
	            bills={bills}
            billPaymentChecks={billPaymentChecks}
            subscriptionPriceChanges={subscriptionPriceChanges}
	            monthlyBills={summary.monthlyBills}
	            billForm={billsSection.billForm}
	            setBillForm={billsSection.setBillForm}
	            billEditId={billsSection.billEditId}
	            setBillEditId={billsSection.setBillEditId}
            billEditDraft={billsSection.billEditDraft}
            setBillEditDraft={billsSection.setBillEditDraft}
            onAddBill={billsSection.onAddBill}
            onDeleteBill={billsSection.onDeleteBill}
            onUpsertBillPaymentCheck={billsSection.onUpsertBillPaymentCheck}
            onDeleteBillPaymentCheck={billsSection.onDeleteBillPaymentCheck}
            onResolveBillDuplicateOverlap={billsSection.onResolveBillDuplicateOverlap}
            onRunBillsMonthlyBulkAction={billsSection.onRunBillsMonthlyBulkAction}
            saveBillEdit={billsSection.saveBillEdit}
            startBillEdit={billsSection.startBillEdit}
            billCategoryOptions={billCategoryOptions}
            billScopeOptions={billScopeOptions}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

	        {activeTab === 'cards' ? (
	          <CardsTab
	            cards={cards}
	            monthlyCardSpend={summary.monthlyCardSpend}
	            cardLimitTotal={summary.cardLimitTotal}
	            cardUsedTotal={summary.cardUsedTotal}
	            cardUtilizationPercent={summary.cardUtilizationPercent}
	            cardForm={cardsSection.cardForm}
	            setCardForm={cardsSection.setCardForm}
	            cardEditId={cardsSection.cardEditId}
	            setCardEditId={cardsSection.setCardEditId}
	            cardEditDraft={cardsSection.cardEditDraft}
	            setCardEditDraft={cardsSection.setCardEditDraft}
	            onAddCard={cardsSection.onAddCard}
	            onDeleteCard={cardsSection.onDeleteCard}
	            saveCardEdit={cardsSection.saveCardEdit}
	            startCardEdit={cardsSection.startCardEdit}
	            onQuickAddCharge={cardsSection.onQuickAddCharge}
	            onQuickRecordPayment={cardsSection.onQuickRecordPayment}
	            onQuickTransferBalance={cardsSection.onQuickTransferBalance}
	            formatMoney={formatSection.formatMoney}
	            formatPercent={formatSection.formatPercent}
	          />
	        ) : null}

	        {activeTab === 'loans' ? (
	          <LoansTab
	            loans={loans}
	            monthlyLoanPayments={summary.monthlyLoanPayments}
	            monthlyLoanBasePayments={summary.monthlyLoanBasePayments}
	            monthlyLoanSubscriptionCosts={summary.monthlyLoanSubscriptionCosts}
	            totalLoanBalance={summary.totalLoanBalance}
	            loanForm={loansSection.loanForm}
	            setLoanForm={loansSection.setLoanForm}
	            loanEditId={loansSection.loanEditId}
	            setLoanEditId={loansSection.setLoanEditId}
            loanEditDraft={loansSection.loanEditDraft}
            setLoanEditDraft={loansSection.setLoanEditDraft}
            onAddLoan={loansSection.onAddLoan}
            onDeleteLoan={loansSection.onDeleteLoan}
            saveLoanEdit={loansSection.saveLoanEdit}
            startLoanEdit={loansSection.startLoanEdit}
            onQuickAddLoanCharge={loansSection.onQuickAddLoanCharge}
            onQuickRecordLoanPayment={loansSection.onQuickRecordLoanPayment}
            onQuickApplyLoanInterest={loansSection.onQuickApplyLoanInterest}
            onQuickApplyLoanSubscription={loansSection.onQuickApplyLoanSubscription}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'purchases' ? (
	          <PurchasesTab
	            purchaseForm={purchasesSection.purchaseForm}
	            setPurchaseForm={purchasesSection.setPurchaseForm}
	            purchaseFilter={purchasesSection.purchaseFilter}
	            setPurchaseFilter={purchasesSection.setPurchaseFilter}
	            purchaseCategories={purchasesSection.purchaseCategories}
	            filteredPurchases={purchasesSection.filteredPurchases}
	            filteredPurchaseTotal={purchasesSection.filteredPurchaseTotal}
	            filteredPurchaseAverage={purchasesSection.filteredPurchaseAverage}
	            purchasesThisMonth={summary.purchasesThisMonth}
	            pendingPurchases={summary.pendingPurchases}
	            postedPurchases={summary.postedPurchases}
	            reconciledPurchases={summary.reconciledPurchases}
	            purchaseEditId={purchasesSection.purchaseEditId}
	            setPurchaseEditId={purchasesSection.setPurchaseEditId}
	            purchaseEditDraft={purchasesSection.purchaseEditDraft}
	            setPurchaseEditDraft={purchasesSection.setPurchaseEditDraft}
	            onAddPurchase={purchasesSection.onAddPurchase}
            onDeletePurchase={purchasesSection.onDeletePurchase}
            savePurchaseEdit={purchasesSection.savePurchaseEdit}
            startPurchaseEdit={purchasesSection.startPurchaseEdit}
            onSetPurchaseReconciliation={purchasesSection.onSetPurchaseReconciliation}
            formatMoney={formatSection.formatMoney}
            dateLabel={dateLabel}
          />
        ) : null}

        {activeTab === 'reconcile' ? (
          <ReconcileTab
            filter={reconciliationSection.filter}
            setFilter={reconciliationSection.setFilter}
            categories={reconciliationSection.categories}
            filteredPurchases={reconciliationSection.filteredPurchases}
            selectedSet={reconciliationSection.selectedSet}
            selectedCount={reconciliationSection.selectedCount}
            selectedTotal={reconciliationSection.selectedTotal}
            toggleSelected={reconciliationSection.toggleSelected}
            toggleSelectVisible={reconciliationSection.toggleSelectVisible}
            clearSelection={reconciliationSection.clearSelection}
            bulkCategory={reconciliationSection.bulkCategory}
            setBulkCategory={reconciliationSection.setBulkCategory}
            runBulkStatus={reconciliationSection.runBulkStatus}
            runBulkCategory={reconciliationSection.runBulkCategory}
            runBulkDelete={reconciliationSection.runBulkDelete}
            queue={reconciliationSection.queue}
            formatMoney={formatSection.formatMoney}
            dateLabel={dateLabel}
          />
        ) : null}

        {activeTab === 'planning' ? (
          <PlanningTab
            monthKey={phase2Data.monthKey}
            summary={summary}
            ruleForm={planningSection.ruleForm}
            setRuleForm={planningSection.setRuleForm}
            ruleEditId={planningSection.ruleEditId}
            setRuleEditId={planningSection.setRuleEditId}
            sortedRules={planningSection.sortedRules}
            submitRule={planningSection.submitRule}
            startRuleEdit={planningSection.startRuleEdit}
            removeRule={planningSection.removeRule}
            budgetForm={planningSection.budgetForm}
            setBudgetForm={planningSection.setBudgetForm}
            budgetEditId={planningSection.budgetEditId}
            setBudgetEditId={planningSection.setBudgetEditId}
            sortedBudgets={planningSection.sortedBudgets}
            submitBudget={planningSection.submitBudget}
            startBudgetEdit={planningSection.startBudgetEdit}
            removeBudget={planningSection.removeBudget}
            allocationRuleForm={planningSection.allocationRuleForm}
            setAllocationRuleForm={planningSection.setAllocationRuleForm}
            allocationRuleEditId={planningSection.allocationRuleEditId}
            setAllocationRuleEditId={planningSection.setAllocationRuleEditId}
            sortedIncomeAllocationRules={planningSection.sortedIncomeAllocationRules}
            submitAllocationRule={planningSection.submitAllocationRule}
            startAllocationRuleEdit={planningSection.startAllocationRuleEdit}
            removeAllocationRule={planningSection.removeAllocationRule}
            incomeAllocationSuggestions={phase2Data.incomeAllocationSuggestions}
            isApplyingAutoAllocation={planningSection.isApplyingAutoAllocation}
            autoAllocationLastRunNote={planningSection.autoAllocationLastRunNote}
            onApplyAutoAllocationNow={planningSection.onApplyAutoAllocationNow}
            whatIfInput={planningSection.whatIfInput}
            setWhatIfInput={planningSection.setWhatIfInput}
            autoAllocationPlan={phase2Data.autoAllocationPlan}
            budgetPerformance={phase2Data.budgetPerformance}
            recurringCandidates={phase2Data.recurringCandidates}
            billRiskAlerts={phase2Data.billRiskAlerts}
            forecastWindows={phase2Data.forecastWindows}
            monthCloseChecklist={phase2Data.monthCloseChecklist}
            dataQuality={phase2Data.dataQuality}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'accounts' ? (
          <AccountsTab
            accounts={accounts}
            accountForm={accountsSection.accountForm}
            setAccountForm={accountsSection.setAccountForm}
            accountEditId={accountsSection.accountEditId}
            setAccountEditId={accountsSection.setAccountEditId}
            accountEditDraft={accountsSection.accountEditDraft}
            setAccountEditDraft={accountsSection.setAccountEditDraft}
            onAddAccount={accountsSection.onAddAccount}
            onDeleteAccount={accountsSection.onDeleteAccount}
            saveAccountEdit={accountsSection.saveAccountEdit}
            startAccountEdit={accountsSection.startAccountEdit}
            accountTypeOptions={accountTypeOptions}
            accountTypeLabel={accountTypeLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'goals' ? (
          <GoalsTab
            goalsWithMetrics={goalsSection.goalsWithMetrics}
            goalForm={goalsSection.goalForm}
            setGoalForm={goalsSection.setGoalForm}
            goalEditId={goalsSection.goalEditId}
            setGoalEditId={goalsSection.setGoalEditId}
            goalEditDraft={goalsSection.goalEditDraft}
            setGoalEditDraft={goalsSection.setGoalEditDraft}
            onAddGoal={goalsSection.onAddGoal}
            onDeleteGoal={goalsSection.onDeleteGoal}
            saveGoalEdit={goalsSection.saveGoalEdit}
            startGoalEdit={goalsSection.startGoalEdit}
            goalPriorityOptions={goalPriorityOptions}
            priorityLabel={priorityLabel}
            formatMoney={formatSection.formatMoney}
            formatPercent={formatSection.formatPercent}
            dateLabel={dateLabel}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsTab
            consentSettings={
              settingsSection.privacyData?.consentSettings ?? {
                diagnosticsEnabled: false,
                analyticsEnabled: false,
                updatedAt: 0,
              }
            }
            consentLogs={settingsSection.privacyData?.consentLogs ?? []}
            latestExport={settingsSection.privacyData?.latestExport ?? null}
            latestDeletionJob={settingsSection.privacyData?.latestDeletionJob ?? null}
            retentionPolicies={settingsSection.retentionPolicies}
            isExporting={settingsSection.isExporting}
            onGenerateExport={settingsSection.onGenerateExport}
            onDownloadLatestExport={settingsSection.onDownloadLatestExport}
            deleteConfirmText={settingsSection.deleteConfirmText}
            setDeleteConfirmText={settingsSection.setDeleteConfirmText}
            isDeleting={settingsSection.isDeleting}
            onRequestDeletion={settingsSection.onRequestDeletion}
            isApplyingRetention={settingsSection.isApplyingRetention}
            onRunRetentionNow={settingsSection.onRunRetentionNow}
            onToggleConsent={settingsSection.onToggleConsent}
            onUpsertRetention={settingsSection.onUpsertRetention}
            cycleDateLabel={cycleDateLabel}
          />
        ) : null}

        {printModalOpen ? (
          <PrintReportModal
            open
            onClose={() => setPrintModalOpen(false)}
            onStartPrint={startPrint}
            locale={preference.locale}
          />
        ) : null}
      </SignedIn>
	      <PwaUpdateToast />
      </div>

      <SignedIn>
        {printConfig ? (
          <div className="print-only">
            <PrintReport
              config={printConfig}
              preference={preference}
              summary={summary}
              kpis={kpisState ?? null}
              monthCloseSnapshots={monthCloseSnapshots}
              incomes={incomes}
              incomePaymentChecks={incomePaymentChecks}
              incomeChangeEvents={incomeChangeEvents}
              bills={bills}
              cards={cards}
              loans={loans}
              accounts={accounts}
              goals={goals}
              purchases={purchases}
              cycleAuditLogs={cycleAuditLogs}
              monthlyCycleRuns={monthlyCycleRuns}
              financeAuditEvents={financeAuditEvents}
              formatMoney={formatSection.formatMoney}
              cycleDateLabel={cycleDateLabel}
            />
          </div>
        ) : null}
      </SignedIn>
	    </main>
	  )
	}

export default App
