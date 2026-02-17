import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { CardEditDraft, CardEntry, CardForm, CardId, CardMinimumPaymentType } from './financeTypes'

type CardSortKey =
  | 'name_asc'
  | 'current_desc'
  | 'statement_desc'
  | 'due_payment_desc'
  | 'util_desc'
  | 'limit_desc'
  | 'apr_desc'
  | 'due_asc'

type PayoffStrategy = 'avalanche' | 'snowball'

type CardsTabProps = {
  cards: CardEntry[]
  monthlyCardSpend: number
  cardLimitTotal: number
  cardUsedTotal: number
  cardUtilizationPercent: number
  cardForm: CardForm
  setCardForm: Dispatch<SetStateAction<CardForm>>
  cardEditId: CardId | null
  setCardEditId: Dispatch<SetStateAction<CardId | null>>
  cardEditDraft: CardEditDraft
  setCardEditDraft: Dispatch<SetStateAction<CardEditDraft>>
  onAddCard: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteCard: (id: CardId) => Promise<void>
  saveCardEdit: () => Promise<void>
  startCardEdit: (entry: CardEntry) => void
  formatMoney: (value: number) => string
  formatPercent: (value: number) => string
}

type CardCycleProjection = {
  limit: number
  currentInput: number
  statementInput: number
  pendingCharges: number
  minimumPaymentType: CardMinimumPaymentType
  minimumPaymentPercent: number
  configuredMinimumPayment: number
  extraPayment: number
  interestAmount: number
  newStatementBalance: number
  minimumDue: number
  plannedPayment: number
  dueAdjustedCurrent: number
  projectedNextMonthInterest: number
  projectedUtilizationAfterPayment: number
  projected12MonthInterestCost: number
  displayCurrentBalance: number
  displayAvailableCredit: number
  displayUtilization: number
  dueDay: number
  dueApplied: boolean
  plannedSpend: number
}

type PayoffCard = {
  id: CardId
  name: string
  balance: number
  apr: number
  monthlyInterest: number
  utilization: number
  minimumDue: number
  plannedPayment: number
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const toNonNegativeNumber = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : 0

const toDayOfMonth = (value: number | undefined | null, fallback: number) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31) {
    return value
  }
  return fallback
}

const utilizationFor = (used: number, limit: number) => (limit > 0 ? used / limit : 0)
const normalizeCardMinimumPaymentType = (value: CardMinimumPaymentType | undefined | null): CardMinimumPaymentType =>
  value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed'
const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)
const describeMinimumConfig = (projection: CardCycleProjection) =>
  projection.minimumPaymentType === 'percent_plus_interest'
    ? `${projection.minimumPaymentPercent.toFixed(2)}% + interest`
    : `Fixed ${projection.configuredMinimumPayment.toFixed(2)}`
const getOverpayPriority = (entry: PayoffCard, strategy: PayoffStrategy) =>
  strategy === 'avalanche' ? entry.apr : -entry.balance

