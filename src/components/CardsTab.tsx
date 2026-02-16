import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { CardEditDraft, CardEntry, CardForm, CardId } from './financeTypes'

type CardSortKey =
  | 'name_asc'
  | 'current_desc'
  | 'statement_desc'
  | 'due_payment_desc'
  | 'util_desc'
  | 'limit_desc'
  | 'apr_desc'
  | 'due_asc'

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
  interestAmount: number
  newStatementBalance: number
  minimumDue: number
  dueAdjustedCurrent: number
  displayCurrentBalance: number
  displayAvailableCredit: number
  displayUtilization: number
  dueDay: number
  dueApplied: boolean
  plannedSpend: number
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

const projectCardCycle = (
  input: {
    creditLimit: number
    usedLimit: number
    statementBalance?: number
    pendingCharges?: number
    minimumPayment: number
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
  const plannedSpend = toNonNegativeNumber(input.spendPerMonth)
  const apr = toNonNegativeNumber(input.interestRate)
  const dueDay = toDayOfMonth(input.dueDay, 21)

  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = roundCurrency(statementInput * monthlyRate)
  const newStatementBalance = roundCurrency(statementInput + interestAmount)
  const minimumDue = roundCurrency(Math.min(newStatementBalance, minimumPayment))
  const dueAdjustedCurrent = roundCurrency(Math.max(newStatementBalance - minimumDue, 0) + pendingCharges)
  const dueApplied = todayDay >= dueDay
  const displayCurrentBalance = dueApplied ? dueAdjustedCurrent : currentInput
  const displayAvailableCredit = roundCurrency(limit - displayCurrentBalance)
  const displayUtilization = utilizationFor(displayCurrentBalance, limit)

  return {
    limit,
    currentInput,
    statementInput,
    pendingCharges,
    interestAmount,
    newStatementBalance,
    minimumDue,
    dueAdjustedCurrent,
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
            spendPerMonth: entry.spendPerMonth,
            interestRate: entry.interestRate,
            dueDay: entry.dueDay,
          },
          todayDay,
        ),
      })),
    [cards, todayDay],
  )

  const minPaymentsTotal = useMemo(
    () => cards.reduce((sum, entry) => sum + (Number.isFinite(entry.minimumPayment) ? entry.minimumPayment : 0), 0),
    [cards],
  )
  const minDueTotal = useMemo(() => cardRows.reduce((sum, row) => sum + row.projection.minimumDue, 0), [cardRows])
  const pendingChargesTotal = useMemo(() => cardRows.reduce((sum, row) => sum + row.projection.pendingCharges, 0), [cardRows])
  const newStatementsTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.newStatementBalance, 0),
    [cardRows],
  )
  const dueAdjustedCurrentTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.displayCurrentBalance, 0),
    [cardRows],
  )
  const availableCreditTotal = useMemo(
    () => cardRows.reduce((sum, row) => sum + row.projection.displayAvailableCredit, 0),
    [cardRows],
  )

  const dueAdjustedUtilizationPercent = cardLimitTotal > 0 ? dueAdjustedCurrentTotal / cardLimitTotal : 0

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
          return right.minimumDue - left.minimumDue
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
            New statement = statement balance + APR monthly interest. On/after due day, current/available/utilization use statement minus
            minimum due, plus pending charges.
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
              {formatMoney(newStatementsTotal)} new statements · {formatMoney(minDueTotal)} total minimum due
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
              <option value="due_payment_desc">Min due (high-low)</option>
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
              Showing {visibleRows.length} of {cards.length} card{cards.length === 1 ? '' : 's'} · {formatMoney(minPaymentsTotal)}{' '}
              configured min payments/mo · {formatMoney(monthlyCardSpend)} planned spend/mo
            </p>
            <p className="subnote">
              Pending charges {formatMoney(pendingChargesTotal)} · Available credit {formatMoney(availableCreditTotal)} · Baseline{' '}
              {formatMoney(cardUsedTotal)} current / {formatPercent(cardUtilizationPercent / 100)} util
            </p>

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
                          const draftSpend = Number.parseFloat(cardEditDraft.spendPerMonth)
                          const draftApr = Number.parseFloat(cardEditDraft.interestRate)
                          const draftDueDay = Number.parseInt(cardEditDraft.dueDay, 10)

                          const editProjection = projectCardCycle(
                            {
                              creditLimit: Number.isFinite(draftLimit) ? draftLimit : 0,
                              usedLimit: Number.isFinite(draftUsed) ? draftUsed : 0,
                              statementBalance: Number.isFinite(draftStatementBalance) ? draftStatementBalance : undefined,
                              pendingCharges: Number.isFinite(draftPending) ? draftPending : undefined,
                              minimumPayment: Number.isFinite(draftMinPayment) ? draftMinPayment : 0,
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
                                    <small>Interest {formatMoney(rowProjection.interestAmount)}</small>
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
                    const draftSpend = Number.parseFloat(cardEditDraft.spendPerMonth)
                    const draftApr = Number.parseFloat(cardEditDraft.interestRate)
                    const draftDueDay = Number.parseInt(cardEditDraft.dueDay, 10)

                    const editProjection = projectCardCycle(
                      {
                        creditLimit: Number.isFinite(draftLimit) ? draftLimit : 0,
                        usedLimit: Number.isFinite(draftUsed) ? draftUsed : 0,
                        statementBalance: Number.isFinite(draftStatementBalance) ? draftStatementBalance : undefined,
                        pendingCharges: Number.isFinite(draftPending) ? draftPending : undefined,
                        minimumPayment: Number.isFinite(draftMinPayment) ? draftMinPayment : 0,
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
                                <span>Minimum payment</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={cardEditDraft.minimumPayment}
                                  onChange={(event) =>
                                    setCardEditDraft((prev) => ({
                                      ...prev,
                                      minimumPayment: event.target.value,
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
