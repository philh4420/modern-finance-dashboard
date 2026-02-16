import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountEditDraft,
  AccountEntry,
  AccountForm,
  AccountId,
  AccountType,
  AccountTypeOption,
} from './financeTypes'

type AccountSortKey = 'name_asc' | 'balance_desc' | 'balance_asc' | 'type_asc' | 'liquid_first' | 'liability_first'

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
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all')
  const [liquidityFilter, setLiquidityFilter] = useState<'all' | 'liquid' | 'non_liquid'>('all')
  const [sortKey, setSortKey] = useState<AccountSortKey>('name_asc')

  const isLiability = (entry: AccountEntry) => entry.type === 'debt' || entry.balance < 0

  const totals = useMemo(() => {
    const totalBalance = accounts.reduce((sum, entry) => sum + entry.balance, 0)
    const liquidTotal = accounts.reduce((sum, entry) => sum + (entry.liquid ? entry.balance : 0), 0)

    const assetTotal = accounts.reduce(
      (sum, entry) => sum + (!isLiability(entry) && entry.balance > 0 ? entry.balance : 0),
      0,
    )

    const liabilityTotal = accounts.reduce(
      (sum, entry) => sum + (isLiability(entry) ? Math.abs(entry.balance) : 0),
      0,
    )

    return {
      totalBalance,
      liquidTotal,
      assetTotal,
      liabilityTotal,
    }
  }, [accounts])

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = accounts.filter((entry) => {
      const typeMatches = typeFilter === 'all' ? true : entry.type === typeFilter
      const liquidityMatches =
        liquidityFilter === 'all' ? true : liquidityFilter === 'liquid' ? entry.liquid : !entry.liquid
      const searchMatches =
        query.length === 0
          ? true
          : `${entry.name} ${entry.type} ${accountTypeLabel(entry.type)}`.toLowerCase().includes(query)

      return typeMatches && liquidityMatches && searchMatches
    })

    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'balance_desc':
          return b.balance - a.balance
        case 'balance_asc':
          return a.balance - b.balance
        case 'type_asc':
          return accountTypeLabel(a.type).localeCompare(accountTypeLabel(b.type), undefined, { sensitivity: 'base' })
        case 'liquid_first': {
          const aKey = a.liquid ? 0 : 1
          const bKey = b.liquid ? 0 : 1
          return aKey - bKey || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        }
        case 'liability_first': {
          const aKey = isLiability(a) ? 0 : 1
          const bKey = isLiability(b) ? 0 : 1
          return aKey - bKey || b.balance - a.balance
        }
        default:
          return 0
      }
    })
  }, [accountTypeLabel, accounts, liquidityFilter, search, sortKey, typeFilter])

  const hasFilters = search.length > 0 || typeFilter !== 'all' || liquidityFilter !== 'all' || sortKey !== 'name_asc'

  const liquidPill = (liquid: boolean) => (liquid ? 'pill pill--good' : 'pill pill--neutral')
  const balanceClass = (value: number) => (value >= 0 ? 'amount-positive' : 'amount-negative')
  const categoryPill = (entry: AccountEntry) => (isLiability(entry) ? 'pill pill--critical' : 'pill pill--good')

  return (
    <section className="editor-grid" aria-label="Account management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Accounts</p>
            <h2>Add account</h2>
            <p className="panel-value">
              {accounts.length} account{accounts.length === 1 ? '' : 's'} · {formatMoney(totals.totalBalance)} combined
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddAccount} aria-describedby="account-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="account-name">Account name</label>
              <input
                id="account-name"
                value={accountForm.name}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
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
            </div>

            <div className="form-field">
              <label htmlFor="account-balance">Current balance</label>
              <input
                id="account-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={accountForm.balance}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, balance: event.target.value }))}
                required
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="account-liquid">
                <input
                  id="account-liquid"
                  type="checkbox"
                  checked={accountForm.liquid}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, liquid: event.target.checked }))}
                />
                Liquid reserve account
              </label>
            </div>
          </div>

          <p id="account-form-hint" className="form-hint">
            Tip: mark only fast-access cash accounts as <strong>liquid</strong> for accurate runway tracking.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save account
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Accounts</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(totals.totalBalance)} net account balance</p>
            <p className="subnote">
              {formatMoney(totals.assetTotal)} assets · {formatMoney(totals.liabilityTotal)} liabilities ·{' '}
              {formatMoney(totals.liquidTotal)} liquid
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search accounts"
              placeholder="Search account name or type…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Filter account type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'all' | AccountType)}
            >
              <option value="all">All types</option>
              {accountTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter account liquidity"
              value={liquidityFilter}
              onChange={(event) => setLiquidityFilter(event.target.value as 'all' | 'liquid' | 'non_liquid')}
            >
              <option value="all">All liquidity</option>
              <option value="liquid">Liquid only</option>
              <option value="non_liquid">Non-liquid only</option>
            </select>
            <select
              aria-label="Sort accounts"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as AccountSortKey)}
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="balance_desc">Balance (high-low)</option>
              <option value="balance_asc">Balance (low-high)</option>
              <option value="type_asc">Type (A-Z)</option>
              <option value="liquid_first">Liquid first</option>
              <option value="liability_first">Liabilities first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
                setLiquidityFilter('all')
                setSortKey('name_asc')
              }}
              disabled={!hasFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {accounts.length === 0 ? (
          <p className="empty-state">No accounts added yet.</p>
        ) : visibleAccounts.length === 0 ? (
          <p className="empty-state">No accounts match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleAccounts.length} of {accounts.length} account{accounts.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table" data-testid="accounts-table">
                <caption className="sr-only">Account entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Type</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Liquid</th>
                    <th scope="col">Class</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((entry) => {
                    const isEditing = accountEditId === entry._id
                    const draftBalance = Number.parseFloat(accountEditDraft.balance)
                    const displayBalance = isEditing && Number.isFinite(draftBalance) ? draftBalance : entry.balance

                    return (
                      <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
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
                            <span className="pill pill--neutral">{accountTypeLabel(entry.type)}</span>
                          )}
                        </td>

                        <td className={`table-amount ${balanceClass(displayBalance)}`}>
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
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
                            <label className="checkbox-row" htmlFor={`account-edit-liquid-${entry._id}`}>
                              <input
                                id={`account-edit-liquid-${entry._id}`}
                                type="checkbox"
                                checked={accountEditDraft.liquid}
                                onChange={(event) =>
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    liquid: event.target.checked,
                                  }))
                                }
                              />
                              <span className="sr-only">Liquid account</span>
                            </label>
                          ) : (
                            <span className={liquidPill(entry.liquid)}>{entry.liquid ? 'yes' : 'no'}</span>
                          )}
                        </td>

                        <td>
                          <span className={categoryPill(entry)}>{isLiability(entry) ? 'liability' : 'asset'}</span>
                        </td>

                        <td>
                          <div className="row-actions">
                            {isEditing ? (
                              <>
                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveAccountEdit()}>
                                  Save
                                </button>
                                <button type="button" className="btn btn-ghost btn--sm" onClick={() => setAccountEditId(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startAccountEdit(entry)}>
                                Edit
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteAccount(entry._id)}>
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
          </>
        )}
      </article>
    </section>
  )
}
