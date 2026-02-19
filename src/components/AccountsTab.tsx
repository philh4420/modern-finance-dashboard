import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountEditDraft,
  AccountEntry,
  AccountForm,
  AccountId,
  AccountPurpose,
  AccountPurposeOption,
  AccountType,
  AccountTypeOption,
} from './financeTypes'

type AccountSortKey =
  | 'name_asc'
  | 'available_desc'
  | 'available_asc'
  | 'ledger_desc'
  | 'type_asc'
  | 'purpose_asc'
  | 'risk_first'

type AccountHealthStatus = 'healthy' | 'watch' | 'critical'

type AccountHealthFilter = 'all' | AccountHealthStatus

type AccountRowView = {
  entry: AccountEntry
  purpose: AccountPurpose
  availableBalance: number
  ledgerBalance: number
  pendingBalance: number
  healthScore: number
  healthStatus: AccountHealthStatus
  healthNote: string
  isLiability: boolean
}

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
  projectedMonthlyNet: number
  accountTypeOptions: AccountTypeOption[]
  accountPurposeOptions: AccountPurposeOption[]
  accountTypeLabel: (value: AccountType) => string
  accountPurposeLabel: (value: AccountPurpose) => string
  formatMoney: (value: number) => string
}

const purposeColorClass = (purpose: AccountPurpose) => {
  switch (purpose) {
    case 'emergency':
      return 'pill pill--good'
    case 'bills':
      return 'pill pill--warning'
    case 'goals':
      return 'pill pill--neutral'
    case 'debt':
      return 'pill pill--critical'
    default:
      return 'pill pill--neutral'
  }
}

const healthClass = (status: AccountHealthStatus) => {
  switch (status) {
    case 'healthy':
      return 'pill pill--good'
    case 'watch':
      return 'pill pill--warning'
    default:
      return 'pill pill--critical'
  }
}

const parseFloatOrZero = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const resolvePurpose = (entry: AccountEntry): AccountPurpose => entry.purpose ?? (entry.type === 'debt' ? 'debt' : 'spending')

const resolveBalances = (entry: AccountEntry) => {
  const availableBalance = roundCurrency(entry.balance)
  const hasLedger = entry.ledgerBalance !== undefined
  const hasPending = entry.pendingBalance !== undefined

  if (!hasLedger && !hasPending) {
    return {
      availableBalance,
      ledgerBalance: availableBalance,
      pendingBalance: 0,
    }
  }

  const pendingBalance = hasPending
    ? roundCurrency(entry.pendingBalance ?? 0)
    : roundCurrency(availableBalance - (entry.ledgerBalance ?? availableBalance))
  const ledgerBalance = hasLedger
    ? roundCurrency(entry.ledgerBalance ?? availableBalance)
    : roundCurrency(availableBalance - pendingBalance)

  return {
    availableBalance: roundCurrency(ledgerBalance + pendingBalance),
    ledgerBalance,
    pendingBalance,
  }
}

