import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  Cadence,
  CadenceOption,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  LoanEditDraft,
  LoanEntry,
  LoanForm,
  LoanId,
  LoanMinimumPaymentType,
} from './financeTypes'

type LoanSortKey = 'name_asc' | 'balance_desc' | 'apr_desc' | 'due_asc' | 'interest_desc'
type LoanQuickActionType = 'charge' | 'payment' | 'interest' | 'subscription'

type LoanProjection = {
  id: LoanId
  balance: number
  principalBalance: number
  accruedInterest: number
  subscriptionCost: number
  subscriptionPaymentsRemaining: number
  subscriptionOutstanding: number
  totalOutstanding: number
  apr: number
  projectedInterest: number
  minimumDue: number
  subscriptionDueNow: number
  dueThisCycle: number
  plannedPayment: number
  plannedTotalPayment: number
  projectedAfterPayment: number
  projectedTotalAfterPayment: number
  dueInDays: number
  cadenceLabel: string
  paymentBelowInterest: boolean
}

type LoansTabProps = {
  loans: LoanEntry[]
  monthlyLoanPayments: number
  monthlyLoanBasePayments: number
  monthlyLoanSubscriptionCosts: number
  totalLoanBalance: number
  loanForm: LoanForm
  setLoanForm: Dispatch<SetStateAction<LoanForm>>
  loanEditId: LoanId | null
  setLoanEditId: Dispatch<SetStateAction<LoanId | null>>
  loanEditDraft: LoanEditDraft
  setLoanEditDraft: Dispatch<SetStateAction<LoanEditDraft>>
  onAddLoan: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteLoan: (id: LoanId) => Promise<void>
  saveLoanEdit: () => Promise<void>
  startLoanEdit: (entry: LoanEntry) => void
  onQuickAddLoanCharge: (id: LoanId, amount: number, notes?: string) => Promise<void>
  onQuickRecordLoanPayment: (id: LoanId, amount: number, notes?: string) => Promise<void>
  onQuickApplyLoanInterest: (id: LoanId, notes?: string) => Promise<void>
  onQuickApplyLoanSubscription: (id: LoanId, notes?: string) => Promise<void>
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)
const roundCurrency = (value: number) => Math.round(value * 100) / 100
const toNumber = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const normalizePositiveInteger = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

const resolveLoanSubscriptionOutstanding = (entry: LoanEntry) => {
  const subscriptionCost = roundCurrency(Math.max(toNumber(entry.subscriptionCost), 0))
  if (subscriptionCost <= 0) {
    return 0
  }

  const subscriptionPaymentCount = normalizePositiveInteger(entry.subscriptionPaymentCount)
  if (entry.subscriptionOutstanding !== undefined) {
    const current = roundCurrency(Math.max(toNumber(entry.subscriptionOutstanding), 0))
    if (subscriptionPaymentCount === undefined && current <= subscriptionCost + 0.000001) {
      return roundCurrency(subscriptionCost * 12)
    }
    return current
  }

  return roundCurrency(subscriptionCost * (subscriptionPaymentCount ?? 12))
}

const computeDueInDays = (dueDay: number) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dueThisMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(dueDay, 1), daysInThisMonth))

  if (dueThisMonth >= today) {
    return Math.round((dueThisMonth.getTime() - today.getTime()) / 86400000)
  }

  const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
  const dueNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(Math.max(dueDay, 1), daysInNextMonth))
  return Math.round((dueNextMonth.getTime() - today.getTime()) / 86400000)
}

