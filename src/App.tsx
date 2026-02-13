import { useEffect, useRef, useState } from 'react'
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
import type { DashboardCard, TabKey } from './components/financeTypes'
import { GoalsTab } from './components/GoalsTab'
import { IncomeTab } from './components/IncomeTab'
import { LoansTab } from './components/LoansTab'
import { PurchasesTab } from './components/PurchasesTab'
import { useAccountsSection } from './hooks/useAccountsSection'
import { useBillsSection } from './hooks/useBillsSection'
import { useCardsSection } from './hooks/useCardsSection'
import { useFinanceFormat } from './hooks/useFinanceFormat'
import { useGoalsSection } from './hooks/useGoalsSection'
import { useIncomeSection } from './hooks/useIncomeSection'
import { useLoansSection } from './hooks/useLoansSection'
import { useMutationFeedback } from './hooks/useMutationFeedback'
import { usePurchasesSection } from './hooks/usePurchasesSection'
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
  const cleanupLegacySeedData = useMutation(api.finance.cleanupLegacySeedData)

  const cleanupTriggered = useRef(false)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const { errorMessage, clearError, handleMutationError } = useMutationFeedback()

  useEffect(() => {
    if (financeState?.isAuthenticated && !cleanupTriggered.current) {
      cleanupTriggered.current = true
      void cleanupLegacySeedData({})
    }
  }, [cleanupLegacySeedData, financeState?.isAuthenticated])

  const preference = financeState?.data.preference ?? defaultPreference

  const incomes = financeState?.data.incomes ?? []
  const bills = financeState?.data.bills ?? []
  const cards = financeState?.data.cards ?? []
  const loans = financeState?.data.loans ?? []
  const purchases = financeState?.data.purchases ?? []
  const accounts = financeState?.data.accounts ?? []
  const goals = financeState?.data.goals ?? []

  const topCategories = financeState?.data.topCategories ?? []
  const upcomingCashEvents = financeState?.data.upcomingCashEvents ?? []
  const insights = financeState?.data.insights ?? []
  const summary = financeState?.data.summary ?? emptySummary

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

  const connectionNote = financeState === undefined ? 'Connecting to Convex...' : 'Convex synced'

  const lastUpdated = new Intl.DateTimeFormat(preference.locale || 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(financeState?.updatedAt ? new Date(financeState.updatedAt) : new Date())

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
      note: `${formatSection.formatMoney(summary.monthlyBills)} bills • ${formatSection.formatMoney(summary.monthlyCardSpend)} cards • ${formatSection.formatMoney(summary.monthlyLoanPayments)} loans`,
      trend: 'down',
    },
    {
      id: 'loan-balance',
      label: 'Loan Balance',
      value: formatSection.formatMoney(summary.totalLoanBalance),
      note: `${formatSection.formatMoney(summary.monthlyLoanPayments)} in monthly loan obligations`,
      trend: summary.totalLoanBalance > 0 ? 'down' : 'flat',
    },
    {
      id: 'projected-net',
      label: 'Projected Monthly Net',
      value: formatSection.formatMoney(summary.projectedMonthlyNet),
      note: formatSection.formatPercent(summary.savingsRatePercent / 100),
      trend: summary.projectedMonthlyNet >= 0 ? 'up' : 'down',
    },
    {
      id: 'net-worth',
      label: 'Net Worth',
      value: formatSection.formatMoney(summary.netWorth),
      note: `${formatSection.formatMoney(summary.totalAssets)} assets / ${formatSection.formatMoney(summary.totalLiabilities)} liabilities`,
      trend: summary.netWorth >= 0 ? 'up' : 'down',
    },
    {
      id: 'runway',
      label: 'Cash Runway',
      value: `${summary.runwayMonths.toFixed(1)} months`,
      note: `${formatSection.formatMoney(summary.liquidReserves)} liquid reserves`,
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
            formatMoney={formatSection.formatMoney}
            dateLabel={dateLabel}
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
    </main>
  )
}

export default App
