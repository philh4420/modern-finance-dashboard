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

type TabKey = 'dashboard' | 'income' | 'bills' | 'cards' | 'purchases'

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'one_time'

type Summary = {
  monthlyIncome: number
  monthlyBills: number
  monthlyCardSpend: number
  cardLimitTotal: number
  cardUsedTotal: number
  cardUtilizationPercent: number
  purchasesThisMonth: number
  projectedMonthlyNet: number
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'income', label: 'Income' },
  { key: 'bills', label: 'Bills' },
  { key: 'cards', label: 'Cards' },
  { key: 'purchases', label: 'Purchases' },
]

const cadenceOptions: Array<{ value: Cadence; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One Time' },
]

const emptySummary: Summary = {
  monthlyIncome: 0,
  monthlyBills: 0,
  monthlyCardSpend: 0,
  cardLimitTotal: 0,
  cardUsedTotal: 0,
  cardUtilizationPercent: 0,
  purchasesThisMonth: 0,
  projectedMonthlyNet: 0,
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

const cadenceLabel = (cadence: Cadence) => cadenceOptions.find((option) => option.value === cadence)?.label ?? cadence

const nextDueDateFromDay = (dueDay: number) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const buildDate = (year: number, month: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return new Date(year, month, Math.min(dueDay, daysInMonth))
  }

  let dueDate = buildDate(now.getFullYear(), now.getMonth())

  if (dueDate < today) {
    const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
    const month = (now.getMonth() + 1) % 12
    dueDate = buildDate(year, month)
  }

  return dueDate
}

