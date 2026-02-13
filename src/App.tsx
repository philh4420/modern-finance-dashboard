import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../convex/_generated/dataModel'
import { api } from '../convex/_generated/api'
import './App.css'

type TabKey = 'dashboard' | 'income' | 'bills' | 'cards' | 'purchases' | 'accounts' | 'goals'

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time'
type AccountType = 'checking' | 'savings' | 'investment' | 'cash' | 'debt'
type GoalPriority = 'low' | 'medium' | 'high'
type InsightSeverity = 'good' | 'warning' | 'critical'

type Summary = {
  monthlyIncome: number
  monthlyBills: number
  monthlyCardSpend: number
  monthlyCommitments: number
  cardLimitTotal: number
  cardUsedTotal: number
  cardUtilizationPercent: number
  purchasesThisMonth: number
  projectedMonthlyNet: number
  savingsRatePercent: number
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  liquidReserves: number
  runwayMonths: number
  healthScore: number
  goalsFundedPercent: number
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'income', label: 'Income' },
  { key: 'bills', label: 'Bills' },
  { key: 'cards', label: 'Cards' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'goals', label: 'Goals' },
]

const cadenceOptions: Array<{ value: Cadence; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One Time' },
]

const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'debt', label: 'Debt' },
]

const goalPriorityOptions: Array<{ value: GoalPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const emptySummary: Summary = {
  monthlyIncome: 0,
  monthlyBills: 0,
  monthlyCardSpend: 0,
  monthlyCommitments: 0,
  cardLimitTotal: 0,
  cardUsedTotal: 0,
  cardUtilizationPercent: 0,
  purchasesThisMonth: 0,
  projectedMonthlyNet: 0,
  savingsRatePercent: 0,
  totalAssets: 0,
  totalLiabilities: 0,
  netWorth: 0,
  liquidReserves: 0,
  runwayMonths: 0,
  healthScore: 0,
  goalsFundedPercent: 0,
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const dateLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const monthLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
})

const cadenceLabel = (cadence: Cadence) => cadenceOptions.find((option) => option.value === cadence)?.label ?? cadence

const accountTypeLabel = (value: AccountType) =>
  accountTypeOptions.find((option) => option.value === value)?.label ?? value

const priorityLabel = (priority: GoalPriority) =>
  goalPriorityOptions.find((option) => option.value === priority)?.label ?? priority

const severityLabel = (severity: InsightSeverity) => {
  if (severity === 'critical') return 'Critical'
  if (severity === 'warning') return 'Watch'
  return 'Good'
}

const parseFloatInput = (value: string, label: string) => {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return parsed
}

const parseIntInput = (value: string, label: string) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return parsed
}

const toIsoToday = () => new Date().toISOString().slice(0, 10)

const daysUntilDate = (dateString: string) => {
  const target = new Date(`${dateString}T00:00:00`)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const end = target.getTime()
  return Math.round((end - start) / 86400000)
}

