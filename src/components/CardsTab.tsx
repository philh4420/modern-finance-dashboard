import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { CardEditDraft, CardEntry, CardForm, CardId } from './financeTypes'

type CardsTabProps = {
  cards: CardEntry[]
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
}

export function CardsTab({
  cards,
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
}: CardsTabProps) {
  return (
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

          <label htmlFor="card-apr">APR % (optional)</label>
          <input
            id="card-apr"
            type="number"
            min="0"
            step="0.01"
            value={cardForm.interestRate}
            onChange={(event) => setCardForm((prev) => ({ ...prev, interestRate: event.target.value }))}
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
                  <th scope="col">APR</th>
                  <th scope="col">Monthly Spend</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((entry) => {
                  const isEditing = cardEditId === entry._id

                  return (
                    <tr key={entry._id}>
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
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
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
                          `${entry.interestRate.toFixed(2)}%`
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
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
                              <button type="button" className="btn btn-secondary" onClick={() => void saveCardEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setCardEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startCardEdit(entry)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeleteCard(entry._id)}>
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
      </article>
    </section>
  )
}