const rankPayoffCards = (rows: PayoffCard[], strategy: PayoffStrategy) =>
  [...rows].sort((left, right) => {
    if (strategy === 'avalanche') {
      if (right.apr !== left.apr) {
        return right.apr - left.apr
      }
      if (right.monthlyInterest !== left.monthlyInterest) {
        return right.monthlyInterest - left.monthlyInterest
      }
      if (right.balance !== left.balance) {
        return right.balance - left.balance
      }
    } else {
      if (left.balance !== right.balance) {
        return left.balance - right.balance
      }
      if (right.apr !== left.apr) {
        return right.apr - left.apr
      }
      if (right.monthlyInterest !== left.monthlyInterest) {
        return right.monthlyInterest - left.monthlyInterest
      }
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })

const projectInterestForecast = (input: {
  statementStart: number
  monthlyRate: number
  minimumPaymentType: CardMinimumPaymentType
  configuredMinimumPayment: number
  minimumPaymentPercent: number
  extraPayment: number
  plannedSpend: number
  months: number
}) => {
  let statementBalance = Math.max(input.statementStart, 0)
  let nextMonthInterest = 0
  let totalInterest = 0

  for (let month = 0; month < input.months; month += 1) {
    const interest = statementBalance * input.monthlyRate
    if (month === 0) {
      nextMonthInterest = interest
    }

    const dueBalance = statementBalance + interest
    const minimumDueRaw =
      input.minimumPaymentType === 'percent_plus_interest'
        ? statementBalance * (input.minimumPaymentPercent / 100) + interest
        : input.configuredMinimumPayment
    const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
    const plannedPayment = Math.min(dueBalance, minimumDue + input.extraPayment)
    const carriedAfterDue = dueBalance - plannedPayment
    statementBalance = carriedAfterDue + input.plannedSpend
    totalInterest += interest
  }

  return {
    nextMonthInterest: roundCurrency(nextMonthInterest),
    totalInterest: roundCurrency(totalInterest),
  }
}

const projectCardCycle = (
  input: {
    creditLimit: number
    usedLimit: number
    statementBalance?: number
    pendingCharges?: number
    minimumPayment: number
    minimumPaymentType?: CardMinimumPaymentType
    minimumPaymentPercent?: number
    extraPayment?: number
    spendPerMonth: number
    interestRate?: number
    dueDay?: number
  },
  todayDay: number,
): CardCycleProjection => {
  const limit = toNonNegativeNumber(input.creditLimit)
  const currentInput = toNonNegativeNumber(input.usedLimit)
  const statementInput = toNonNegativeNumber(input.statementBalance ?? input.usedLimit)
  const pendingCharges = toNonNegativeNumber(input.pendingCharges ?? Math.max(currentInput - statementInput, 0))
  const minimumPayment = toNonNegativeNumber(input.minimumPayment)
  const minimumPaymentType = normalizeCardMinimumPaymentType(input.minimumPaymentType)
  const minimumPaymentPercent = clampPercent(toNonNegativeNumber(input.minimumPaymentPercent))
  const extraPayment = toNonNegativeNumber(input.extraPayment)
  const plannedSpend = toNonNegativeNumber(input.spendPerMonth)
  const apr = toNonNegativeNumber(input.interestRate)
  const dueDay = toDayOfMonth(input.dueDay, 21)

  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = roundCurrency(statementInput * monthlyRate)
  const newStatementBalance = roundCurrency(statementInput + interestAmount)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? statementInput * (minimumPaymentPercent / 100) + interestAmount
      : minimumPayment
  const minimumDue = roundCurrency(Math.min(newStatementBalance, Math.max(minimumDueRaw, 0)))
  const plannedPayment = roundCurrency(Math.min(newStatementBalance, minimumDue + extraPayment))
  const dueAdjustedCurrent = roundCurrency(Math.max(newStatementBalance - plannedPayment, 0) + pendingCharges)
  const projectedUtilizationAfterPayment = utilizationFor(dueAdjustedCurrent, limit)
  const interestForecast = projectInterestForecast({
    statementStart: dueAdjustedCurrent,
    monthlyRate,
    minimumPaymentType,
    configuredMinimumPayment: minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    plannedSpend,
    months: 12,
  })
  const dueApplied = todayDay >= dueDay
  const displayCurrentBalance = dueApplied ? dueAdjustedCurrent : currentInput
  const displayAvailableCredit = roundCurrency(limit - displayCurrentBalance)
  const displayUtilization = utilizationFor(displayCurrentBalance, limit)

  return {
    limit,
    currentInput,
    statementInput,
    pendingCharges,
    minimumPaymentType,
    minimumPaymentPercent,
    configuredMinimumPayment: minimumPayment,
    extraPayment,
    interestAmount,
    newStatementBalance,
    minimumDue,
    plannedPayment,
    dueAdjustedCurrent,
    projectedNextMonthInterest: interestForecast.nextMonthInterest,
    projectedUtilizationAfterPayment,
    projected12MonthInterestCost: interestForecast.totalInterest,
    displayCurrentBalance: roundCurrency(displayCurrentBalance),
    displayAvailableCredit,
    displayUtilization,
    dueDay,
    dueApplied,
    plannedSpend,
  }
}

export function CardsTab({
  cards,
  monthlyCardSpend,
  cardLimitTotal,
  cardUsedTotal,
  cardUtilizationPercent,
  cardForm,
  setCardForm,
  cardEditId,
  setCardEditId,
  cardEditDraft,
  setCardEditDraft,
  onAddCard,
  onDeleteCard,
  saveCardEdit,
  startCardEdit,
  formatMoney,
  formatPercent,
}: CardsTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<CardSortKey>('name_asc')
  const [payoffStrategy, setPayoffStrategy] = useState<PayoffStrategy>('avalanche')
  const todayDay = new Date().getDate()

  const pillVariantForUtil = (ratio: number) => {
    if (ratio >= 0.9) return 'pill--critical'
    if (ratio >= 0.5) return 'pill--warning'
    return 'pill--good'
  }

  const cardRows = useMemo(
    () =>
      cards.map((entry) => ({
        entry,
        projection: projectCardCycle(
          {
            creditLimit: entry.creditLimit,
            usedLimit: entry.usedLimit,
            statementBalance: entry.statementBalance,
            pendingCharges: entry.pendingCharges,
            minimumPayment: entry.minimumPayment,
            minimumPaymentType: entry.minimumPaymentType,
            minimumPaymentPercent: entry.minimumPaymentPercent,
            extraPayment: entry.extraPayment,
            spendPerMonth: entry.spendPerMonth,
            interestRate: entry.interestRate,
            dueDay: entry.dueDay,
          },
          todayDay,
        ),
      })),
    [cards, todayDay],
  )

  const estimatedMinimumDueTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.minimumDue, 0),
    [cardRows],
  )
  const plannedPaymentTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.plannedPayment, 0),
    [cardRows],
  )
  const pendingChargesTotal = useMemo(() => cardRows.reduce((sum, row) => sum + row.projection.pendingCharges, 0), [cardRows])
  const newStatementsTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.newStatementBalance, 0),
    [cardRows],
  )
  const dueAdjustedCurrentTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.displayCurrentBalance, 0),
    [cardRows],
  )
  const projectedPostPaymentBalanceTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.dueAdjustedCurrent, 0),
    [cardRows],
  )
  const availableCreditTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.displayAvailableCredit, 0),
    [cardRows],
  )
  const projectedNextMonthInterestTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.projectedNextMonthInterest, 0),
    [cardRows],
  )
  const projected12MonthInterestTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.projected12MonthInterestCost, 0),
    [cardRows],
  )

  const dueAdjustedUtilizationPercent = cardLimitTotal > 0 ? dueAdjustedCurrentTotal / cardLimitTotal : 0
  const projectedUtilizationAfterPaymentPortfolio =
    cardLimitTotal > 0 ? projectedPostPaymentBalanceTotal / cardLimitTotal : 0

  const payoffCards = useMemo<PayoffCard[]>(
    () =>
      cardRows
        .map(({ entry, projection }) => {
          const balance = roundCurrency(Math.max(projection.displayCurrentBalance, 0))
          const apr = toNonNegativeNumber(entry.interestRate)
          return {
            id: entry._id,
            name: entry.name,
            balance,
            apr,
            monthlyInterest: roundCurrency(projection.interestAmount),
            utilization: projection.displayUtilization,
            minimumDue: roundCurrency(projection.minimumDue),
            plannedPayment: roundCurrency(projection.plannedPayment),
          }
        })
        .filter((entry) => entry.balance > 0),
    [cardRows],
  )

  const avalancheRanking = useMemo(() => rankPayoffCards(payoffCards, 'avalanche'), [payoffCards])
  const snowballRanking = useMemo(() => rankPayoffCards(payoffCards, 'snowball'), [payoffCards])
  const selectedPayoffRanking = payoffStrategy === 'avalanche' ? avalancheRanking : snowballRanking
  const selectedPayoffTarget = selectedPayoffRanking[0] ?? null
  const selectedPayoffBackup = selectedPayoffRanking[1] ?? null

  const extraPaymentsPool = useMemo(
    () => cardRows.reduce((sum, row) => sum + roundCurrency(Math.max(row.projection.extraPayment, 0)), 0),
    [cardRows],
  )

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query ? cardRows.filter(({ entry }) => entry.name.toLowerCase().includes(query)) : cardRows.slice()

    const sorted = [...filtered].sort((a, b) => {
      const left = a.projection
      const right = b.projection

      switch (sortKey) {
        case 'name_asc':
          return a.entry.name.localeCompare(b.entry.name, undefined, { sensitivity: 'base' })
        case 'current_desc':
          return right.displayCurrentBalance - left.displayCurrentBalance
        case 'statement_desc':
          return right.newStatementBalance - left.newStatementBalance
        case 'due_payment_desc':
          return right.plannedPayment - left.plannedPayment
        case 'util_desc':
          return right.displayUtilization - left.displayUtilization
        case 'limit_desc':
          return b.entry.creditLimit - a.entry.creditLimit
        case 'apr_desc':
          return (b.entry.interestRate ?? -1) - (a.entry.interestRate ?? -1)
        case 'due_asc':
          return (a.entry.dueDay ?? 99) - (b.entry.dueDay ?? 99)
        default:
          return 0
      }
    })

    return sorted
  }, [cardRows, search, sortKey])

  return (
    <section className="editor-grid editor-grid--cards" aria-label="Card management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Cards</p>
            <h2>Add card</h2>
            <p className="panel-value">
              {cards.length} card{cards.length === 1 ? '' : 's'} · {formatMoney(dueAdjustedCurrentTotal)} due-adjusted current
            </p>
            <p className="subnote">
              {formatMoney(newStatementsTotal)} new statements · {formatMoney(pendingChargesTotal)} pending charges
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddCard} aria-describedby="card-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="card-name">Card name</label>
              <input
                id="card-name"
                value={cardForm.name}
                onChange={(event) => setCardForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-limit">Credit limit</label>
              <input
                id="card-limit"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={cardForm.creditLimit}
                onChange={(event) => setCardForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-used">Current balance</label>
              <input
                id="card-used"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cardForm.usedLimit}
                onChange={(event) => setCardForm((prev) => ({ ...prev, usedLimit: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-statement-balance">Statement balance</label>
              <input
                id="card-statement-balance"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cardForm.statementBalance}
                onChange={(event) => setCardForm((prev) => ({ ...prev, statementBalance: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-pending-charges">Pending charges</label>
              <input
                id="card-pending-charges"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cardForm.pendingCharges}
                onChange={(event) => setCardForm((prev) => ({ ...prev, pendingCharges: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-payment-type">Minimum payment mode</label>
              <select
                id="card-payment-type"
                value={cardForm.minimumPaymentType}
                onChange={(event) =>
                  setCardForm((prev) => ({
                    ...prev,
                    minimumPaymentType: event.target.value as CardMinimumPaymentType,
                  }))
                }
              >
                <option value="fixed">Fixed amount</option>
                <option value="percent_plus_interest">% + interest</option>
              </select>
            </div>

            {cardForm.minimumPaymentType === 'fixed' ? (
              <div className="form-field">
                <label htmlFor="card-payment">Minimum payment</label>
                <input
                  id="card-payment"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={cardForm.minimumPayment}
                  onChange={(event) => setCardForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                  required
                />
              </div>
            ) : (
              <div className="form-field">
                <label htmlFor="card-payment-percent">Minimum % of statement</label>
                <input
                  id="card-payment-percent"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  value={cardForm.minimumPaymentPercent}
                  onChange={(event) =>
                    setCardForm((prev) => ({
                      ...prev,
                      minimumPaymentPercent: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="card-extra-payment">Extra payment</label>
              <input
                id="card-extra-payment"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cardForm.extraPayment}
                onChange={(event) => setCardForm((prev) => ({ ...prev, extraPayment: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-spend">Planned monthly spend</label>
              <input
                id="card-spend"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={cardForm.spendPerMonth}
                onChange={(event) => setCardForm((prev) => ({ ...prev, spendPerMonth: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-statement-day">Statement day (1-31)</label>
              <input
                id="card-statement-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                step="1"
                value={cardForm.statementDay}
                onChange={(event) => setCardForm((prev) => ({ ...prev, statementDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="card-due-day">Payment due day (1-31)</label>
              <input
                id="card-due-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                step="1"
                value={cardForm.dueDay}
                onChange={(event) => setCardForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="card-apr">APR %</label>
              <input
                id="card-apr"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={cardForm.interestRate}
                onChange={(event) => setCardForm((prev) => ({ ...prev, interestRate: event.target.value }))}
              />
            </div>
          </div>

          <p id="card-form-hint" className="form-hint">
            New statement = statement balance + APR monthly interest. Payment can be fixed or % + interest, with optional extra payment.
            On/after due day, current/available/utilization use statement minus planned payment, plus pending charges.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add card
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list panel-list--cards">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Cards</p>
            <h2>Current entries</h2>
            <p className="panel-value">
              {formatMoney(dueAdjustedCurrentTotal)} due-adjusted current · {formatPercent(dueAdjustedUtilizationPercent)} util
            </p>
            <p className="subnote">
              {formatMoney(newStatementsTotal)} new statements · {formatMoney(plannedPaymentTotal)} total planned payments
            </p>
            <p className="subnote">
              {formatMoney(projectedNextMonthInterestTotal)} projected next-month interest ·{' '}
              {formatPercent(projectedUtilizationAfterPaymentPortfolio)} projected utilization after payment ·{' '}
              {formatMoney(projected12MonthInterestTotal)} projected 12-month interest cost
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search cards"
              placeholder="Search cards…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort cards" value={sortKey} onChange={(event) => setSortKey(event.target.value as CardSortKey)}>
              <option value="name_asc">Name (A-Z)</option>
              <option value="current_desc">Current balance (high-low)</option>
              <option value="statement_desc">New statement (high-low)</option>
              <option value="due_payment_desc">Planned payment (high-low)</option>
              <option value="util_desc">Utilization (high-low)</option>
              <option value="limit_desc">Limit (high-low)</option>
              <option value="apr_desc">APR (high-low)</option>
              <option value="due_asc">Due day (soonest)</option>
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

        {cards.length === 0 ? (
          <p className="empty-state">No cards added yet.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleRows.length} of {cards.length} card{cards.length === 1 ? '' : 's'} ·{' '}
              {formatMoney(estimatedMinimumDueTotal)} estimated minimum due · {formatMoney(monthlyCardSpend)} modeled payments/mo
            </p>
            <p className="subnote">
              Pending charges {formatMoney(pendingChargesTotal)} · Available credit {formatMoney(availableCreditTotal)} · Baseline{' '}
              {formatMoney(cardUsedTotal)} current / {formatPercent(cardUtilizationPercent / 100)} util
            </p>

            <section className="cards-payoff-intel" aria-label="Payoff intelligence">
              <header className="cards-payoff-head">
                <div>
                  <p className="panel-kicker">Payoff intelligence</p>
                  <h3>Avalanche vs snowball</h3>
                </div>
                <div className="cards-payoff-toggle" role="tablist" aria-label="Payoff strategy">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={payoffStrategy === 'avalanche'}
                    className={`btn btn--sm ${payoffStrategy === 'avalanche' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPayoffStrategy('avalanche')}
                  >
                    Avalanche
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={payoffStrategy === 'snowball'}
                    className={`btn btn--sm ${payoffStrategy === 'snowball' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPayoffStrategy('snowball')}
                  >
                    Snowball
                  </button>
                </div>
              </header>

              {selectedPayoffTarget ? (
                <div className="cards-payoff-grid">
                  <article className="cards-payoff-card cards-payoff-card--recommended">
                    <p>Recommended next card to overpay</p>
                    <strong>{selectedPayoffTarget.name}</strong>
                    <small>
                      {payoffStrategy === 'avalanche' ? 'Highest APR first' : 'Smallest balance first'} · priority{' '}
                      {getOverpayPriority(selectedPayoffTarget, payoffStrategy).toFixed(2)}
                    </small>
                    <small>
                      {formatMoney(selectedPayoffTarget.balance)} balance · APR {selectedPayoffTarget.apr.toFixed(2)}%
                    </small>
                    <small>
                      {formatMoney(selectedPayoffTarget.minimumDue)} minimum due · {formatMoney(selectedPayoffTarget.plannedPayment)} planned
                      payment
                    </small>
                    <small>
                      {formatMoney(selectedPayoffTarget.monthlyInterest)} est. monthly interest ·{' '}
                      {formatPercent(selectedPayoffTarget.utilization)} util
                    </small>
                    {selectedPayoffBackup ? (
                      <small>
                        Backup target: {selectedPayoffBackup.name} ({formatMoney(selectedPayoffBackup.balance)} /{' '}
                        {selectedPayoffBackup.apr.toFixed(2)}% APR)
                      </small>
                    ) : null}
                  </article>

                  <article className="cards-payoff-card">
                    <p>Avalanche target</p>
                    <strong>{avalancheRanking[0]?.name ?? 'n/a'}</strong>
                    <small>
                      {avalancheRanking[0]
                        ? `${formatMoney(avalancheRanking[0].balance)} · ${avalancheRanking[0].apr.toFixed(2)}% APR`
                        : 'No open card balances'}
                    </small>
                    <small>Optimizes for lower total interest over time.</small>
                  </article>

                  <article className="cards-payoff-card">
                    <p>Snowball target</p>
                    <strong>{snowballRanking[0]?.name ?? 'n/a'}</strong>
                    <small>
                      {snowballRanking[0]
                        ? `${formatMoney(snowballRanking[0].balance)} · ${snowballRanking[0].apr.toFixed(2)}% APR`
                        : 'No open card balances'}
                    </small>
                    <small>Optimizes for faster wins and account count reduction.</small>
                  </article>
                </div>
              ) : (
                <p className="subnote">All cards are fully paid. No overpay target right now.</p>
              )}

              <p className="subnote">
                Current extra-payment pool configured on cards: {formatMoney(extraPaymentsPool)} per month.
              </p>
            </section>

            {visibleRows.length === 0 ? (
              <p className="empty-state">No cards match your search.</p>
            ) : (
              <>
                <div className="cards-desktop-table">
                  <div className="table-wrap table-wrap--card">
                    <table className="data-table data-table--cards" data-testid="cards-table">
                      <caption className="sr-only">Card entries</caption>
                      <colgroup>
                        <col className="cards-col cards-col--card" />
                        <col className="cards-col cards-col--balances" />
                        <col className="cards-col cards-col--cycle" />
                        <col className="cards-col cards-col--exposure" />
                        <col className="cards-col cards-col--plan" />
                        <col className="cards-col cards-col--actions" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Card</th>
                          <th scope="col">Balances</th>
                          <th scope="col">Due Cycle</th>
                          <th scope="col">Exposure</th>
                          <th scope="col">Plan</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map(({ entry, projection }) => {
                          const isEditing = cardEditId === entry._id

                          const draftLimit = Number.parseFloat(cardEditDraft.creditLimit)
                          const draftUsed = Number.parseFloat(cardEditDraft.usedLimit)
                          const draftStatementBalance = Number.parseFloat(cardEditDraft.statementBalance)
                          const draftPending = Number.parseFloat(cardEditDraft.pendingCharges)
                          const draftMinPayment = Number.parseFloat(cardEditDraft.minimumPayment)
                          const draftMinPercent = Number.parseFloat(cardEditDraft.minimumPaymentPercent)
                          const draftExtraPayment = Number.parseFloat(cardEditDraft.extraPayment)
                          const draftSpend = Number.parseFloat(cardEditDraft.spendPerMonth)
                          const draftApr = Number.parseFloat(cardEditDraft.interestRate)
                          const draftDueDay = Number.parseInt(cardEditDraft.dueDay, 10)
                          const draftMinimumPaymentType = normalizeCardMinimumPaymentType(cardEditDraft.minimumPaymentType)

                          const editProjection = projectCardCycle(
                            {
                              creditLimit: Number.isFinite(draftLimit) ? draftLimit : 0,
                              usedLimit: Number.isFinite(draftUsed) ? draftUsed : 0,
                              statementBalance: Number.isFinite(draftStatementBalance) ? draftStatementBalance : undefined,
                              pendingCharges: Number.isFinite(draftPending) ? draftPending : undefined,
                              minimumPayment: Number.isFinite(draftMinPayment) ? draftMinPayment : 0,
                              minimumPaymentType: draftMinimumPaymentType,
                              minimumPaymentPercent: Number.isFinite(draftMinPercent) ? draftMinPercent : undefined,
                              extraPayment: Number.isFinite(draftExtraPayment) ? draftExtraPayment : undefined,
                              spendPerMonth: Number.isFinite(draftSpend) ? draftSpend : 0,
                              interestRate: Number.isFinite(draftApr) ? draftApr : undefined,
                              dueDay: Number.isFinite(draftDueDay) ? draftDueDay : undefined,
                            },
                            todayDay,
                          )

                          const rowProjection = isEditing ? editProjection : projection
                          const availableClass = rowProjection.displayAvailableCredit < 0 ? 'amount-negative' : 'amount-positive'

                          return (
                            <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="inline-input"
                                    value={cardEditDraft.name}
                                    onChange={(event) =>
                                      setCardEditDraft((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <div className="cell-stack">
                                    <strong>{entry.name}</strong>
                                    <small>{formatMoney(entry.creditLimit)} limit</small>
                                  </div>
                                )}
                              </td>

                              <td>
                                {isEditing ? (
                                  <div className="cell-stack">
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="Current"
                                      value={cardEditDraft.usedLimit}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          usedLimit: event.target.value,
                                        }))
                                      }
                                    />
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="Statement"
                                      value={cardEditDraft.statementBalance}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          statementBalance: event.target.value,
                                        }))
                                      }
                                    />
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="Pending"
                                      value={cardEditDraft.pendingCharges}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          pendingCharges: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                ) : (
                                  <div className="cell-stack">
                                    <small>Current {formatMoney(rowProjection.displayCurrentBalance)}</small>
                                    <small>Statement {formatMoney(rowProjection.statementInput)}</small>
                                    <small>Pending {formatMoney(rowProjection.pendingCharges)}</small>
                                    <small>New statement {formatMoney(rowProjection.newStatementBalance)}</small>
                                  </div>
                                )}
                              </td>

                              <td>
                                {isEditing ? (
                                  <div className="cell-stack">
                                    <select
                                      className="inline-select"
                                      value={cardEditDraft.minimumPaymentType}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          minimumPaymentType: event.target.value as CardMinimumPaymentType,
                                        }))
                                      }
                                    >
                                      <option value="fixed">Fixed minimum</option>
                                      <option value="percent_plus_interest">% + interest</option>
                                    </select>
                                    {cardEditDraft.minimumPaymentType === 'fixed' ? (
                                      <input
                                        className="inline-input"
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        placeholder="Minimum payment"
                                        value={cardEditDraft.minimumPayment}
                                        onChange={(event) =>
                                          setCardEditDraft((prev) => ({
                                            ...prev,
                                            minimumPayment: event.target.value,
                                          }))
                                        }
                                      />
                                    ) : (
                                      <input
                                        className="inline-input"
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        placeholder="Minimum %"
                                        value={cardEditDraft.minimumPaymentPercent}
                                        onChange={(event) =>
                                          setCardEditDraft((prev) => ({
                                            ...prev,
                                            minimumPaymentPercent: event.target.value,
                                          }))
                                        }
                                      />
                                    )}
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="Extra payment"
                                      value={cardEditDraft.extraPayment}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          extraPayment: event.target.value,
                                        }))
                                      }
                                    />
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="numeric"
                                      min="1"
                                      max="31"
                                      step="1"
                                      placeholder="Statement day"
                                      value={cardEditDraft.statementDay}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          statementDay: event.target.value,
                                        }))
                                      }
                                    />
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="numeric"
                                      min="1"
                                      max="31"
                                      step="1"
                                      placeholder="Due day"
                                      value={cardEditDraft.dueDay}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          dueDay: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                ) : (
                                  <div className="cell-stack">
                                    <small>Min due {formatMoney(rowProjection.minimumDue)}</small>
                                    <small>{describeMinimumConfig(rowProjection)}</small>
                                    <small>Extra payment {formatMoney(rowProjection.extraPayment)}</small>
                                    <small>Planned payment {formatMoney(rowProjection.plannedPayment)}</small>
                                    <small>Due day {rowProjection.dueDay}</small>
                                    <small>{rowProjection.dueApplied ? 'Due applied this month' : 'Due pending this month'}</small>
                                    <small>Statement day {entry.statementDay ?? 1}</small>
                                  </div>
                                )}
                              </td>

                              <td>
                                {isEditing ? (
                                  <div className="cell-stack">
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="APR"
                                      value={cardEditDraft.interestRate}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          interestRate: event.target.value,
                                        }))
                                      }
                                    />
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0.01"
                                      step="0.01"
                                      placeholder="Limit"
                                      value={cardEditDraft.creditLimit}
                                      onChange={(event) =>
                                        setCardEditDraft((prev) => ({
                                          ...prev,
                                          creditLimit: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                ) : (
                                  <div className="cell-stack">
                                    <small className={availableClass}>Available {formatMoney(rowProjection.displayAvailableCredit)}</small>
                                    <span className={`pill ${pillVariantForUtil(rowProjection.displayUtilization)}`}>
                                      Util {formatPercent(rowProjection.displayUtilization)}
                                    </span>
                                    <small>APR {entry.interestRate !== undefined ? `${entry.interestRate.toFixed(2)}%` : 'n/a'}</small>
                                    <small>Current-cycle interest {formatMoney(rowProjection.interestAmount)}</small>
                                    <small>Projected next-month interest {formatMoney(rowProjection.projectedNextMonthInterest)}</small>
                                    <small>
                                      Projected util after payment {formatPercent(rowProjection.projectedUtilizationAfterPayment)}
                                    </small>
                                    <small>Projected 12-month interest {formatMoney(rowProjection.projected12MonthInterestCost)}</small>
                                  </div>
                                )}
                              </td>

                              <td>
                                {isEditing ? (
                                  <input
                                    className="inline-input"
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="0.01"
                                    value={cardEditDraft.spendPerMonth}
                                    onChange={(event) =>
                                      setCardEditDraft((prev) => ({
                                        ...prev,
                                        spendPerMonth: event.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <div className="cell-stack">
                                    <small>Planned spend {formatMoney(rowProjection.plannedSpend)}</small>
                                    <small>Planned payment {formatMoney(rowProjection.plannedPayment)}</small>
                                    <small>Due-adjusted current {formatMoney(rowProjection.dueAdjustedCurrent)}</small>
                                  </div>
                                )}
                              </td>

                              <td>
                                <div className="row-actions row-actions--cards">
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn--sm"
                                        onClick={() => void saveCardEdit()}
                                      >
                                        Save
                                      </button>
                                      <button type="button" className="btn btn-ghost btn--sm" onClick={() => setCardEditId(null)}>
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn--sm"
                                      onClick={() => startCardEdit(entry)}
                                    >
                                      Edit
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn--sm"
                                    onClick={() => void onDeleteCard(entry._id)}
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
                </div>

                <div className="cards-mobile-list" aria-label="Cards mobile view">
                  {visibleRows.map(({ entry, projection }) => {
                    const isEditing = cardEditId === entry._id

                    const draftLimit = Number.parseFloat(cardEditDraft.creditLimit)
                    const draftUsed = Number.parseFloat(cardEditDraft.usedLimit)
                    const draftStatementBalance = Number.parseFloat(cardEditDraft.statementBalance)
                    const draftPending = Number.parseFloat(cardEditDraft.pendingCharges)
                    const draftMinPayment = Number.parseFloat(cardEditDraft.minimumPayment)
                    const draftMinPercent = Number.parseFloat(cardEditDraft.minimumPaymentPercent)
                    const draftExtraPayment = Number.parseFloat(cardEditDraft.extraPayment)
                    const draftSpend = Number.parseFloat(cardEditDraft.spendPerMonth)
                    const draftApr = Number.parseFloat(cardEditDraft.interestRate)
                    const draftDueDay = Number.parseInt(cardEditDraft.dueDay, 10)
                    const draftMinimumPaymentType = normalizeCardMinimumPaymentType(cardEditDraft.minimumPaymentType)

                    const editProjection = projectCardCycle(
                      {
                        creditLimit: Number.isFinite(draftLimit) ? draftLimit : 0,
                        usedLimit: Number.isFinite(draftUsed) ? draftUsed : 0,
                        statementBalance: Number.isFinite(draftStatementBalance) ? draftStatementBalance : undefined,
                        pendingCharges: Number.isFinite(draftPending) ? draftPending : undefined,
                        minimumPayment: Number.isFinite(draftMinPayment) ? draftMinPayment : 0,
                        minimumPaymentType: draftMinimumPaymentType,
                        minimumPaymentPercent: Number.isFinite(draftMinPercent) ? draftMinPercent : undefined,
                        extraPayment: Number.isFinite(draftExtraPayment) ? draftExtraPayment : undefined,
                        spendPerMonth: Number.isFinite(draftSpend) ? draftSpend : 0,
                        interestRate: Number.isFinite(draftApr) ? draftApr : undefined,
                        dueDay: Number.isFinite(draftDueDay) ? draftDueDay : undefined,
                      },
                      todayDay,
                    )

                    const rowProjection = isEditing ? editProjection : projection
                    const availableClass = rowProjection.displayAvailableCredit < 0 ? 'amount-negative' : 'amount-positive'

                    return (
                      <details
                        key={entry._id}
                        className={`cards-mobile-item ${isEditing ? 'cards-mobile-item--editing' : ''}`}
                        open={isEditing ? true : undefined}
                      >
                        <summary className="cards-mobile-summary">
                          <div className="cards-mobile-summary-main">
                            <strong>{entry.name}</strong>
                            <small>
                              {formatMoney(entry.creditLimit)} limit · due day {rowProjection.dueDay}
                            </small>
                          </div>
                          <div className="cards-mobile-summary-metrics">
                            <span className="cards-mobile-amount">{formatMoney(rowProjection.displayCurrentBalance)}</span>
                            <span className={`pill ${pillVariantForUtil(rowProjection.displayUtilization)}`}>
                              Util {formatPercent(rowProjection.displayUtilization)}
                            </span>
                          </div>
                        </summary>

                        <div className="cards-mobile-content">
                          {isEditing ? (
                            <div className="cards-mobile-edit-grid">
                              <label className="cards-mobile-edit-field">
                                <span>Card name</span>
                                <input
                                  className="inline-input"
                                  value={cardEditDraft.name}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Credit limit</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  value={cardEditDraft.creditLimit}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      creditLimit: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Current balance</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.usedLimit}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      usedLimit: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Statement balance</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.statementBalance}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      statementBalance: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Pending charges</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.pendingCharges}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      pendingCharges: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Minimum mode</span>
                                <select
                                  className="inline-select"
                                  value={cardEditDraft.minimumPaymentType}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      minimumPaymentType: event.target.value as CardMinimumPaymentType,
                                    }))
                                  }
                                >
                                  <option value="fixed">Fixed minimum</option>
                                  <option value="percent_plus_interest">% + interest</option>
                                </select>
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>{cardEditDraft.minimumPaymentType === 'fixed' ? 'Minimum payment' : 'Minimum %'}</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  max={cardEditDraft.minimumPaymentType === 'fixed' ? undefined : '100'}
                                  step="0.01"
                                  value={
                                    cardEditDraft.minimumPaymentType === 'fixed'
                                      ? cardEditDraft.minimumPayment
                                      : cardEditDraft.minimumPaymentPercent
                                  }
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      ...(prev.minimumPaymentType === 'fixed'
                                        ? { minimumPayment: event.target.value }
                                        : { minimumPaymentPercent: event.target.value }),
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Extra payment</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.extraPayment}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      extraPayment: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Planned monthly spend</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.spendPerMonth}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      spendPerMonth: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>APR %</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.interestRate}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      interestRate: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Statement day</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max="31"
                                  step="1"
                                  value={cardEditDraft.statementDay}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      statementDay: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="cards-mobile-edit-field">
                                <span>Due day</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max="31"
                                  step="1"
                                  value={cardEditDraft.dueDay}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      dueDay: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="cards-mobile-grid">
                              <div>
                                <span>Current</span>
                                <strong>{formatMoney(rowProjection.displayCurrentBalance)}</strong>
                              </div>
                              <div>
                                <span>Statement</span>
                                <strong>{formatMoney(rowProjection.statementInput)}</strong>
                              </div>
                              <div>
                                <span>Pending</span>
                                <strong>{formatMoney(rowProjection.pendingCharges)}</strong>
                              </div>
                              <div>
                                <span>New statement</span>
                                <strong>{formatMoney(rowProjection.newStatementBalance)}</strong>
                              </div>
                              <div>
                                <span>Min due</span>
                                <strong>{formatMoney(rowProjection.minimumDue)}</strong>
                              </div>
                              <div>
                                <span>Min config</span>
                                <strong>{describeMinimumConfig(rowProjection)}</strong>
                              </div>
                              <div>
                                <span>Extra payment</span>
                                <strong>{formatMoney(rowProjection.extraPayment)}</strong>
                              </div>
                              <div>
                                <span>Planned payment</span>
                                <strong>{formatMoney(rowProjection.plannedPayment)}</strong>
                              </div>
                              <div>
                                <span>Available</span>
                                <strong className={availableClass}>{formatMoney(rowProjection.displayAvailableCredit)}</strong>
                              </div>
                              <div>
                                <span>APR</span>
                                <strong>{entry.interestRate !== undefined ? `${entry.interestRate.toFixed(2)}%` : 'n/a'}</strong>
                              </div>
                              <div>
                                <span>Interest</span>
                                <strong>{formatMoney(rowProjection.interestAmount)}</strong>
                              </div>
                              <div>
                                <span>Next-month interest</span>
                                <strong>{formatMoney(rowProjection.projectedNextMonthInterest)}</strong>
                              </div>
                              <div>
                                <span>Post-pay util</span>
                                <strong>{formatPercent(rowProjection.projectedUtilizationAfterPayment)}</strong>
                              </div>
                              <div>
                                <span>12m interest</span>
                                <strong>{formatMoney(rowProjection.projected12MonthInterestCost)}</strong>
                              </div>
                              <div>
                                <span>Planned spend</span>
                                <strong>{formatMoney(rowProjection.plannedSpend)}</strong>
                              </div>
                              <div>
                                <span>Due-adjusted current</span>
                                <strong>{formatMoney(rowProjection.dueAdjustedCurrent)}</strong>
                              </div>
                            </div>
                          )}

                          <div className="row-actions row-actions--cards-mobile">
                            {isEditing ? (
                              <>
                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveCardEdit()}>
                                  Save
                                </button>
                                <button type="button" className="btn btn-ghost btn--sm" onClick={() => setCardEditId(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startCardEdit(entry)}>
                                Edit
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteCard(entry._id)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      </details>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </article>
    </section>
  )
}