const normalizeLoanMinimumPaymentType = (
  value: LoanMinimumPaymentType | undefined | null,
): LoanMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const projectionForLoan = (
  entry: LoanEntry,
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string,
): LoanProjection => {
  const hasExplicitComponents = entry.principalBalance !== undefined || entry.accruedInterest !== undefined
  const principalBalance = Math.max(
    hasExplicitComponents ? toNumber(entry.principalBalance) : toNumber(entry.balance),
    0,
  )
  const accruedInterest = Math.max(hasExplicitComponents ? toNumber(entry.accruedInterest) : 0, 0)
  const balance = roundCurrency(Math.max(hasExplicitComponents ? principalBalance + accruedInterest : toNumber(entry.balance), 0))
  const apr = Math.max(toNumber(entry.interestRate), 0)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const projectedInterest = roundCurrency(balance * monthlyRate)
  const paymentType = normalizeLoanMinimumPaymentType(entry.minimumPaymentType)
  const minimumPaymentPercent = clampPercent(toNumber(entry.minimumPaymentPercent))
  const minimumDueRaw =
    paymentType === 'percent_plus_interest'
      ? principalBalance * (minimumPaymentPercent / 100) + accruedInterest + projectedInterest
      : toNumber(entry.minimumPayment)
  const dueBalance = balance + projectedInterest
  const minimumDue = roundCurrency(Math.min(dueBalance, Math.max(minimumDueRaw, 0)))
  const plannedPayment = roundCurrency(Math.min(dueBalance, minimumDue + Math.max(toNumber(entry.extraPayment), 0)))
  const subscriptionCost = roundCurrency(Math.max(toNumber(entry.subscriptionCost), 0))
  const subscriptionOutstanding = resolveLoanSubscriptionOutstanding(entry)
  const subscriptionPaymentsRemaining =
    subscriptionCost > 0 && subscriptionOutstanding > 0
      ? Math.max(1, Math.ceil(subscriptionOutstanding / subscriptionCost - 0.000001))
      : 0
  const subscriptionDueNow = roundCurrency(
    Math.min(subscriptionOutstanding, subscriptionCost > 0 ? subscriptionCost : subscriptionOutstanding),
  )
  const dueThisCycle = roundCurrency(minimumDue + subscriptionDueNow)
  const plannedTotalPayment = roundCurrency(plannedPayment + subscriptionDueNow)
  const projectedTotalAfterPayment = roundCurrency(
    Math.max(dueBalance - plannedPayment, 0) + Math.max(subscriptionOutstanding - subscriptionDueNow, 0),
  )
  const totalOutstanding = roundCurrency(balance + subscriptionOutstanding)

  return {
    id: entry._id,
    balance,
    principalBalance: roundCurrency(principalBalance),
    accruedInterest: roundCurrency(accruedInterest),
    subscriptionCost,
    subscriptionPaymentsRemaining,
    subscriptionOutstanding,
    totalOutstanding,
    apr,
    projectedInterest,
    minimumDue,
    subscriptionDueNow,
    dueThisCycle,
    plannedPayment,
    plannedTotalPayment,
    projectedAfterPayment: roundCurrency(Math.max(dueBalance - plannedPayment, 0)),
    projectedTotalAfterPayment,
    dueInDays: computeDueInDays(entry.dueDay),
    cadenceLabel: cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit),
    paymentBelowInterest: plannedPayment + 0.000001 < projectedInterest,
  }
}