function App() {
  const financeState = useQuery(api.finance.getFinanceData)

  const addIncome = useMutation(api.finance.addIncome)
  const removeIncome = useMutation(api.finance.removeIncome)

  const addBill = useMutation(api.finance.addBill)
  const removeBill = useMutation(api.finance.removeBill)

  const addCard = useMutation(api.finance.addCard)
  const removeCard = useMutation(api.finance.removeCard)

  const addPurchase = useMutation(api.finance.addPurchase)
  const removePurchase = useMutation(api.finance.removePurchase)

  const addAccount = useMutation(api.finance.addAccount)
  const removeAccount = useMutation(api.finance.removeAccount)

  const addGoal = useMutation(api.finance.addGoal)
  const updateGoalProgress = useMutation(api.finance.updateGoalProgress)
  const removeGoal = useMutation(api.finance.removeGoal)

  const cleanupLegacySeedData = useMutation(api.finance.cleanupLegacySeedData)

  const cleanupTriggered = useRef(false)

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [errorMessage, setErrorMessage] = useState('')

  const [incomeForm, setIncomeForm] = useState({
    source: '',
    amount: '',
    cadence: 'monthly' as Cadence,
    receivedDay: '',
    notes: '',
  })

  const [billForm, setBillForm] = useState({
    name: '',
    amount: '',
    dueDay: '',
    cadence: 'monthly' as Cadence,
    autopay: true,
    notes: '',
  })

  const [cardForm, setCardForm] = useState({
    name: '',
    creditLimit: '',
    usedLimit: '',
    minimumPayment: '',
    spendPerMonth: '',
  })

  const [purchaseForm, setPurchaseForm] = useState({
    item: '',
    amount: '',
    category: '',
    purchaseDate: toIsoToday(),
    notes: '',
  })

  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'checking' as AccountType,
    balance: '',
    liquid: true,
  })

  const [goalForm, setGoalForm] = useState({
    title: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    priority: 'medium' as GoalPriority,
  })

  const [purchaseFilter, setPurchaseFilter] = useState({
    query: '',
    category: 'all',
    month: new Date().toISOString().slice(0, 7),
  })

  const [goalProgressDrafts, setGoalProgressDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (financeState?.isAuthenticated && !cleanupTriggered.current) {
      cleanupTriggered.current = true
      void cleanupLegacySeedData({})
    }
  }, [cleanupLegacySeedData, financeState?.isAuthenticated])

  const incomeEntries = financeState?.data.incomes
  const billEntries = financeState?.data.bills
  const cardEntries = financeState?.data.cards
  const purchaseEntries = financeState?.data.purchases
  const accountEntries = financeState?.data.accounts
  const goalEntries = financeState?.data.goals

  const incomes = incomeEntries ?? []
  const bills = billEntries ?? []
  const cards = cardEntries ?? []
  const purchases = purchaseEntries ?? []
  const accounts = accountEntries ?? []
  const goals = goalEntries ?? []

  const topCategories = financeState?.data.topCategories ?? []
  const upcomingCashEvents = financeState?.data.upcomingCashEvents ?? []
  const insights = financeState?.data.insights ?? []
  const summary = financeState?.data.summary ?? emptySummary

  const connectionNote = financeState === undefined ? 'Connecting to Convex...' : 'Convex synced'

  const lastUpdated = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(financeState?.updatedAt ? new Date(financeState.updatedAt) : new Date())

  const purchaseCategories = useMemo(() => {
    const source = purchaseEntries ?? []
    return Array.from(new Set(source.map((entry) => entry.category))).sort((a, b) => a.localeCompare(b))
  }, [purchaseEntries])

  const filteredPurchases = useMemo(() => {
    const search = purchaseFilter.query.trim().toLowerCase()

    const source = purchaseEntries ?? []

    return source.filter((entry) => {
      const matchesQuery =
        search.length === 0 ||
        entry.item.toLowerCase().includes(search) ||
        entry.category.toLowerCase().includes(search) ||
        (entry.notes ?? '').toLowerCase().includes(search)

      const matchesCategory = purchaseFilter.category === 'all' || entry.category === purchaseFilter.category

      const matchesMonth =
        purchaseFilter.month.length === 0 || entry.purchaseDate.startsWith(purchaseFilter.month)

      return matchesQuery && matchesCategory && matchesMonth
    })
  }, [purchaseEntries, purchaseFilter])

  const filteredPurchaseTotal = filteredPurchases.reduce((sum, entry) => sum + entry.amount, 0)
  const filteredPurchaseAverage =
    filteredPurchases.length > 0 ? filteredPurchaseTotal / filteredPurchases.length : 0

  const goalsWithMetrics = useMemo(() => {
    const source = goalEntries ?? []

    return source.map((goal) => {
      const progressPercent = Math.min((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100, 100)
      const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0)
      const daysLeft = daysUntilDate(goal.targetDate)

      return {
        ...goal,
        progressPercent,
        remaining,
        daysLeft,
      }
    })
  }, [goalEntries])

  const dashboardCards = [
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
      value: money.format(summary.monthlyIncome),
      note: `${incomes.length} sources tracked`,
      trend: 'up',
    },
    {
      id: 'monthly-commitments',
      label: 'Monthly Commitments',
      value: money.format(summary.monthlyCommitments),
      note: 'Bills + card spend plans',
      trend: 'down',
    },
    {
      id: 'projected-net',
      label: 'Projected Monthly Net',
      value: money.format(summary.projectedMonthlyNet),
      note: percent.format(summary.savingsRatePercent / 100),
      trend: summary.projectedMonthlyNet >= 0 ? 'up' : 'down',
    },
    {
      id: 'net-worth',
      label: 'Net Worth',
      value: money.format(summary.netWorth),
      note: `${money.format(summary.totalAssets)} assets / ${money.format(summary.totalLiabilities)} liabilities`,
      trend: summary.netWorth >= 0 ? 'up' : 'down',
    },
    {
      id: 'runway',
      label: 'Cash Runway',
      value: `${summary.runwayMonths.toFixed(1)} months`,
      note: `${money.format(summary.liquidReserves)} liquid reserves`,
      trend: summary.runwayMonths >= 3 ? 'up' : summary.runwayMonths >= 1 ? 'flat' : 'down',
    },
  ]

  const clearError = () => setErrorMessage('')

  const handleMutationError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Something went wrong. Try again.'
    setErrorMessage(message)
  }

  const downloadSnapshot = () => {
    clearError()

    const payload = {
      generatedAt: new Date().toISOString(),
      summary,
      records: {
        incomes,
        bills,
        cards,
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

  const onAddIncome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addIncome({
        source: incomeForm.source,
        amount: parseFloatInput(incomeForm.amount, 'Income amount'),
        cadence: incomeForm.cadence,
        receivedDay: incomeForm.receivedDay ? parseIntInput(incomeForm.receivedDay, 'Received day') : undefined,
        notes: incomeForm.notes || undefined,
      })

      setIncomeForm({
        source: '',
        amount: '',
        cadence: 'monthly',
        receivedDay: '',
        notes: '',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onAddBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addBill({
        name: billForm.name,
        amount: parseFloatInput(billForm.amount, 'Bill amount'),
        dueDay: parseIntInput(billForm.dueDay, 'Due day'),
        cadence: billForm.cadence,
        autopay: billForm.autopay,
        notes: billForm.notes || undefined,
      })

      setBillForm({
        name: '',
        amount: '',
        dueDay: '',
        cadence: 'monthly',
        autopay: true,
        notes: '',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onAddCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addCard({
        name: cardForm.name,
        creditLimit: parseFloatInput(cardForm.creditLimit, 'Credit limit'),
        usedLimit: parseFloatInput(cardForm.usedLimit, 'Used limit'),
        minimumPayment: parseFloatInput(cardForm.minimumPayment, 'Minimum payment'),
        spendPerMonth: parseFloatInput(cardForm.spendPerMonth, 'Spend per month'),
      })

      setCardForm({
        name: '',
        creditLimit: '',
        usedLimit: '',
        minimumPayment: '',
        spendPerMonth: '',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onAddPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addPurchase({
        item: purchaseForm.item,
        amount: parseFloatInput(purchaseForm.amount, 'Purchase amount'),
        category: purchaseForm.category,
        purchaseDate: purchaseForm.purchaseDate,
        notes: purchaseForm.notes || undefined,
      })

      setPurchaseForm({
        item: '',
        amount: '',
        category: '',
        purchaseDate: toIsoToday(),
        notes: '',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onAddAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addAccount({
        name: accountForm.name,
        type: accountForm.type,
        balance: parseFloatInput(accountForm.balance, 'Account balance'),
        liquid: accountForm.liquid,
      })

      setAccountForm({
        name: '',
        type: 'checking',
        balance: '',
        liquid: true,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onAddGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addGoal({
        title: goalForm.title,
        targetAmount: parseFloatInput(goalForm.targetAmount, 'Target amount'),
        currentAmount: parseFloatInput(goalForm.currentAmount, 'Current amount'),
        targetDate: goalForm.targetDate,
        priority: goalForm.priority,
      })

      setGoalForm({
        title: '',
        targetAmount: '',
        currentAmount: '',
        targetDate: '',
        priority: 'medium',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteIncome = async (id: Id<'incomes'>) => {
    clearError()
    try {
      await removeIncome({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteBill = async (id: Id<'bills'>) => {
    clearError()
    try {
      await removeBill({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteCard = async (id: Id<'cards'>) => {
    clearError()
    try {
      await removeCard({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeletePurchase = async (id: Id<'purchases'>) => {
    clearError()
    try {
      await removePurchase({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteAccount = async (id: Id<'accounts'>) => {
    clearError()
    try {
      await removeAccount({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteGoal = async (id: Id<'goals'>) => {
    clearError()
    try {
      await removeGoal({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onUpdateGoalProgress = async (id: Id<'goals'>, fallbackCurrentAmount: number) => {
    clearError()

    try {
      const raw = goalProgressDrafts[id] ?? String(fallbackCurrentAmount)
      await updateGoalProgress({
        id,
        currentAmount: parseFloatInput(raw, 'Goal current amount'),
      })
    } catch (error) {
      handleMutationError(error)
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
                      <strong>{percent.format(summary.savingsRatePercent / 100)}</strong>
                    </li>
                    <li>
                      <span>Card Utilization</span>
                      <strong>{percent.format(summary.cardUtilizationPercent / 100)}</strong>
                    </li>
                    <li>
                      <span>Goal Funding</span>
                      <strong>{percent.format(summary.goalsFundedPercent / 100)}</strong>
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
                            {event.daysAway === 1 ? '' : 's'} • {cadenceLabel(event.cadence)}
                          </small>
                        </div>
                        <strong className={event.type === 'income' ? 'amount-positive' : 'amount-negative'}>
                          {money.format(event.amount)}
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
                  <p className="panel-value">{money.format(summary.purchasesThisMonth)} this month</p>
                </header>
                {topCategories.length === 0 ? (
                  <p className="empty-state">No purchases in {monthLabel.format(new Date())} yet.</p>
                ) : (
                  <ul className="category-bars">
                    {topCategories.map((category) => (
                      <li key={category.category}>
                        <div className="category-row">
                          <span>{category.category}</span>
                          <strong>{money.format(category.total)}</strong>
                        </div>
                        <div className="bar-track">
                          <span className="bar-fill" style={{ '--bar-width': `${category.sharePercent}%` } as CSSProperties} />
                        </div>
                        <small>{percent.format(category.sharePercent / 100)} of monthly purchases</small>
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
                          <strong>{percent.format(goal.progressPercent / 100)}</strong>
                        </div>
                        <div className="bar-track">
                          <span className="bar-fill" style={{ '--bar-width': `${goal.progressPercent}%` } as CSSProperties} />
                        </div>
                        <small>{money.format(goal.remaining)} remaining</small>
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
                    <strong>{incomes.length}</strong>
                  </li>
                  <li>
                    <span>Bill entries</span>
                    <strong>{bills.length}</strong>
                  </li>
                  <li>
                    <span>Card entries</span>
                    <strong>{cards.length}</strong>
                  </li>
                  <li>
                    <span>Purchase entries</span>
                    <strong>{purchases.length}</strong>
                  </li>
                  <li>
                    <span>Account entries</span>
                    <strong>{accounts.length}</strong>
                  </li>
                  <li>
                    <span>Goal entries</span>
                    <strong>{goals.length}</strong>
                  </li>
                </ul>
              </article>
            </section>
          </>
        ) : null}

        {activeTab === 'income' ? (
          <section className="editor-grid" aria-label="Income management">
            <article className="panel panel-form">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Income</p>
                  <h2>Add Income Entry</h2>
                </div>
              </header>
              <form className="entry-form" onSubmit={onAddIncome}>
                <label htmlFor="income-source">Source</label>
                <input
                  id="income-source"
                  value={incomeForm.source}
                  onChange={(event) => setIncomeForm((prev) => ({ ...prev, source: event.target.value }))}
                  required
                />

                <label htmlFor="income-amount">Amount</label>
                <input
                  id="income-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={incomeForm.amount}
                  onChange={(event) => setIncomeForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />

                <label htmlFor="income-cadence">Frequency</label>
                <select
                  id="income-cadence"
                  value={incomeForm.cadence}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({ ...prev, cadence: event.target.value as Cadence }))
                  }
                >
                  {cadenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="income-day">Received Day (optional)</label>
                <input
                  id="income-day"
                  type="number"
                  min="1"
                  max="31"
                  value={incomeForm.receivedDay}
                  onChange={(event) => setIncomeForm((prev) => ({ ...prev, receivedDay: event.target.value }))}
                />

                <label htmlFor="income-notes">Notes (optional)</label>
                <textarea
                  id="income-notes"
                  rows={3}
                  value={incomeForm.notes}
                  onChange={(event) => setIncomeForm((prev) => ({ ...prev, notes: event.target.value }))}
                />

                <button type="submit" className="btn btn-primary">
                  Save Income
                </button>
              </form>
            </article>

            <article className="panel panel-list">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Income</p>
                  <h2>Current Entries</h2>
                </div>
              </header>

              {incomes.length === 0 ? (
                <p className="empty-state">No income entries added yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Income entries</caption>
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Frequency</th>
                        <th scope="col">Day</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.source}</td>
                          <td className="table-amount amount-positive">{money.format(entry.amount)}</td>
                          <td>{cadenceLabel(entry.cadence)}</td>
                          <td>{entry.receivedDay ?? '-'}</td>
                          <td>
                            <button type="button" className="btn btn-ghost" onClick={() => void onDeleteIncome(entry._id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'bills' ? (
          <section className="editor-grid" aria-label="Bill management">
            <article className="panel panel-form">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Bills</p>
                  <h2>Add Bill Entry</h2>
                </div>
              </header>
              <form className="entry-form" onSubmit={onAddBill}>
                <label htmlFor="bill-name">Bill Name</label>
                <input
                  id="bill-name"
                  value={billForm.name}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />

                <label htmlFor="bill-amount">Amount</label>
                <input
                  id="bill-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={billForm.amount}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />

                <label htmlFor="bill-day">Due Day (1-31)</label>
                <input
                  id="bill-day"
                  type="number"
                  min="1"
                  max="31"
                  value={billForm.dueDay}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                  required
                />

                <label htmlFor="bill-cadence">Frequency</label>
                <select
                  id="bill-cadence"
                  value={billForm.cadence}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, cadence: event.target.value as Cadence }))}
                >
                  {cadenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label className="checkbox-row" htmlFor="bill-autopay">
                  <input
                    id="bill-autopay"
                    type="checkbox"
                    checked={billForm.autopay}
                    onChange={(event) => setBillForm((prev) => ({ ...prev, autopay: event.target.checked }))}
                  />
                  Autopay enabled
                </label>

                <label htmlFor="bill-notes">Notes (optional)</label>
                <textarea
                  id="bill-notes"
                  rows={3}
                  value={billForm.notes}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))}
                />

                <button type="submit" className="btn btn-primary">
                  Save Bill
                </button>
              </form>
            </article>

            <article className="panel panel-list">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Bills</p>
                  <h2>Current Entries</h2>
                </div>
              </header>

              {bills.length === 0 ? (
                <p className="empty-state">No bills added yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Bill entries</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Due Day</th>
                        <th scope="col">Frequency</th>
                        <th scope="col">Autopay</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.name}</td>
                          <td className="table-amount amount-negative">{money.format(entry.amount)}</td>
                          <td>{entry.dueDay}</td>
                          <td>{cadenceLabel(entry.cadence)}</td>
                          <td>{entry.autopay ? 'Yes' : 'No'}</td>
                          <td>
                            <button type="button" className="btn btn-ghost" onClick={() => void onDeleteBill(entry._id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'cards' ? (
          <section className="editor-grid" aria-label="Card management">
            <article className="panel panel-form">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Cards</p>
                  <h2>Add Card Entry</h2>
                </div>
              </header>

              <form className="entry-form" onSubmit={onAddCard}>
                <label htmlFor="card-name">Card Name</label>
                <input
                  id="card-name"
                  value={cardForm.name}
                  onChange={(event) => setCardForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />

                <label htmlFor="card-limit">Credit Limit</label>
                <input
                  id="card-limit"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cardForm.creditLimit}
                  onChange={(event) => setCardForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
                  required
                />

                <label htmlFor="card-used">Used Limit</label>
                <input
                  id="card-used"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.usedLimit}
                  onChange={(event) => setCardForm((prev) => ({ ...prev, usedLimit: event.target.value }))}
                  required
                />

                <label htmlFor="card-payment">Minimum Payment</label>
                <input
                  id="card-payment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.minimumPayment}
                  onChange={(event) => setCardForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                  required
                />

                <label htmlFor="card-spend">Spend Per Month</label>
                <input
                  id="card-spend"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.spendPerMonth}
                  onChange={(event) => setCardForm((prev) => ({ ...prev, spendPerMonth: event.target.value }))}
                  required
                />

                <button type="submit" className="btn btn-primary">
                  Save Card
                </button>
              </form>
            </article>

            <article className="panel panel-list">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Cards</p>
                  <h2>Current Entries</h2>
                </div>
              </header>

              {cards.length === 0 ? (
                <p className="empty-state">No cards added yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Card entries</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Limit</th>
                        <th scope="col">Used</th>
                        <th scope="col">Min Payment</th>
                        <th scope="col">Monthly Spend</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cards.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.name}</td>
                          <td className="table-amount">{money.format(entry.creditLimit)}</td>
                          <td className="table-amount amount-negative">{money.format(entry.usedLimit)}</td>
                          <td>{money.format(entry.minimumPayment)}</td>
                          <td>{money.format(entry.spendPerMonth)}</td>
                          <td>
                            <button type="button" className="btn btn-ghost" onClick={() => void onDeleteCard(entry._id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'purchases' ? (
          <section className="editor-grid" aria-label="Purchase management">
            <article className="panel panel-form">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Purchases</p>
                  <h2>Add Purchase Entry</h2>
                </div>
              </header>

              <form className="entry-form" onSubmit={onAddPurchase}>
                <label htmlFor="purchase-item">Item</label>
                <input
                  id="purchase-item"
                  value={purchaseForm.item}
                  onChange={(event) => setPurchaseForm((prev) => ({ ...prev, item: event.target.value }))}
                  required
                />

                <label htmlFor="purchase-amount">Amount</label>
                <input
                  id="purchase-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={purchaseForm.amount}
                  onChange={(event) => setPurchaseForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />

                <label htmlFor="purchase-category">Category</label>
                <input
                  id="purchase-category"
                  value={purchaseForm.category}
                  onChange={(event) => setPurchaseForm((prev) => ({ ...prev, category: event.target.value }))}
                  required
                />

                <label htmlFor="purchase-date">Purchase Date</label>
                <input
                  id="purchase-date"
                  type="date"
                  value={purchaseForm.purchaseDate}
                  onChange={(event) => setPurchaseForm((prev) => ({ ...prev, purchaseDate: event.target.value }))}
                  required
                />

                <label htmlFor="purchase-notes">Notes (optional)</label>
                <textarea
                  id="purchase-notes"
                  rows={3}
                  value={purchaseForm.notes}
                  onChange={(event) => setPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
                />

                <button type="submit" className="btn btn-primary">
                  Save Purchase
                </button>
              </form>
            </article>

            <article className="panel panel-list">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Purchases</p>
                  <h2>Current Entries</h2>
                </div>
                <p className="panel-value">{money.format(filteredPurchaseTotal)} filtered total</p>
              </header>

              <div className="filter-row" role="group" aria-label="Purchase filters">
                <input
                  type="search"
                  placeholder="Search item, category, notes"
                  value={purchaseFilter.query}
                  onChange={(event) =>
                    setPurchaseFilter((prev) => ({
                      ...prev,
                      query: event.target.value,
                    }))
                  }
                />
                <select
                  value={purchaseFilter.category}
                  onChange={(event) =>
                    setPurchaseFilter((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                >
                  <option value="all">All categories</option>
                  {purchaseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={purchaseFilter.month}
                  onChange={(event) =>
                    setPurchaseFilter((prev) => ({
                      ...prev,
                      month: event.target.value,
                    }))
                  }
                />
              </div>

              <p className="subnote">
                {filteredPurchases.length} result{filteredPurchases.length === 1 ? '' : 's'} • avg{' '}
                {money.format(filteredPurchaseAverage)}
              </p>

              {filteredPurchases.length === 0 ? (
                <p className="empty-state">No purchases match this filter.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Purchase entries</caption>
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Category</th>
                        <th scope="col">Date</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPurchases.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.item}</td>
                          <td>{entry.category}</td>
                          <td>{dateLabel.format(new Date(`${entry.purchaseDate}T00:00:00`))}</td>
                          <td className="table-amount amount-negative">{money.format(entry.amount)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => void onDeletePurchase(entry._id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'accounts' ? (
          <section className="editor-grid" aria-label="Account management">
            <article className="panel panel-form">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Accounts</p>
                  <h2>Add Account Entry</h2>
                </div>
              </header>

              <form className="entry-form" onSubmit={onAddAccount}>
                <label htmlFor="account-name">Account Name</label>
                <input
                  id="account-name"
                  value={accountForm.name}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />

                <label htmlFor="account-type">Type</label>
                <select
                  id="account-type"
                  value={accountForm.type}
                  onChange={(event) =>
                    setAccountForm((prev) => ({
                      ...prev,
                      type: event.target.value as AccountType,
                    }))
                  }
                >
                  {accountTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="account-balance">Current Balance</label>
                <input
                  id="account-balance"
                  type="number"
                  step="0.01"
                  value={accountForm.balance}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, balance: event.target.value }))}
                  required
                />

                <label className="checkbox-row" htmlFor="account-liquid">
                  <input
                    id="account-liquid"
                    type="checkbox"
                    checked={accountForm.liquid}
                    onChange={(event) => setAccountForm((prev) => ({ ...prev, liquid: event.target.checked }))}
                  />
                  Liquid reserve account
                </label>

                <button type="submit" className="btn btn-primary">
                  Save Account
                </button>
              </form>
            </article>

            <article className="panel panel-list">
              <header className="panel-header">
                <div>
                  <p className="panel-kicker">Accounts</p>
                  <h2>Current Entries</h2>
                </div>
              </header>

              {accounts.length === 0 ? (
                <p className="empty-state">No accounts added yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Account entries</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Type</th>
                        <th scope="col">Balance</th>
                        <th scope="col">Liquid</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.name}</td>
                          <td>{accountTypeLabel(entry.type)}</td>
                          <td className={`table-amount ${entry.balance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                            {money.format(entry.balance)}
                          </td>
                          <td>{entry.liquid ? 'Yes' : 'No'}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => void onDeleteAccount(entry._id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {activeTab === 'goals' ? (
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
                <ul className="goal-list">
                  {goalsWithMetrics.map((goal) => (
                    <li key={goal._id}>
                      <div className="goal-head">
                        <div>
                          <p>{goal.title}</p>
                          <small>
                            {priorityLabel(goal.priority)} priority • target {dateLabel.format(new Date(`${goal.targetDate}T00:00:00`))}
                          </small>
                        </div>
                        <strong>{percent.format(goal.progressPercent / 100)}</strong>
                      </div>

                      <div className="bar-track">
                        <span className="bar-fill" style={{ '--bar-width': `${goal.progressPercent}%` } as CSSProperties} />
                      </div>

                      <div className="goal-foot">
                        <span>
                          {money.format(goal.currentAmount)} / {money.format(goal.targetAmount)}
                        </span>
                        <span>{money.format(goal.remaining)} remaining</span>
                        <span>{goal.daysLeft >= 0 ? `${goal.daysLeft} days left` : 'Past target date'}</span>
                      </div>

                      <div className="goal-actions">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Update current amount"
                          value={goalProgressDrafts[goal._id] ?? ''}
                          onChange={(event) =>
                            setGoalProgressDrafts((prev) => ({
                              ...prev,
                              [goal._id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void onUpdateGoalProgress(goal._id, goal.currentAmount)}
                        >
                          Update
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => void onDeleteGoal(goal._id)}>
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : null}
      </SignedIn>
    </main>
  )
}

export default App