const daysUntil = (targetDate: Date) => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime()
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
    purchaseDate: new Date().toISOString().slice(0, 10),
    notes: '',
  })

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
  const summary = financeState?.data.summary ?? emptySummary

  const incomes = incomeEntries ?? []
  const bills = billEntries ?? []
  const cards = cardEntries ?? []
  const purchases = purchaseEntries ?? []

  const connectionNote = financeState === undefined ? 'Connecting to Convex...' : 'Convex synced'

  const lastUpdated = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(financeState?.updatedAt ? new Date(financeState.updatedAt) : new Date())

  const upcomingBills = useMemo(() => {
    const source = billEntries ?? []

    return [...source]
      .map((bill) => {
        const dueDate = nextDueDateFromDay(bill.dueDay)
        return {
          ...bill,
          dueDate,
          dueInDays: daysUntil(dueDate),
        }
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
  }, [billEntries])

  const recentPurchases = useMemo(() => {
    const source = purchaseEntries ?? []

    return [...source]
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())
      .slice(0, 8)
  }, [purchaseEntries])

  const averagePurchase = purchases.length > 0 ? summary.purchasesThisMonth / purchases.length : 0

  const dashboardCards = [
    {
      id: 'monthly-income',
      label: 'Monthly Income',
      value: money.format(summary.monthlyIncome),
      note: `${incomes.length} entries`,
      trend: 'up',
    },
    {
      id: 'monthly-bills',
      label: 'Monthly Bills',
      value: money.format(summary.monthlyBills),
      note: `${bills.length} recurring bills`,
      trend: 'down',
    },
    {
      id: 'card-utilization',
      label: 'Card Utilization',
      value: summary.cardLimitTotal > 0 ? percent.format(summary.cardUtilizationPercent / 100) : '0.0%',
      note: `${money.format(summary.cardUsedTotal)} of ${money.format(summary.cardLimitTotal)}`,
      trend: summary.cardUtilizationPercent > 35 ? 'down' : 'up',
    },
    {
      id: 'projected-net',
      label: 'Projected Net',
      value: money.format(summary.projectedMonthlyNet),
      note: 'income - bills - card spend',
      trend: summary.projectedMonthlyNet >= 0 ? 'up' : 'down',
    },
  ]

  const clearError = () => setErrorMessage('')

  const handleMutationError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Something went wrong. Try again.'
    setErrorMessage(message)
  }

  const onAddIncome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addIncome({
        source: incomeForm.source,
        amount: Number.parseFloat(incomeForm.amount),
        cadence: incomeForm.cadence,
        receivedDay: incomeForm.receivedDay ? Number.parseInt(incomeForm.receivedDay, 10) : undefined,
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
        amount: Number.parseFloat(billForm.amount),
        dueDay: Number.parseInt(billForm.dueDay, 10),
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
        creditLimit: Number.parseFloat(cardForm.creditLimit),
        usedLimit: Number.parseFloat(cardForm.usedLimit),
        minimumPayment: Number.parseFloat(cardForm.minimumPayment),
        spendPerMonth: Number.parseFloat(cardForm.spendPerMonth),
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
        amount: Number.parseFloat(purchaseForm.amount),
        category: purchaseForm.category,
        purchaseDate: purchaseForm.purchaseDate,
        notes: purchaseForm.notes || undefined,
      })

      setPurchaseForm({
        item: '',
        amount: '',
        category: '',
        purchaseDate: new Date().toISOString().slice(0, 10),
        notes: '',
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

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">Personal Finance Workspace</p>
          <h1>Finance Control Hub</h1>
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
            <div className="user-menu">
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </header>

      <SignedOut>
        <section className="auth-panel" aria-label="Authentication required">
          <h2>Sign in to start manual finance tracking</h2>
          <p>Data is empty by default and only what you enter in each section will appear in your dashboard.</p>
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
            <section className="metric-grid" aria-label="Linked finance dashboard metrics">
              {dashboardCards.map((card) => (
                <article className="metric-card" key={card.id}>
                  <p className="metric-label">{card.label}</p>
                  <p className="metric-value">{card.value}</p>
                  <p className={`metric-change metric-change--${card.trend}`}>{card.note}</p>
                </article>
              ))}
            </section>

            <section className="content-grid" aria-label="Linked dashboard details">
              <article className="panel panel-upcoming">
                <header className="panel-header">
                  <div>
                    <p className="panel-kicker">Bills</p>
                    <h2>Upcoming Due Dates</h2>
                  </div>
                </header>

                {upcomingBills.length === 0 ? (
                  <p className="empty-state">No bills yet. Add them in the Bills section.</p>
                ) : (
                  <ul className="item-list">
                    {upcomingBills.slice(0, 6).map((bill) => (
                      <li key={bill._id}>
                        <div>
                          <p>{bill.name}</p>
                          <small>
                            {dateLabel.format(bill.dueDate)} ({bill.dueInDays} day{bill.dueInDays === 1 ? '' : 's'})
                          </small>
                        </div>
                        <div className="item-meta">
                          <strong>{money.format(bill.amount)}</strong>
                          <span>{bill.autopay ? 'Autopay' : 'Manual'}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="panel panel-cards-overview">
                <header className="panel-header">
                  <div>
                    <p className="panel-kicker">Cards</p>
                    <h2>Utilization</h2>
                  </div>
                  <p className="panel-value">{percent.format(summary.cardUtilizationPercent / 100)}</p>
                </header>

                {cards.length === 0 ? (
                  <p className="empty-state">No cards yet. Add them in the Cards section.</p>
                ) : (
                  <ul className="progress-list">
                    {cards.map((card) => {
                      const utilization = card.creditLimit > 0 ? card.usedLimit / card.creditLimit : 0

                      return (
                        <li key={card._id}>
                          <div className="progress-row">
                            <span>{card.name}</span>
                            <strong>{percent.format(utilization)}</strong>
                          </div>
                          <div className="progress-track">
                            <span
                              className="progress-fill"
                              style={{ '--fill-width': `${Math.min(utilization * 100, 100)}%` } as CSSProperties}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>

              <article className="panel panel-purchases-overview">
                <header className="panel-header">
                  <div>
                    <p className="panel-kicker">Purchases</p>
                    <h2>Recent Activity</h2>
                  </div>
                  <p className="panel-value">{money.format(summary.purchasesThisMonth)} this month</p>
                </header>

                {recentPurchases.length === 0 ? (
                  <p className="empty-state">No purchases yet. Add them in the Purchases section.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <caption className="sr-only">Recent purchases</caption>
                      <thead>
                        <tr>
                          <th scope="col">Item</th>
                          <th scope="col">Category</th>
                          <th scope="col">Date</th>
                          <th scope="col">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPurchases.map((purchase) => (
                          <tr key={purchase._id}>
                            <td>{purchase.item}</td>
                            <td>{purchase.category}</td>
                            <td>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</td>
                            <td className="table-amount">{money.format(purchase.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="panel panel-snapshot">
                <header className="panel-header">
                  <div>
                    <p className="panel-kicker">Snapshot</p>
                    <h2>Cross-Section Totals</h2>
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
                    <span>Average purchase</span>
                    <strong>{money.format(averagePurchase)}</strong>
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
                          <td className="table-amount table-amount--positive">{money.format(entry.amount)}</td>
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
                          <td className="table-amount">{money.format(entry.amount)}</td>
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
                          <td className="table-amount">{money.format(entry.usedLimit)}</td>
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
              </header>

              {purchases.length === 0 ? (
                <p className="empty-state">No purchases added yet.</p>
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
                      {purchases.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.item}</td>
                          <td>{entry.category}</td>
                          <td>{dateLabel.format(new Date(`${entry.purchaseDate}T00:00:00`))}</td>
                          <td className="table-amount">{money.format(entry.amount)}</td>
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
      </SignedIn>
    </main>
  )
}

export default App
