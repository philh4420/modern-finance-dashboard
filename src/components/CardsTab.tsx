import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { CardEditDraft, CardEntry, CardForm, CardId } from './financeTypes'

type CardSortKey = 'name_asc' | 'used_desc' | 'util_desc' | 'limit_desc' | 'payment_desc' | 'spend_desc' | 'apr_desc'

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

  const minPaymentsTotal = useMemo(
    () => cards.reduce((sum, entry) => sum + (Number.isFinite(entry.minimumPayment) ? entry.minimumPayment : 0), 0),
    [cards],
  )

  const utilizationFor = (used: number, limit: number) => (limit > 0 ? used / limit : 0)

  const pillVariantForUtil = (ratio: number) => {
    if (ratio >= 0.9) return 'pill--critical'
    if (ratio >= 0.5) return 'pill--warning'
    return 'pill--good'
  }

  const visibleCards = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query ? cards.filter((entry) => entry.name.toLowerCase().includes(query)) : cards.slice()

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'used_desc':
          return b.usedLimit - a.usedLimit
        case 'limit_desc':
          return b.creditLimit - a.creditLimit
        case 'payment_desc':
          return b.minimumPayment - a.minimumPayment
        case 'spend_desc':
          return b.spendPerMonth - a.spendPerMonth
        case 'apr_desc':
          return (b.interestRate ?? -1) - (a.interestRate ?? -1)
        case 'util_desc':
          return utilizationFor(b.usedLimit, b.creditLimit) - utilizationFor(a.usedLimit, a.creditLimit)
        default:
          return 0
      }
    })

    return sorted
  }, [cards, search, sortKey])

  return (
    <section className="editor-grid" aria-label="Card management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Cards</p>
            <h2>Add card</h2>
            <p className="panel-value">
              {cards.length} card{cards.length === 1 ? '' : 's'} · {formatMoney(cardUsedTotal)} used
            </p>
            <p className="subnote">
              {formatMoney(cardLimitTotal)} total limit · {formatPercent(cardUtilizationPercent / 100)} utilization
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
              <label htmlFor="card-used">Used balance</label>
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
            Tip: set an <strong>APR</strong> to let the monthly cycle apply interest and update balances.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add card
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Cards</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(cardUsedTotal)} used · {formatPercent(cardUtilizationPercent / 100)} util</p>
            <p className="subnote">
              {formatMoney(minPaymentsTotal)} min payments/mo · {formatMoney(monthlyCardSpend)} planned spend/mo
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
              <option value="used_desc">Used (high-low)</option>
              <option value="util_desc">Utilization</option>
              <option value="limit_desc">Limit (high-low)</option>
              <option value="payment_desc">Min payment (high-low)</option>
              <option value="spend_desc">Spend (high-low)</option>
              <option value="apr_desc">APR (high-low)</option>
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
              Showing {visibleCards.length} of {cards.length} card{cards.length === 1 ? '' : 's'}.
            </p>

            {visibleCards.length === 0 ? (
              <p className="empty-state">No cards match your search.</p>
            ) : (
              <div className="table-wrap table-wrap--card">
                <table className="data-table" data-testid="cards-table">
                  <caption className="sr-only">Card entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Limit</th>
                      <th scope="col">Used</th>
                      <th scope="col">Util</th>
                      <th scope="col">Min Payment</th>
                      <th scope="col">APR</th>
                      <th scope="col">Monthly Spend</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCards.map((entry) => {
                      const isEditing = cardEditId === entry._id
                      const draftLimit = Number.parseFloat(cardEditDraft.creditLimit)
                      const draftUsed = Number.parseFloat(cardEditDraft.usedLimit)
                      const ratio = isEditing
                        ? utilizationFor(Number.isFinite(draftUsed) ? draftUsed : 0, Number.isFinite(draftLimit) ? draftLimit : 0)
                        : utilizationFor(entry.usedLimit, entry.creditLimit)

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
                              entry.name
                            )}
                          </td>
                          <td className="table-amount">
                            {isEditing ? (
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
                            ) : (
                              formatMoney(entry.creditLimit)
                            )}
                          </td>
                          <td className="table-amount amount-negative">
                            {isEditing ? (
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
                            ) : (
                              formatMoney(entry.usedLimit)
                            )}
                          </td>
                          <td>
                            <span className={`pill ${pillVariantForUtil(ratio)}`}>{formatPercent(ratio)}</span>
                          </td>
                          <td className="table-amount amount-negative">
                            {isEditing ? (
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
                            ) : (
                              formatMoney(entry.minimumPayment)
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
                                value={cardEditDraft.interestRate}
                                onChange={(event) =>
                                  setCardEditDraft((prev) => ({
                                    ...prev,
                                    interestRate: event.target.value,
                                  }))
                                }
                              />
                            ) : entry.interestRate !== undefined ? (
                              <span className="pill pill--neutral">{entry.interestRate.toFixed(2)}%</span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="table-amount amount-negative">
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
                              formatMoney(entry.spendPerMonth)
                            )}
                          </td>
                          <td>
                            <div className="row-actions">
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
            )}
          </>
        )}
      </article>
    </section>
  )
}