export function LoansTab({
  loans,
  monthlyLoanPayments,
  monthlyLoanBasePayments,
  monthlyLoanSubscriptionCosts,
  totalLoanBalance,
  loanForm,
  setLoanForm,
  loanEditId,
  setLoanEditId,
  loanEditDraft,
  setLoanEditDraft,
  onAddLoan,
  onDeleteLoan,
  saveLoanEdit,
  startLoanEdit,
  onQuickAddLoanCharge,
  onQuickRecordLoanPayment,
  onQuickApplyLoanInterest,
  onQuickApplyLoanSubscription,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: LoansTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<LoanSortKey>('name_asc')
  const [quickAction, setQuickAction] = useState<{ loanId: LoanId; type: LoanQuickActionType } | null>(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [quickNotes, setQuickNotes] = useState('')
  const [quickError, setQuickError] = useState<string | null>(null)

  const projectionsById = useMemo(() => {
    const map = new Map<LoanId, LoanProjection>()
    loans.forEach((entry) => {
      map.set(entry._id, projectionForLoan(entry, cadenceLabel))
    })
    return map
  }, [cadenceLabel, loans])

  const visibleLoans = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? loans.filter((entry) => `${entry.name} ${entry.notes ?? ''}`.toLowerCase().includes(query))
      : loans.slice()

    const sorted = [...filtered].sort((left, right) => {
      const leftProjection = projectionsById.get(left._id)
      const rightProjection = projectionsById.get(right._id)

      switch (sortKey) {
        case 'name_asc':
          return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        case 'balance_desc':
          return (rightProjection?.totalOutstanding ?? 0) - (leftProjection?.totalOutstanding ?? 0)
        case 'apr_desc':
          return (rightProjection?.apr ?? 0) - (leftProjection?.apr ?? 0)
        case 'due_asc':
          return (leftProjection?.dueInDays ?? 999) - (rightProjection?.dueInDays ?? 999)
        case 'interest_desc':
          return (rightProjection?.projectedInterest ?? 0) - (leftProjection?.projectedInterest ?? 0)
        default:
          return 0
      }
    })

    return sorted
  }, [loans, projectionsById, search, sortKey])

  const totalProjectedInterest = useMemo(
    () =>
      roundCurrency(
        loans.reduce((sum, entry) => {
          const projection = projectionsById.get(entry._id)
          return sum + (projection?.projectedInterest ?? 0)
        }, 0),
      ),
    [loans, projectionsById],
  )

  const dueSoonCount = useMemo(
    () => loans.filter((entry) => (projectionsById.get(entry._id)?.dueInDays ?? 999) <= 7).length,
    [loans, projectionsById],
  )

  const belowInterestCount = useMemo(
    () => loans.filter((entry) => projectionsById.get(entry._id)?.paymentBelowInterest).length,
    [loans, projectionsById],
  )

  const parseQuickAmount = () => {
    const parsed = Number.parseFloat(quickAmount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  }

  const submitQuickAction = async (entry: LoanEntry) => {
    if (!quickAction || quickAction.loanId !== entry._id) {
      return
    }

    setQuickError(null)
    try {
      if (quickAction.type === 'charge') {
        const amount = parseQuickAmount()
        if (amount === null) {
          setQuickError('Enter a valid charge amount greater than 0.')
          return
        }
        await onQuickAddLoanCharge(entry._id, amount, quickNotes)
      } else if (quickAction.type === 'payment') {
        const amount = parseQuickAmount()
        if (amount === null) {
          setQuickError('Enter a valid payment amount greater than 0.')
          return
        }
        await onQuickRecordLoanPayment(entry._id, amount, quickNotes)
      } else if (quickAction.type === 'interest') {
        await onQuickApplyLoanInterest(entry._id, quickNotes)
      } else {
        await onQuickApplyLoanSubscription(entry._id, quickNotes)
      }

      setQuickAction(null)
      setQuickAmount('')
      setQuickNotes('')
      setQuickError(null)
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : 'Quick action failed.')
    }
  }

  return (
    <section className="editor-grid loans-tab-shell" aria-label="Loan management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Add loan</h2>
            <p className="panel-value">
              {loans.length} loan{loans.length === 1 ? '' : 's'} · {formatMoney(totalLoanBalance)} balance
            </p>
            <p className="subnote">
              {formatMoney(monthlyLoanPayments)} obligations/mo ({formatMoney(monthlyLoanBasePayments)} payments +{' '}
              {formatMoney(monthlyLoanSubscriptionCosts)} subscriptions)
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddLoan}>
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="loan-name">Loan name</label>
              <input
                id="loan-name"
                value={loanForm.name}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-balance">Current balance</label>
              <input
                id="loan-balance"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={loanForm.balance}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, balance: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-principal">Principal balance (optional)</label>
              <input
                id="loan-principal"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Auto from balance"
                value={loanForm.principalBalance}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, principalBalance: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-accrued">Accrued interest (optional)</label>
              <input
                id="loan-accrued"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Auto from balance"
                value={loanForm.accruedInterest}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, accruedInterest: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-payment-type">Minimum payment model</label>
              <select
                id="loan-payment-type"
                value={loanForm.minimumPaymentType}
                onChange={(event) =>
                  setLoanForm((prev) => ({
                    ...prev,
                    minimumPaymentType: event.target.value as LoanMinimumPaymentType,
                    minimumPaymentPercent:
                      event.target.value === 'percent_plus_interest' ? prev.minimumPaymentPercent || '2' : '',
                  }))
                }
              >
                <option value="fixed">Fixed amount</option>
                <option value="percent_plus_interest">% + interest</option>
              </select>
            </div>

            {loanForm.minimumPaymentType === 'fixed' ? (
              <div className="form-field">
                <label htmlFor="loan-payment">Minimum payment</label>
                <input
                  id="loan-payment"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={loanForm.minimumPayment}
                  onChange={(event) => setLoanForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                  required
                />
              </div>
            ) : (
              <>
                <div className="form-field">
                  <label htmlFor="loan-payment-percent">Minimum %</label>
                  <input
                    id="loan-payment-percent"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={loanForm.minimumPaymentPercent}
                    onChange={(event) =>
                      setLoanForm((prev) => ({
                        ...prev,
                        minimumPaymentPercent: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="loan-payment">Fixed base (optional)</label>
                  <input
                    id="loan-payment"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={loanForm.minimumPayment}
                    onChange={(event) => setLoanForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="form-field">
              <label htmlFor="loan-extra-payment">Extra payment</label>
              <input
                id="loan-extra-payment"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={loanForm.extraPayment}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, extraPayment: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-subscription">Subscription cost (monthly)</label>
              <input
                id="loan-subscription"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={loanForm.subscriptionCost}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, subscriptionCost: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-subscription-payment-count">Subscription payments left</label>
              <input
                id="loan-subscription-payment-count"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="12"
                value={loanForm.subscriptionPaymentCount}
                onChange={(event) =>
                  setLoanForm((prev) => ({ ...prev, subscriptionPaymentCount: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-interest-rate">APR %</label>
              <input
                id="loan-interest-rate"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={loanForm.interestRate}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, interestRate: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-due-day">Due day</label>
              <input
                id="loan-due-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={loanForm.dueDay}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-cadence">Payment frequency</label>
              <select
                id="loan-cadence"
                value={loanForm.cadence}
                onChange={(event) =>
                  setLoanForm((prev) => ({
                    ...prev,
                    cadence: event.target.value as Cadence,
                    customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                  }))
                }
              >
                {cadenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isCustomCadence(loanForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="loan-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="loan-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={loanForm.customInterval}
                    onChange={(event) => setLoanForm((prev) => ({ ...prev, customInterval: event.target.value }))}
                    required
                  />
                  <select
                    id="loan-custom-unit"
                    value={loanForm.customUnit}
                    onChange={(event) =>
                      setLoanForm((prev) => ({
                        ...prev,
                        customUnit: event.target.value as CustomCadenceUnit,
                      }))
                    }
                  >
                    {customCadenceUnitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div className="form-field form-field--span2">
              <label htmlFor="loan-notes">Notes</label>
              <textarea
                id="loan-notes"
                rows={3}
                placeholder="Optional"
                value={loanForm.notes}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p className="form-hint">
            Tip: choose <strong>% + interest</strong> when minimums are percentage-based, then set optional extra payment for
            overpay planning. Set <strong>Subscription payments left</strong> if the loan is already part-way through its
            subscription plan.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add loan
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyLoanPayments)} obligations/mo</p>
            <p className="subnote">
              {formatMoney(totalLoanBalance)} total balance · {formatMoney(totalProjectedInterest)} projected next-month
              interest
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search loans"
              placeholder="Search loans or notes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort loans" value={sortKey} onChange={(event) => setSortKey(event.target.value as LoanSortKey)}>
              <option value="name_asc">Name (A-Z)</option>
              <option value="balance_desc">Outstanding (high-low)</option>
              <option value="apr_desc">APR (high-low)</option>
              <option value="due_asc">Due soon</option>
              <option value="interest_desc">Projected interest (high-low)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setSortKey('name_asc')
              }}
              disabled={search.length === 0 && sortKey === 'name_asc'}
            >
              Clear
            </button>
          </div>
        </header>

        {loans.length === 0 ? (
          <p className="empty-state">No loans added yet.</p>
        ) : (
          <>
            <div className="loan-summary-strip">
              <article className="loan-summary-card">
                <p>Total debt</p>
                <strong>{formatMoney(totalLoanBalance)}</strong>
                <small>{loans.length} active loans</small>
              </article>
              <article className="loan-summary-card">
                <p>Projected next interest</p>
                <strong>{formatMoney(totalProjectedInterest)}</strong>
                <small>if unchanged this month</small>
              </article>
              <article className="loan-summary-card">
                <p>Due in next 7 days</p>
                <strong>{dueSoonCount}</strong>
                <small>prioritize these first</small>
              </article>
              <article className="loan-summary-card">
                <p>Payment below interest</p>
                <strong>{belowInterestCount}</strong>
                <small>raises long-term payoff cost</small>
              </article>
            </div>

            <p className="subnote">
              Showing {visibleLoans.length} of {loans.length} loan{loans.length === 1 ? '' : 's'}.
            </p>

            {visibleLoans.length === 0 ? (
              <p className="empty-state">No loans match your search.</p>
            ) : (
              <div className="loan-rows">
                {visibleLoans.map((entry) => {
                  const projection = projectionsById.get(entry._id)
                  if (!projection) return null

                  const isEditing = loanEditId === entry._id
                  const isQuickOpen = quickAction?.loanId === entry._id

                  return (
                    <article key={entry._id} className="loan-row-card">
                      <header className="loan-row-head">
                        <div>
                          <h3>{entry.name}</h3>
                          <p>{projection.cadenceLabel}</p>
                        </div>
                        <div className="loan-row-pills">
                          <span className="pill pill--neutral">Day {entry.dueDay}</span>
                          {projection.apr > 0 ? <span className="pill pill--warning">APR {projection.apr.toFixed(2)}%</span> : null}
                          {projection.paymentBelowInterest ? <span className="pill pill--critical">Payment below interest</span> : null}
                          <span className="pill pill--cadence">
                            Due in {projection.dueInDays} day{projection.dueInDays === 1 ? '' : 's'}
                          </span>
                        </div>
                      </header>

                      {isEditing ? (
                        <div className="loan-row-edit-grid">
                          <label>
                            <span>Name</span>
                            <input
                              value={loanEditDraft.name}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Balance</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.balance}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, balance: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Principal</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.principalBalance}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, principalBalance: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Accrued interest</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.accruedInterest}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, accruedInterest: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Payment model</span>
                            <select
                              value={loanEditDraft.minimumPaymentType}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({
                                  ...prev,
                                  minimumPaymentType: event.target.value as LoanMinimumPaymentType,
                                  minimumPaymentPercent:
                                    event.target.value === 'percent_plus_interest'
                                      ? prev.minimumPaymentPercent || '2'
                                      : '',
                                }))
                              }
                            >
                              <option value="fixed">Fixed amount</option>
                              <option value="percent_plus_interest">% + interest</option>
                            </select>
                          </label>
                          <label>
                            <span>{loanEditDraft.minimumPaymentType === 'fixed' ? 'Minimum payment' : 'Minimum %'}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              max={loanEditDraft.minimumPaymentType === 'fixed' ? undefined : '100'}
                              value={
                                loanEditDraft.minimumPaymentType === 'fixed'
                                  ? loanEditDraft.minimumPayment
                                  : loanEditDraft.minimumPaymentPercent
                              }
                              onChange={(event) =>
                                setLoanEditDraft((prev) =>
                                  prev.minimumPaymentType === 'fixed'
                                    ? { ...prev, minimumPayment: event.target.value }
                                    : { ...prev, minimumPaymentPercent: event.target.value },
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Extra payment</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.extraPayment}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, extraPayment: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Subscription/mo</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.subscriptionCost}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, subscriptionCost: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Subscription payments left</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={loanEditDraft.subscriptionPaymentCount}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, subscriptionPaymentCount: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>APR %</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.interestRate}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, interestRate: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Due day</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              max="31"
                              value={loanEditDraft.dueDay}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, dueDay: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Frequency</span>
                            <select
                              value={loanEditDraft.cadence}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({
                                  ...prev,
                                  cadence: event.target.value as Cadence,
                                  customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                                }))
                              }
                            >
                              {cadenceOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {isCustomCadence(loanEditDraft.cadence) ? (
                            <>
                              <label>
                                <span>Custom interval</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  step="1"
                                  value={loanEditDraft.customInterval}
                                  onChange={(event) =>
                                    setLoanEditDraft((prev) => ({ ...prev, customInterval: event.target.value }))
                                  }
                                />
                              </label>
                              <label>
                                <span>Custom unit</span>
                                <select
                                  value={loanEditDraft.customUnit}
                                  onChange={(event) =>
                                    setLoanEditDraft((prev) => ({ ...prev, customUnit: event.target.value as CustomCadenceUnit }))
                                  }
                                >
                                  {customCadenceUnitOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </>
                          ) : null}
                          <label className="loan-row-edit-notes">
                            <span>Notes</span>
                            <input
                              value={loanEditDraft.notes}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="loan-row-metrics">
                          <div>
                            <p>Total outstanding</p>
                            <strong>{formatMoney(projection.totalOutstanding)}</strong>
                            <small>
                              {formatMoney(projection.principalBalance)} principal · {formatMoney(projection.accruedInterest)} interest
                              {' · '}
                              {formatMoney(projection.subscriptionOutstanding)} subscription remaining
                            </small>
                          </div>
                          <div>
                            <p>Due this cycle</p>
                            <strong>{formatMoney(projection.dueThisCycle)}</strong>
                            <small>
                              {formatMoney(projection.plannedTotalPayment)} planned ({formatMoney(toNumber(entry.extraPayment))}{' '}
                              extra)
                            </small>
                          </div>
                          <div>
                            <p>Projected next interest</p>
                            <strong>{formatMoney(projection.projectedInterest)}</strong>
                            <small>{formatMoney(projection.projectedTotalAfterPayment)} after planned payment</small>
                          </div>
                          <div>
                            <p>Subscription / month</p>
                            <strong>{formatMoney(projection.subscriptionCost)}</strong>
                            <small>
                              {projection.subscriptionPaymentsRemaining > 0
                                ? `${projection.subscriptionPaymentsRemaining} payments left`
                                : 'No schedule'}
                              {' · '}
                              {formatMoney(projection.subscriptionDueNow)} due now
                            </small>
                          </div>
                        </div>
                      )}

                      <div className="loan-row-actions">
                        {isEditing ? (
                          <>
                            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveLoanEdit()}>
                              Save
                            </button>
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => setLoanEditId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => startLoanEdit(entry)}>
                            Edit
                          </button>
                        )}

                        <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteLoan(entry._id)}>
                          Remove
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'charge' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Add charge
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'payment' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Record payment
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'interest' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Apply interest
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'subscription' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Add subscription fee
                        </button>
                      </div>

                      {isQuickOpen ? (
                        <div className="loan-quick-action">
                          <div className="loan-quick-action-grid">
                            {quickAction.type === 'charge' || quickAction.type === 'payment' ? (
                              <label>
                                <span>Amount</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  value={quickAmount}
                                  onChange={(event) => setQuickAmount(event.target.value)}
                                  required
                                />
                              </label>
                            ) : null}
                            <label>
                              <span>Notes (optional)</span>
                              <input value={quickNotes} onChange={(event) => setQuickNotes(event.target.value)} />
                            </label>
                          </div>

                          {quickAction.type === 'payment' ? (
                            <p className="form-hint">
                              Outstanding: <strong>{formatMoney(projection.totalOutstanding)}</strong> ({formatMoney(
                                projection.subscriptionOutstanding,
                              )}{' '}
                              subscription remaining, {formatMoney(projection.subscriptionDueNow)} due now +{' '}
                              {formatMoney(projection.balance)} loan balance)
                            </p>
                          ) : null}

                          {quickError ? <p className="inline-error">{quickError}</p> : null}

                          <div className="loan-quick-action-buttons">
                            <button type="button" className="btn btn-primary btn--sm" onClick={() => void submitQuickAction(entry)}>
                              {quickAction.type === 'charge'
                                ? 'Confirm charge'
                                : quickAction.type === 'payment'
                                  ? 'Confirm payment'
                                  : quickAction.type === 'interest'
                                    ? 'Apply interest now'
                                    : 'Log subscription fee'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => {
                                setQuickAction(null)
                                setQuickAmount('')
                                setQuickNotes('')
                                setQuickError(null)
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </article>
    </section>
  )
}
