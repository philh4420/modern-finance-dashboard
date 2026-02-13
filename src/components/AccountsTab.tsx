import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type {
  AccountEditDraft,
  AccountEntry,
  AccountForm,
  AccountId,
  AccountType,
  AccountTypeOption,
} from './financeTypes'

type AccountsTabProps = {
  accounts: AccountEntry[]
  accountForm: AccountForm
  setAccountForm: Dispatch<SetStateAction<AccountForm>>
  accountEditId: AccountId | null
  setAccountEditId: Dispatch<SetStateAction<AccountId | null>>
  accountEditDraft: AccountEditDraft
  setAccountEditDraft: Dispatch<SetStateAction<AccountEditDraft>>
  onAddAccount: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteAccount: (id: AccountId) => Promise<void>
  saveAccountEdit: () => Promise<void>
  startAccountEdit: (entry: AccountEntry) => void
  accountTypeOptions: AccountTypeOption[]
  accountTypeLabel: (value: AccountType) => string
  formatMoney: (value: number) => string
}

export function AccountsTab({
  accounts,
  accountForm,
  setAccountForm,
  accountEditId,
  setAccountEditId,
  accountEditDraft,
  setAccountEditDraft,
  onAddAccount,
  onDeleteAccount,
  saveAccountEdit,
  startAccountEdit,
  accountTypeOptions,
  accountTypeLabel,
  formatMoney,
}: AccountsTabProps) {
  return (
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
                {accounts.map((entry) => {
                  const isEditing = accountEditId === entry._id

                  return (
                    <tr key={entry._id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={accountEditDraft.name}
                            onChange={(event) =>
                              setAccountEditDraft((prev) => ({
                                ...prev,
                                name: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          entry.name
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="inline-select"
                            value={accountEditDraft.type}
                            onChange={(event) =>
                              setAccountEditDraft((prev) => ({
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
                        ) : (
                          accountTypeLabel(entry.type)
                        )}
                      </td>
                      <td className={`table-amount ${entry.balance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            type="number"
                            step="0.01"
                            value={accountEditDraft.balance}
                            onChange={(event) =>
                              setAccountEditDraft((prev) => ({
                                ...prev,
                                balance: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          formatMoney(entry.balance)
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="checkbox"
                            checked={accountEditDraft.liquid}
                            onChange={(event) =>
                              setAccountEditDraft((prev) => ({
                                ...prev,
                                liquid: event.target.checked,
                              }))
                            }
                          />
                        ) : entry.liquid ? (
                          'Yes'
                        ) : (
                          'No'
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-secondary" onClick={() => void saveAccountEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={() => setAccountEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-secondary" onClick={() => startAccountEdit(entry)}>
                              Edit
                            </button>
                          )}
                          <button type="button" className="btn btn-ghost" onClick={() => void onDeleteAccount(entry._id)}>
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