const evaluateHealth = (entry: AccountEntry, balances: { availableBalance: number; ledgerBalance: number; pendingBalance: number }) => {
  const available = balances.availableBalance
  const ledger = balances.ledgerBalance
  const pending = balances.pendingBalance
  const isDebt = entry.type === 'debt'
  const pendingOutflow = Math.max(-pending, 0)
  const baseline = Math.max(Math.abs(ledger), 1)
  const pendingStress = pendingOutflow / baseline

  let score = 100
  if (isDebt) score -= 38
  if (available < 0) score -= 45
  else if (available < 150) score -= 28
  else if (available < 600) score -= 14
  if (pendingStress >= 0.4) score -= 24
  else if (pendingStress >= 0.2) score -= 12
  if (!entry.liquid && available < 250) score -= 8
  score = Math.max(0, Math.min(100, Math.round(score)))

  const healthStatus: AccountHealthStatus = score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'critical'

  let healthNote = 'Stable balance profile'
  if (available < 0) {
    healthNote = 'Overdrawn position'
  } else if (pendingStress >= 0.4) {
    healthNote = 'Heavy pending outflow'
  } else if (isDebt) {
    healthNote = 'Liability account'
  } else if (available < 150) {
    healthNote = 'Low available buffer'
  }

  return {
    healthScore: score,
    healthStatus,
    healthNote,
  }
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
  projectedMonthlyNet,
  accountTypeOptions,
  accountPurposeOptions,
  accountTypeLabel,
  accountPurposeLabel,
  formatMoney,
}: AccountsTabProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all')
  const [purposeFilter, setPurposeFilter] = useState<'all' | AccountPurpose>('all')
  const [liquidityFilter, setLiquidityFilter] = useState<'all' | 'liquid' | 'non_liquid'>('all')
  const [healthFilter, setHealthFilter] = useState<AccountHealthFilter>('all')
  const [sortKey, setSortKey] = useState<AccountSortKey>('name_asc')

  const accountRows = useMemo<AccountRowView[]>(() => {
    return accounts.map((entry) => {
      const purpose = resolvePurpose(entry)
      const balances = resolveBalances(entry)
      const health = evaluateHealth(entry, balances)
      const isLiability = entry.type === 'debt' || balances.availableBalance < 0
      return {
        entry,
        purpose,
        availableBalance: balances.availableBalance,
        ledgerBalance: balances.ledgerBalance,
        pendingBalance: balances.pendingBalance,
        healthScore: health.healthScore,
        healthStatus: health.healthStatus,
        healthNote: health.healthNote,
        isLiability,
      }
    })
  }, [accounts])

  const totals = useMemo(() => {
    const totalAvailable = accountRows.reduce((sum, row) => sum + row.availableBalance, 0)
    const liquidCash = accountRows.reduce((sum, row) => sum + (row.entry.liquid ? Math.max(row.availableBalance, 0) : 0), 0)
    const assetTotal = accountRows.reduce((sum, row) => {
      if (row.entry.type === 'debt') {
        return sum
      }
      return sum + Math.max(row.availableBalance, 0)
    }, 0)
    const debtTotal = accountRows.reduce((sum, row) => {
      if (row.entry.type === 'debt') {
        return sum + Math.abs(row.availableBalance)
      }
      return row.availableBalance < 0 ? sum + Math.abs(row.availableBalance) : sum
    }, 0)
    const averageHealth =
      accountRows.length > 0 ? Math.round(accountRows.reduce((sum, row) => sum + row.healthScore, 0) / accountRows.length) : 100

    return {
      totalAvailable,
      liquidCash,
      assetTotal,
      debtTotal,
      netContribution: roundCurrency(assetTotal - debtTotal),
      averageHealth,
    }
  }, [accountRows])

  const purposeMix = useMemo(() => {
    const totalsByPurpose = new Map<AccountPurpose, number>()
    accountRows.forEach((row) => {
      if (row.isLiability || row.availableBalance <= 0) {
        return
      }
      totalsByPurpose.set(row.purpose, (totalsByPurpose.get(row.purpose) ?? 0) + row.availableBalance)
    })

    const total = [...totalsByPurpose.values()].reduce((sum, value) => sum + value, 0)
    const rows = [...totalsByPurpose.entries()]
      .map(([purpose, amount]) => ({
        purpose,
        amount: roundCurrency(amount),
        sharePercent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((left, right) => right.amount - left.amount)

    return {
      rows,
      total: roundCurrency(total),
    }
  }, [accountRows])

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = accountRows.filter((row) => {
      const typeMatches = typeFilter === 'all' ? true : row.entry.type === typeFilter
      const purposeMatches = purposeFilter === 'all' ? true : row.purpose === purposeFilter
      const liquidityMatches =
        liquidityFilter === 'all' ? true : liquidityFilter === 'liquid' ? row.entry.liquid : !row.entry.liquid
      const healthMatches = healthFilter === 'all' ? true : row.healthStatus === healthFilter
      const searchMatches =
        query.length === 0
          ? true
          : `${row.entry.name} ${row.entry.type} ${row.purpose} ${accountTypeLabel(row.entry.type)} ${accountPurposeLabel(
                row.purpose,
              )}`
              .toLowerCase()
              .includes(query)

      return typeMatches && purposeMatches && liquidityMatches && healthMatches && searchMatches
    })

    return filtered.sort((left, right) => {
      switch (sortKey) {
        case 'name_asc':
          return left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' })
        case 'available_desc':
          return right.availableBalance - left.availableBalance
        case 'available_asc':
          return left.availableBalance - right.availableBalance
        case 'ledger_desc':
          return right.ledgerBalance - left.ledgerBalance
        case 'type_asc':
          return accountTypeLabel(left.entry.type).localeCompare(accountTypeLabel(right.entry.type), undefined, {
            sensitivity: 'base',
          })
        case 'purpose_asc':
          return accountPurposeLabel(left.purpose).localeCompare(accountPurposeLabel(right.purpose), undefined, {
            sensitivity: 'base',
          })
        case 'risk_first': {
          const severity = (status: AccountHealthStatus) => {
            if (status === 'critical') return 0
            if (status === 'watch') return 1
            return 2
          }
          return (
            severity(left.healthStatus) - severity(right.healthStatus) ||
            left.healthScore - right.healthScore ||
            left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' })
          )
        }
        default:
          return 0
      }
    })
  }, [
    accountPurposeLabel,
    accountRows,
    accountTypeLabel,
    healthFilter,
    liquidityFilter,
    purposeFilter,
    search,
    sortKey,
    typeFilter,
  ])

  const hasFilters =
    search.length > 0 ||
    typeFilter !== 'all' ||
    purposeFilter !== 'all' ||
    liquidityFilter !== 'all' ||
    healthFilter !== 'all' ||
    sortKey !== 'name_asc'

  const formLedger = parseFloatOrZero(accountForm.ledgerBalance)
  const formPending = parseFloatOrZero(accountForm.pendingBalance)
  const formAvailable = roundCurrency(formLedger + formPending)

  return (
    <section className="editor-grid accounts-tab-shell" aria-label="Account management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Accounts</p>
            <h2>Add account</h2>
            <p className="panel-value">
              {accounts.length} account{accounts.length === 1 ? '' : 's'} · {formatMoney(totals.totalAvailable)} available total
            </p>
            <p className="subnote">{formatMoney(formAvailable)} available from current ledger + pending input.</p>
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
                onChange={(event) => {
                  const type = event.target.value as AccountType
                  setAccountForm((prev) => ({
                    ...prev,
                    type,
                    purpose: type === 'debt' ? 'debt' : prev.purpose === 'debt' ? 'spending' : prev.purpose,
                  }))
                }}
              >
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="account-purpose">Purpose</label>
              <select
                id="account-purpose"
                value={accountForm.purpose}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    purpose: event.target.value as AccountPurpose,
                  }))
                }
              >
                {accountPurposeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="account-ledger-balance">Ledger balance</label>
              <input
                id="account-ledger-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={accountForm.ledgerBalance}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    ledgerBalance: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="account-pending-balance">Pending (+/-)</label>
              <input
                id="account-pending-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={accountForm.pendingBalance}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    pendingBalance: event.target.value,
                  }))
                }
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
                Include this account in liquid-cash calculations
              </label>
            </div>
          </div>

          <p id="account-form-hint" className="form-hint">
            Tip: ledger is booked balance, pending captures authorizations/in-flight changes, and available = ledger + pending.
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
            <p className="panel-value">{formatMoney(totals.netContribution)} net worth contribution</p>
            <p className="subnote">
              {formatMoney(totals.assetTotal)} assets · {formatMoney(totals.debtTotal)} debt · {totals.averageHealth}/100 health
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search accounts"
              placeholder="Search account name, type, or purpose…"
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
              aria-label="Filter account purpose"
              value={purposeFilter}
              onChange={(event) => setPurposeFilter(event.target.value as 'all' | AccountPurpose)}
            >
              <option value="all">All purposes</option>
              {accountPurposeOptions.map((option) => (
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
              aria-label="Filter account health"
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value as AccountHealthFilter)}
            >
              <option value="all">All health states</option>
              <option value="healthy">Healthy</option>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
            </select>
            <select
              aria-label="Sort accounts"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as AccountSortKey)}
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="available_desc">Available (high-low)</option>
              <option value="available_asc">Available (low-high)</option>
              <option value="ledger_desc">Ledger (high-low)</option>
              <option value="type_asc">Type (A-Z)</option>
              <option value="purpose_asc">Purpose (A-Z)</option>
              <option value="risk_first">Risk first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
                setPurposeFilter('all')
                setLiquidityFilter('all')
                setHealthFilter('all')
                setSortKey('name_asc')
              }}
              disabled={!hasFilters}
            >
              Clear
            </button>
          </div>
        </header>

        <div className="accounts-summary-strip">
          <article className="accounts-summary-card">
            <p>Total assets</p>
            <strong>{formatMoney(totals.assetTotal)}</strong>
            <small>Positive non-debt balances</small>
          </article>
          <article className="accounts-summary-card">
            <p>Liquid cash</p>
            <strong>{formatMoney(totals.liquidCash)}</strong>
            <small>Accounts flagged as liquid</small>
          </article>
          <article className="accounts-summary-card accounts-summary-card--warning">
            <p>Debt balance</p>
            <strong>{formatMoney(totals.debtTotal)}</strong>
            <small>Debt accounts + negative balances</small>
          </article>
          <article className="accounts-summary-card">
            <p>Net contribution</p>
            <strong>{formatMoney(totals.netContribution)}</strong>
            <small>Assets minus debt exposure</small>
          </article>
          <article className="accounts-summary-card">
            <p>30-day net cashflow</p>
            <strong>{formatMoney(projectedMonthlyNet)}</strong>
            <small>Projected income minus commitments</small>
          </article>
        </div>

        <section className="accounts-purpose-panel" aria-label="Account purpose allocation">
          <div className="accounts-purpose-head">
            <h3>Purpose allocation mix</h3>
            <small>{formatMoney(purposeMix.total)} tagged available assets</small>
          </div>
          {purposeMix.rows.length === 0 ? (
            <p className="subnote">No positive asset balances available for purpose allocation yet.</p>
          ) : (
            <ul className="accounts-purpose-list">
              {purposeMix.rows.map((row) => (
                <li key={row.purpose}>
                  <div className="accounts-purpose-row">
                    <p>
                      <span className={purposeColorClass(row.purpose)}>{accountPurposeLabel(row.purpose)}</span>
                    </p>
                    <strong>{formatMoney(row.amount)}</strong>
                  </div>
                  <div className="accounts-purpose-meta">
                    <small>{row.sharePercent.toFixed(1)}% of tagged assets</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
              <table className="data-table data-table--accounts" data-testid="accounts-table">
                <caption className="sr-only">Account entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Purpose & type</th>
                    <th scope="col">Balances</th>
                    <th scope="col">Health</th>
                    <th scope="col">Class</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((row) => {
                    const { entry } = row
                    const isEditing = accountEditId === entry._id
                    const draftLedger = parseFloatOrZero(accountEditDraft.ledgerBalance)
                    const draftPending = parseFloatOrZero(accountEditDraft.pendingBalance)
                    const draftBalances = {
                      availableBalance: roundCurrency(draftLedger + draftPending),
                      ledgerBalance: roundCurrency(draftLedger),
                      pendingBalance: roundCurrency(draftPending),
                    }
                    const previewHealth = evaluateHealth(
                      { ...entry, type: accountEditDraft.type, liquid: accountEditDraft.liquid },
                      draftBalances,
                    )
                    const previewPurpose = accountEditDraft.purpose
                    const activeHealth = isEditing ? previewHealth : row
                    const activePurpose = isEditing ? previewPurpose : row.purpose
                    const activeAvailable = isEditing ? draftBalances.availableBalance : row.availableBalance
                    const activeLedger = isEditing ? draftBalances.ledgerBalance : row.ledgerBalance
                    const activePending = isEditing ? draftBalances.pendingBalance : row.pendingBalance
                    const activeIsLiability =
                      isEditing ? accountEditDraft.type === 'debt' || activeAvailable < 0 : row.isLiability

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
                            <div className="accounts-row-title">
                              <strong>{entry.name}</strong>
                              <small>{entry.liquid ? 'liquid enabled' : 'non-liquid'}</small>
                            </div>
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <div className="accounts-inline-grid">
                              <select
                                className="inline-select"
                                value={accountEditDraft.type}
                                onChange={(event) => {
                                  const nextType = event.target.value as AccountType
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    type: nextType,
                                    purpose: nextType === 'debt' ? 'debt' : prev.purpose === 'debt' ? 'spending' : prev.purpose,
                                  }))
                                }}
                              >
                                {accountTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="inline-select"
                                value={accountEditDraft.purpose}
                                onChange={(event) =>
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    purpose: event.target.value as AccountPurpose,
                                  }))
                                }
                              >
                                {accountPurposeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="accounts-row-pills">
                              <span className={purposeColorClass(activePurpose)}>{accountPurposeLabel(activePurpose)}</span>
                              <span className="pill pill--neutral">{accountTypeLabel(entry.type)}</span>
                            </div>
                          )}
                        </td>

                        <td className={`table-amount ${activeAvailable >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                          {isEditing ? (
                            <div className="accounts-inline-grid accounts-inline-grid--balances">
                              <label>
                                <span>Ledger</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={accountEditDraft.ledgerBalance}
                                  onChange={(event) =>
                                    setAccountEditDraft((prev) => ({
                                      ...prev,
                                      ledgerBalance: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                <span>Pending</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={accountEditDraft.pendingBalance}
                                  onChange={(event) =>
                                    setAccountEditDraft((prev) => ({
                                      ...prev,
                                      pendingBalance: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <p className="subnote">Available {formatMoney(activeAvailable)}</p>
                            </div>
                          ) : (
                            <div className="accounts-balance-stack">
                              <strong>{formatMoney(activeAvailable)}</strong>
                              <small>
                                Ledger {formatMoney(activeLedger)} · Pending {formatMoney(activePending)}
                              </small>
                            </div>
                          )}
                        </td>

                        <td>
                          <div className="accounts-health">
                            <span className={healthClass(activeHealth.healthStatus)}>
                              {activeHealth.healthStatus} {activeHealth.healthScore}/100
                            </span>
                            <small>{activeHealth.healthNote}</small>
                          </div>
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
                              <span className={activeIsLiability ? 'pill pill--critical' : 'pill pill--good'}>
                                {activeIsLiability ? 'liability' : 'asset'}
                              </span>
                            </label>
                          ) : (
                            <span className={activeIsLiability ? 'pill pill--critical' : 'pill pill--good'}>
                              {activeIsLiability ? 'liability' : 'asset'}
                            </span>
                          )}
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
