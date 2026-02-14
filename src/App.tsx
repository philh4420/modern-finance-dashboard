import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { AccountsTab } from './components/AccountsTab'
import { BillsTab } from './components/BillsTab'
import { CardsTab } from './components/CardsTab'
import { DashboardTab } from './components/DashboardTab'
import { PlanningTab } from './components/PlanningTab'
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
import {
  accountTypeOptions,
  cadenceOptions,
  customCadenceUnitOptions,
  dateLabel,
  defaultPreference,
  emptySummary,
  goalPriorityOptions,
  tabs,
} from './lib/financeConstants'
import {
  accountTypeLabel,
  cadenceLabel,
  isCustomCadence,
  priorityLabel,
  severityLabel,
} from './lib/financeHelpers'
import './App.css'

function App() {
  const financeState = useQuery(api.finance.getFinanceData)
  const phase2MonthKey = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const phase2State = useQuery(api.phase2.getPhase2Data, { month: phase2MonthKey })
  const cleanupLegacySeedData = useMutation(api.finance.cleanupLegacySeedData)
  const runMonthlyCycle = useMutation(api.finance.runMonthlyCycle)

  const cleanupTriggered = useRef(false)
  const monthlyCycleTriggered = useRef(false)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [isRunningMonthlyCycle, setIsRunningMonthlyCycle] = useState(false)
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

  const preference = financeState?.data.preference ?? defaultPreference

  const incomes = financeState?.data.incomes ?? []
  const bills = financeState?.data.bills ?? []
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

  const connectionNote = financeState === undefined || phase2State === undefined ? 'Connecting to Convex...' : 'Convex synced'

  const phase2Data =
    phase2State ?? {
      monthKey: phase2MonthKey,
      transactionRules: [],
      envelopeBudgets: [],
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

  const reconciliationSection = useReconciliationSection({
    purchases,
    clearError,
    handleMutationError,
  })

  const planningSection = usePlanningSection({
    monthKey: phase2Data.monthKey,
    transactionRules: phase2Data.transactionRules,
    envelopeBudgets: phase2Data.envelopeBudgets,
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
        bills,
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

  return (
    <main className="dashboard">
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
            counts={{
              incomes: incomes.length,
              bills: bills.length,
              cards: cards.length,
              loans: loans.length,
              purchases: purchases.length,
              accounts: accounts.length,
              goals: goals.length,
            }}
            formatMoney={formatSection.formatMoney}
            formatPercent={formatSection.formatPercent}
            cadenceLabel={cadenceLabel}
            severityLabel={severityLabel}
            dateLabel={dateLabel}
            cycleDateLabel={cycleDateLabel}
          />
        ) : null}

        {activeTab === 'income' ? (
          <IncomeTab
            incomes={incomes}
            incomeForm={incomeSection.incomeForm}
            setIncomeForm={incomeSection.setIncomeForm}
            incomeEditId={incomeSection.incomeEditId}
            setIncomeEditId={incomeSection.setIncomeEditId}
            incomeEditDraft={incomeSection.incomeEditDraft}
            setIncomeEditDraft={incomeSection.setIncomeEditDraft}
            onAddIncome={incomeSection.onAddIncome}
            onDeleteIncome={incomeSection.onDeleteIncome}
            saveIncomeEdit={incomeSection.saveIncomeEdit}
            startIncomeEdit={incomeSection.startIncomeEdit}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'bills' ? (
          <BillsTab
            bills={bills}
            billForm={billsSection.billForm}
            setBillForm={billsSection.setBillForm}
            billEditId={billsSection.billEditId}
            setBillEditId={billsSection.setBillEditId}
            billEditDraft={billsSection.billEditDraft}
            setBillEditDraft={billsSection.setBillEditDraft}
            onAddBill={billsSection.onAddBill}
            onDeleteBill={billsSection.onDeleteBill}
            saveBillEdit={billsSection.saveBillEdit}
            startBillEdit={billsSection.startBillEdit}
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
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'loans' ? (
          <LoansTab
            loans={loans}
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
            whatIfInput={planningSection.whatIfInput}
            setWhatIfInput={planningSection.setWhatIfInput}
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
      </SignedIn>
      <PwaUpdateToast />
    </main>
  )
}

export default App
