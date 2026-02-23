import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  BillCategory,
  BillScope,
  ConsentLogEntry,
  ConsentSettingsView,
  DashboardCardId,
  DeletionJobEntry,
  DefaultMonthPreset,
  FinancePreference,
  RetentionPolicyRow,
  SecuritySessionActivity,
  UiDensity,
  UserExportDownloadEntry,
  UserExportEntry,
  WeekStartDay,
} from './financeTypes'

type SettingsTabProps = {
  preferenceDraft: {
    displayName: string
    currency: string
    locale: string
    timezone: string
    weekStartDay: WeekStartDay
    defaultMonthPreset: DefaultMonthPreset
    dueRemindersEnabled: boolean
    dueReminderDays: string
    monthlyCycleAlertsEnabled: boolean
    reconciliationRemindersEnabled: boolean
    goalAlertsEnabled: boolean
    defaultBillCategory: BillCategory
    defaultBillScope: BillScope
    defaultPurchaseOwnership: FinancePreference['defaultPurchaseOwnership']
    defaultPurchaseCategory: string
    billNotesTemplate: string
    purchaseNotesTemplate: string
    uiDensity: UiDensity
    defaultLandingTab: FinancePreference['defaultLandingTab']
    dashboardCardOrder: DashboardCardId[]
  }
  setPreferenceDraft: Dispatch<
    SetStateAction<{
      displayName: string
      currency: string
      locale: string
      timezone: string
      weekStartDay: WeekStartDay
      defaultMonthPreset: DefaultMonthPreset
      dueRemindersEnabled: boolean
      dueReminderDays: string
      monthlyCycleAlertsEnabled: boolean
      reconciliationRemindersEnabled: boolean
      goalAlertsEnabled: boolean
      defaultBillCategory: BillCategory
      defaultBillScope: BillScope
      defaultPurchaseOwnership: FinancePreference['defaultPurchaseOwnership']
      defaultPurchaseCategory: string
      billNotesTemplate: string
      purchaseNotesTemplate: string
      uiDensity: UiDensity
      defaultLandingTab: FinancePreference['defaultLandingTab']
      dashboardCardOrder: DashboardCardId[]
    }>
  >
  isSavingPreferences: boolean
  hasUnsavedPreferences: boolean
  onSavePreferences: () => Promise<void>
  onResetPreferencesDraft: () => void
  moveDashboardCard: (cardId: DashboardCardId, direction: -1 | 1) => void
  currencyOptions: string[]
  localeOptions: string[]
  timezoneOptions: string[]
  weekStartDayOptions: Array<{ value: WeekStartDay; label: string }>
  defaultMonthPresetOptions: Array<{ value: DefaultMonthPreset; label: string }>
  uiDensityOptions: Array<{ value: UiDensity; label: string }>
  defaultLandingTabOptions: Array<{ value: FinancePreference['defaultLandingTab']; label: string }>
  dashboardCardOrderOptions: Array<{ id: DashboardCardId; label: string }>
  consentSettings: ConsentSettingsView
  consentLogs: ConsentLogEntry[]
  latestExport: UserExportEntry | null
  exportHistory: UserExportEntry[]
  exportDownloadLogs: UserExportDownloadEntry[]
  latestDeletionJob: DeletionJobEntry | null
  retentionPolicies: RetentionPolicyRow[]
  isExporting: boolean
  onGenerateExport: () => Promise<void>
  onDownloadExportById: (exportId: string) => Promise<void>
  onDownloadLatestExport: () => Promise<void>
  deleteConfirmText: string
  setDeleteConfirmText: Dispatch<SetStateAction<string>>
  isDeleting: boolean
  onRequestDeletion: () => Promise<void>
  isApplyingRetention: boolean
  onRunRetentionNow: () => Promise<void>
  onToggleConsent: (type: 'diagnostics' | 'analytics', enabled: boolean) => Promise<void>
  onUpsertRetention: (policyKey: RetentionPolicyRow['policyKey'], retentionDays: number, enabled: boolean) => Promise<void>
  securitySessions: SecuritySessionActivity[]
  isLoadingSecuritySessions: boolean
  isRefreshingSecuritySessions: boolean
  hasLoadedSecuritySessions: boolean
  isRevokingAllSessions: boolean
  revokingSecuritySessionId: string | null
  clientDeviceSessionCount: number | null
  onRefreshSecuritySessions: () => Promise<void>
  onRevokeSecuritySession: (sessionId: string) => Promise<void>
  onSignOutAllSessions: () => Promise<void>
  cycleDateLabel: Intl.DateTimeFormat
}

type ConsentFilter = 'all' | 'diagnostics' | 'analytics'
type ConsentSortKey = 'newest' | 'oldest'
type RetentionSortKey = 'policy_asc' | 'retention_desc' | 'enabled_first'

const policyLabel = (policyKey: RetentionPolicyRow['policyKey']) => {
  switch (policyKey) {
    case 'exports':
      return 'Exports'
    case 'client_ops_metrics':
      return 'Client Ops Metrics'
    case 'cycle_audit_ledger':
      return 'Cycle / Audit / Ledger Logs'
    case 'consent_logs':
      return 'Consent Logs'
    case 'deletion_jobs':
      return 'Deletion Jobs'
    default:
      return policyKey
  }
}

const presetOptions = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
  { label: '730 days', value: 730 },
  { label: 'Forever', value: 0 },
]

const exportStatusPill = (status: UserExportEntry['status']) => {
  if (status === 'ready') return 'pill pill--good'
  if (status === 'processing') return 'pill pill--warning'
  return 'pill pill--critical'
}

const deletionStatusPill = (status: DeletionJobEntry['status']) => {
  if (status === 'completed') return 'pill pill--good'
  if (status === 'running') return 'pill pill--warning'
  return 'pill pill--critical'
}

const sessionStatusPill = (status: string) => {
  if (status === 'active') return 'pill pill--good'
  if (status === 'pending') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const consentTypePill = (type: ConsentLogEntry['consentType']) =>
  type === 'diagnostics' ? 'pill pill--neutral' : 'pill pill--cadence'

const parseDeletionProgress = (progressJson: string | undefined) => {
  if (!progressJson) return null
  try {
    const parsed = JSON.parse(progressJson) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as { processedDocs?: unknown; totalDocs?: unknown; table?: unknown; stage?: unknown }
    const processed = typeof candidate.processedDocs === 'number' ? candidate.processedDocs : null
    const total = typeof candidate.totalDocs === 'number' ? candidate.totalDocs : null
    const table = typeof candidate.table === 'string' ? candidate.table : null
    const stage = typeof candidate.stage === 'string' ? candidate.stage : null

    if (processed !== null && total !== null && total > 0) {
      return `${processed}/${total} records${table ? ` • ${table}` : ''}`
    }

    if (stage) {
      return stage
    }

    return null
  } catch {
    return null
  }
}

export function SettingsTab({
  preferenceDraft,
  setPreferenceDraft,
  isSavingPreferences,
  hasUnsavedPreferences,
  onSavePreferences,
  onResetPreferencesDraft,
  moveDashboardCard,
  currencyOptions,
  localeOptions,
  timezoneOptions,
  weekStartDayOptions,
  defaultMonthPresetOptions,
  uiDensityOptions,
  defaultLandingTabOptions,
  dashboardCardOrderOptions,
  consentSettings,
  consentLogs,
  latestExport,
  exportHistory,
  exportDownloadLogs,
  latestDeletionJob,
  retentionPolicies,
  isExporting,
  onGenerateExport,
  onDownloadExportById,
  onDownloadLatestExport,
  deleteConfirmText,
  setDeleteConfirmText,
  isDeleting,
  onRequestDeletion,
  isApplyingRetention,
  onRunRetentionNow,
  onToggleConsent,
  onUpsertRetention,
  securitySessions,
  isLoadingSecuritySessions,
  isRefreshingSecuritySessions,
  hasLoadedSecuritySessions,
  isRevokingAllSessions,
  revokingSecuritySessionId,
  clientDeviceSessionCount,
  onRefreshSecuritySessions,
  onRevokeSecuritySession,
  onSignOutAllSessions,
  cycleDateLabel,
}: SettingsTabProps) {
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all')
  const [consentSort, setConsentSort] = useState<ConsentSortKey>('newest')
  const [consentSearch, setConsentSearch] = useState('')

  const [retentionSort, setRetentionSort] = useState<RetentionSortKey>('policy_asc')
  const [retentionSearch, setRetentionSearch] = useState('')

  const visibleConsentLogs = useMemo(() => {
    const query = consentSearch.trim().toLowerCase()
    const filtered = consentLogs.filter((entry) => {
      const typeMatch = consentFilter === 'all' ? true : entry.consentType === consentFilter
      const searchMatch =
        query.length === 0
          ? true
          : `${entry.consentType} ${entry.version} ${entry.enabled ? 'enabled' : 'disabled'}`
              .toLowerCase()
              .includes(query)
      return typeMatch && searchMatch
    })

    return filtered.sort((a, b) => (consentSort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [consentFilter, consentLogs, consentSearch, consentSort])

  const visibleRetentionPolicies = useMemo(() => {
    const query = retentionSearch.trim().toLowerCase()
    const filtered = retentionPolicies.filter((policy) => {
      if (query.length === 0) return true
      const label = policyLabel(policy.policyKey).toLowerCase()
      return label.includes(query)
    })

    return filtered.sort((a, b) => {
      switch (retentionSort) {
        case 'policy_asc':
          return policyLabel(a.policyKey).localeCompare(policyLabel(b.policyKey), undefined, { sensitivity: 'base' })
        case 'retention_desc':
          return b.retentionDays - a.retentionDays
        case 'enabled_first': {
          const aKey = a.enabled ? 0 : 1
          const bKey = b.enabled ? 0 : 1
          return aKey - bKey || policyLabel(a.policyKey).localeCompare(policyLabel(b.policyKey), undefined, { sensitivity: 'base' })
        }
        default:
          return 0
      }
    })
  }, [retentionPolicies, retentionSearch, retentionSort])

  const hasConsentFilters = consentFilter !== 'all' || consentSort !== 'newest' || consentSearch.length > 0
  const hasRetentionFilters = retentionSort !== 'policy_asc' || retentionSearch.length > 0

  const retentionEnabledCount = retentionPolicies.filter((policy) => policy.enabled).length
  const retentionForeverCount = retentionPolicies.filter((policy) => policy.enabled && policy.retentionDays === 0).length
  const deletionProgress = parseDeletionProgress(latestDeletionJob?.progressJson)
  const securityActiveCount = securitySessions.filter((session) => session.status === 'active').length
  const securityThisDeviceCount = securitySessions.filter((session) => session.onThisDevice).length
  const recentSecurityActivity = [...securitySessions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)

  const deleteReady = deleteConfirmText.trim().toUpperCase() === 'DELETE'
  const dashboardCardLabelMap = new Map(dashboardCardOrderOptions.map((option) => [option.id, option.label] as const))
  const defaultLandingTabLabel =
    defaultLandingTabOptions.find((option) => option.value === preferenceDraft.defaultLandingTab)?.label ??
    preferenceDraft.defaultLandingTab
  const notificationEnabledCount = [
    preferenceDraft.dueRemindersEnabled,
    preferenceDraft.monthlyCycleAlertsEnabled,
    preferenceDraft.reconciliationRemindersEnabled,
    preferenceDraft.goalAlertsEnabled,
  ].filter(Boolean).length

  const hasExportHistory = exportHistory.length > 0
  const hasExportDownloadAudit = exportDownloadLogs.length > 0

  return (
    <section className="content-grid" aria-label="Settings and trust controls">
      <article className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Settings</p>
            <h2>Core settings foundation</h2>
            <p className="panel-value">Profile, notifications, defaults, and UI personalization</p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void onSavePreferences()}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              {isSavingPreferences ? 'Saving...' : 'Save settings'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={onResetPreferencesDraft}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              Reset
            </button>
          </div>
        </header>

        <div className="trust-kpi-grid" aria-label="Settings foundation overview">
          <div className="trust-kpi-tile">
            <p>Profile</p>
            <strong>{preferenceDraft.displayName.trim() || 'Not set'}</strong>
            <small>{preferenceDraft.timezone}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Format</p>
            <strong>
              {preferenceDraft.currency} · {preferenceDraft.locale}
            </strong>
            <small>Week starts {preferenceDraft.weekStartDay}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Notifications</p>
            <strong>{notificationEnabledCount}/4 on</strong>
            <small>Due lead {preferenceDraft.dueReminderDays}d</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Defaults</p>
            <strong>
              {preferenceDraft.defaultBillScope === 'personal' ? 'Personal' : 'Shared'} bills
            </strong>
            <small>{preferenceDraft.defaultPurchaseOwnership === 'personal' ? 'Personal' : 'Shared'} purchases</small>
          </div>
          <div className="trust-kpi-tile">
            <p>UI Density</p>
            <strong>{preferenceDraft.uiDensity}</strong>
            <small>Landing tab {defaultLandingTabLabel}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Dashboard order</p>
            <strong>{preferenceDraft.dashboardCardOrder.length} cards</strong>
            <small>{hasUnsavedPreferences ? 'Unsaved changes' : 'Synced with app shell'}</small>
          </div>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>Profile + app preferences</h2>
            <p className="panel-value">Global formatting and calendar defaults used across the app shell</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-display-name">Display name</label>
              <input
                id="settings-display-name"
                value={preferenceDraft.displayName}
                placeholder="Optional"
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="settings-timezone">Timezone</label>
              <select
                id="settings-timezone"
                value={preferenceDraft.timezone}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, timezone: event.target.value }))}
              >
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-currency">Base currency</label>
              <select
                id="settings-currency"
                value={preferenceDraft.currency}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, currency: event.target.value }))}
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-locale">Locale</label>
              <select
                id="settings-locale"
                value={preferenceDraft.locale}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, locale: event.target.value }))}
              >
                {localeOptions.map((locale) => (
                  <option key={locale} value={locale}>
                    {locale}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-week-start">Week start day</label>
              <select
                id="settings-week-start"
                value={preferenceDraft.weekStartDay}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, weekStartDay: event.target.value as WeekStartDay }))
                }
              >
                {weekStartDayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-month">Default month</label>
              <select
                id="settings-default-month"
                value={preferenceDraft.defaultMonthPreset}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultMonthPreset: event.target.value as DefaultMonthPreset }))
                }
              >
                {defaultMonthPresetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="form-hint">
            Currency, locale, timezone, density, dashboard order, and landing tab are applied across the app shell after save.
          </p>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>Notification controls</h2>
            <p className="panel-value">In-app reminder preferences and alert toggles</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-due-reminders-enabled">
                <input
                  id="settings-due-reminders-enabled"
                  type="checkbox"
                  checked={preferenceDraft.dueRemindersEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, dueRemindersEnabled: event.target.checked }))
                  }
                />
                Due reminders enabled
              </label>
            </div>

            <div className="form-field">
              <label htmlFor="settings-due-reminder-days">Due reminder lead days</label>
              <input
                id="settings-due-reminder-days"
                type="number"
                min="0"
                max="60"
                step="1"
                value={preferenceDraft.dueReminderDays}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, dueReminderDays: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-cycle-alerts-enabled">
                <input
                  id="settings-cycle-alerts-enabled"
                  type="checkbox"
                  checked={preferenceDraft.monthlyCycleAlertsEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, monthlyCycleAlertsEnabled: event.target.checked }))
                  }
                />
                Monthly cycle alerts
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-reconcile-reminders-enabled">
                <input
                  id="settings-reconcile-reminders-enabled"
                  type="checkbox"
                  checked={preferenceDraft.reconciliationRemindersEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, reconciliationRemindersEnabled: event.target.checked }))
                  }
                />
                Reconciliation reminders
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-goal-alerts-enabled">
                <input
                  id="settings-goal-alerts-enabled"
                  type="checkbox"
                  checked={preferenceDraft.goalAlertsEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, goalAlertsEnabled: event.target.checked }))
                  }
                />
                Goal alerts
              </label>
            </div>
          </div>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>Category + naming defaults</h2>
            <p className="panel-value">Defaults used when creating new bills and purchases</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-default-bill-category">Default bill category</label>
              <select
                id="settings-default-bill-category"
                value={preferenceDraft.defaultBillCategory}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultBillCategory: event.target.value as BillCategory }))
                }
              >
                <option value="housing">Housing</option>
                <option value="utilities">Utilities</option>
                <option value="council_tax">Council Tax</option>
                <option value="insurance">Insurance</option>
                <option value="transport">Transport</option>
                <option value="health">Health</option>
                <option value="debt">Debt</option>
                <option value="subscriptions">Subscriptions</option>
                <option value="education">Education</option>
                <option value="childcare">Childcare</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-bill-scope">Default bill ownership</label>
              <select
                id="settings-default-bill-scope"
                value={preferenceDraft.defaultBillScope}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultBillScope: event.target.value as BillScope }))
                }
              >
                <option value="shared">Shared / household</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-purchase-ownership">Default purchase ownership</label>
              <select
                id="settings-default-purchase-ownership"
                value={preferenceDraft.defaultPurchaseOwnership}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    defaultPurchaseOwnership: event.target.value as FinancePreference['defaultPurchaseOwnership'],
                  }))
                }
              >
                <option value="shared">Shared / household</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-purchase-category">Default purchase category</label>
              <input
                id="settings-default-purchase-category"
                value={preferenceDraft.defaultPurchaseCategory}
                placeholder="Optional"
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultPurchaseCategory: event.target.value }))
                }
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="settings-bill-notes-template">Bill notes template</label>
              <textarea
                id="settings-bill-notes-template"
                rows={3}
                value={preferenceDraft.billNotesTemplate}
                placeholder="Optional default note for new bills"
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, billNotesTemplate: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="settings-purchase-notes-template">Purchase notes template</label>
              <textarea
                id="settings-purchase-notes-template"
                rows={3}
                value={preferenceDraft.purchaseNotesTemplate}
                placeholder="Optional default note for new purchases"
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, purchaseNotesTemplate: event.target.value }))
                }
              />
            </div>
          </div>

          <p className="form-hint">
            Bill and Purchase add forms will use these defaults for faster manual entry after you save.
          </p>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>UI personalization</h2>
            <p className="panel-value">Density, default landing tab, and dashboard card order</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-ui-density">Density</label>
              <select
                id="settings-ui-density"
                value={preferenceDraft.uiDensity}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, uiDensity: event.target.value as UiDensity }))}
              >
                {uiDensityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-landing-tab">Default landing tab</label>
              <select
                id="settings-default-landing-tab"
                value={preferenceDraft.defaultLandingTab}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    defaultLandingTab: event.target.value as FinancePreference['defaultLandingTab'],
                  }))
                }
              >
                {defaultLandingTabOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label>Dashboard card order</label>
              <div className="settings-order-list" role="list" aria-label="Dashboard card order">
                {preferenceDraft.dashboardCardOrder.map((cardId, index) => (
                  <div key={cardId} className="settings-order-row" role="listitem">
                    <div className="settings-order-row__meta">
                      <span className="settings-order-row__index">{index + 1}</span>
                      <div>
                        <strong>{dashboardCardLabelMap.get(cardId) ?? cardId}</strong>
                        <small>{cardId}</small>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => moveDashboardCard(cardId, -1)}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => moveDashboardCard(cardId, 1)}
                        disabled={index === preferenceDraft.dashboardCardOrder.length - 1}
                      >
                        Down
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSavePreferences()}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              {isSavingPreferences ? 'Saving settings...' : 'Save core settings'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onResetPreferencesDraft}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              Reset changes
            </button>
          </div>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 2</p>
            <h2>Security center</h2>
            <p className="panel-value">
              {securityActiveCount} active session{securityActiveCount === 1 ? '' : 's'} •{' '}
              {clientDeviceSessionCount ?? securityThisDeviceCount} on this device
            </p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => void onRefreshSecuritySessions()}
              disabled={isLoadingSecuritySessions || isRefreshingSecuritySessions || isRevokingAllSessions}
            >
              {isLoadingSecuritySessions || isRefreshingSecuritySessions ? 'Refreshing...' : 'Refresh sessions'}
            </button>
            <button
              type="button"
              className="btn btn-danger btn--sm"
              onClick={() => void onSignOutAllSessions()}
              disabled={isRevokingAllSessions || (hasLoadedSecuritySessions && securitySessions.length === 0)}
            >
              {isRevokingAllSessions ? 'Signing out...' : 'Sign out all sessions'}
            </button>
          </div>
        </header>

        <p className="subnote">
          Uses Clerk session activity to show devices, browsers, and recent sign-in history. Revoking a session will end
          it across devices.
        </p>

        {!hasLoadedSecuritySessions && isLoadingSecuritySessions ? (
          <p className="empty-state">Loading session activity...</p>
        ) : securitySessions.length === 0 ? (
          <p className="empty-state">No active session activity found for this user.</p>
        ) : (
          <>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide" data-testid="settings-security-sessions-table">
                <caption className="sr-only">Active sessions and devices</caption>
                <thead>
                  <tr>
                    <th scope="col">Device</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last active</th>
                    <th scope="col">Signed in</th>
                    <th scope="col">Location</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {securitySessions.map((session) => (
                    <tr key={session.sessionId}>
                      <td>
                        <strong>{session.deviceLabel}</strong>
                        <small className="subnote">
                          {session.browserLabel}
                          {session.current ? ' • current' : session.onThisDevice ? ' • this device' : ''}
                        </small>
                      </td>
                      <td>
                        <span className={sessionStatusPill(session.status)}>{session.status}</span>
                      </td>
                      <td>{session.lastActiveAt > 0 ? cycleDateLabel.format(new Date(session.lastActiveAt)) : 'n/a'}</td>
                      <td>{session.createdAt > 0 ? cycleDateLabel.format(new Date(session.createdAt)) : 'n/a'}</td>
                      <td>
                        <strong>{session.locationLabel}</strong>
                        <small className="subnote">{session.ipAddress ?? 'No IP metadata'}</small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => void onRevokeSecuritySession(session.sessionId)}
                          disabled={isRevokingAllSessions || revokingSecuritySessionId === session.sessionId}
                        >
                          {revokingSecuritySessionId === session.sessionId ? 'Revoking...' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bulk-summary" aria-label="Recent sign-in activity">
              <div>
                <p>Recent sign-ins</p>
                <strong>{recentSecurityActivity.length}</strong>
                <small>Latest session creations</small>
              </div>
              <div>
                <p>Newest sign-in</p>
                <strong>
                  {recentSecurityActivity[0]?.createdAt
                    ? cycleDateLabel.format(new Date(recentSecurityActivity[0].createdAt))
                    : 'n/a'}
                </strong>
                <small>{recentSecurityActivity[0]?.browserLabel ?? 'No session activity'}</small>
              </div>
              <div>
                <p>Most recent activity</p>
                <strong>
                  {securitySessions[0]?.lastActiveAt ? cycleDateLabel.format(new Date(securitySessions[0].lastActiveAt)) : 'n/a'}
                </strong>
                <small>{securitySessions[0]?.deviceLabel ?? 'No active sessions'}</small>
              </div>
            </div>
          </>
        )}
      </article>

      <article className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Settings</p>
            <h2>Trust + compliance center</h2>
            <p className="panel-value">Privacy, export, deletion, and retention controls</p>
          </div>
        </header>

        <div className="trust-kpi-grid" aria-label="Settings overview metrics">
          <div className="trust-kpi-tile">
            <p>Diagnostics</p>
            <strong>{consentSettings.diagnosticsEnabled ? 'On' : 'Off'}</strong>
            <small>Sentry opt-in</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Analytics</p>
            <strong>{consentSettings.analyticsEnabled ? 'On' : 'Off'}</strong>
            <small>Product analytics toggle</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Consent events</p>
            <strong>{consentLogs.length}</strong>
            <small>Audit trail entries</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Latest export</p>
            <strong>{latestExport ? latestExport.status : 'none'}</strong>
            <small>{latestExport ? cycleDateLabel.format(new Date(latestExport.createdAt)) : 'No export yet'}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Deletion job</p>
            <strong>{latestDeletionJob ? latestDeletionJob.status : 'none'}</strong>
            <small>
              {latestDeletionJob ? cycleDateLabel.format(new Date(latestDeletionJob.updatedAt)) : 'No deletion jobs'}
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Retention enabled</p>
            <strong>{retentionEnabledCount}</strong>
            <small>{retentionForeverCount} set to forever</small>
          </div>
        </div>
      </article>

      <article className="panel panel-launch">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Quick actions</p>
            <h2>Immediate operations</h2>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => void onGenerateExport()} disabled={isExporting}>
              {isExporting ? 'Generating export...' : 'Generate export (ZIP)'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onDownloadLatestExport()}
              disabled={!latestExport || latestExport.status !== 'ready'}
            >
              Download latest export
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onRunRetentionNow()}
              disabled={isApplyingRetention}
            >
              {isApplyingRetention ? 'Applying retention...' : 'Run retention now'}
            </button>
          </div>

          {latestExport ? (
            <div className="bulk-summary" aria-label="Latest export details">
              <div>
                <p>Export status</p>
                <strong>
                  <span className={exportStatusPill(latestExport.status)}>{latestExport.status}</span>
                </strong>
                <small>{cycleDateLabel.format(new Date(latestExport.createdAt))}</small>
              </div>
              <div>
                <p>Export size</p>
                <strong>{latestExport.byteSize ? `${Math.max(1, Math.round(latestExport.byteSize / 1024))} KB` : 'n/a'}</strong>
                <small>Expires {cycleDateLabel.format(new Date(latestExport.expiresAt))}</small>
              </div>
            </div>
          ) : (
            <p className="subnote">No export has been generated yet.</p>
          )}

          {latestDeletionJob ? (
            <p className="subnote">
              Latest deletion job:{' '}
              <span className={deletionStatusPill(latestDeletionJob.status)}>{latestDeletionJob.status}</span>
              {deletionProgress ? ` • ${deletionProgress}` : ''}
            </p>
          ) : (
            <p className="subnote">No deletion jobs recorded.</p>
          )}
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data portability</p>
            <h2>Export history</h2>
            <p className="panel-value">
              {exportHistory.length} export job{exportHistory.length === 1 ? '' : 's'} tracked
            </p>
          </div>
        </header>

        {!hasExportHistory ? (
          <p className="empty-state">No export jobs yet. Generate a ZIP export to create your first record.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="settings-export-history-table">
              <caption className="sr-only">Export history</caption>
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                  <th scope="col">Format</th>
                  <th scope="col">Size</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exportHistory.map((entry) => (
                  <tr key={entry._id}>
                    <td>{cycleDateLabel.format(new Date(entry.createdAt))}</td>
                    <td>
                      <span className={exportStatusPill(entry.status)}>{entry.status}</span>
                    </td>
                    <td>{entry.formatVersion}</td>
                    <td>{entry.byteSize ? `${Math.max(1, Math.round(entry.byteSize / 1024))} KB` : 'n/a'}</td>
                    <td>{cycleDateLabel.format(new Date(entry.expiresAt))}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => void onDownloadExportById(String(entry._id))}
                        disabled={entry.status !== 'ready'}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data portability</p>
            <h2>Download audit trail</h2>
            <p className="panel-value">
              {exportDownloadLogs.length} download event{exportDownloadLogs.length === 1 ? '' : 's'} recorded
            </p>
          </div>
        </header>

        {!hasExportDownloadAudit ? (
          <p className="empty-state">No export downloads recorded yet.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="settings-export-download-audit-table">
              <caption className="sr-only">Export download audit trail</caption>
              <thead>
                <tr>
                  <th scope="col">Downloaded</th>
                  <th scope="col">Export ID</th>
                  <th scope="col">File</th>
                  <th scope="col">Size</th>
                  <th scope="col">Source</th>
                  <th scope="col">User agent</th>
                </tr>
              </thead>
              <tbody>
                {exportDownloadLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td>{cycleDateLabel.format(new Date(entry.downloadedAt))}</td>
                    <td><code>{String(entry.exportId)}</code></td>
                    <td>{entry.filename}</td>
                    <td>{entry.byteSize ? `${Math.max(1, Math.round(entry.byteSize / 1024))} KB` : 'n/a'}</td>
                    <td>{entry.source ?? 'http_download'}</td>
                    <td>{entry.userAgent ?? 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Privacy</p>
            <h2>Consent controls</h2>
            <p className="panel-value">Directly controls diagnostics and analytics collection</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="diagnostics-toggle">
                <input
                  id="diagnostics-toggle"
                  type="checkbox"
                  checked={consentSettings.diagnosticsEnabled}
                  onChange={(event) => void onToggleConsent('diagnostics', event.target.checked)}
                />
                Diagnostics (Sentry) opt-in
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="analytics-toggle">
                <input
                  id="analytics-toggle"
                  type="checkbox"
                  checked={consentSettings.analyticsEnabled}
                  onChange={(event) => void onToggleConsent('analytics', event.target.checked)}
                />
                Product analytics opt-in (placeholder)
              </label>
            </div>
          </div>

          <p className="form-hint">
            Changes are persisted and written to <strong>consent logs</strong> for audit history.
          </p>

          <div className="bulk-summary" aria-label="Data use explanations">
            <div>
              <p>Diagnostics (Sentry)</p>
              <strong>{consentSettings.diagnosticsEnabled ? 'Enabled' : 'Disabled'}</strong>
              <small>Error diagnostics only when you opt in. Finance records are not intentionally sent.</small>
            </div>
            <div>
              <p>Product analytics</p>
              <strong>{consentSettings.analyticsEnabled ? 'Enabled' : 'Disabled'}</strong>
              <small>Placeholder toggle for future analytics integration. No analytics SDK required in this phase.</small>
            </div>
            <div>
              <p>Data portability</p>
              <strong>ZIP export</strong>
              <small>JSON + CSV export files expire based on retention settings and downloads are audit logged.</small>
            </div>
          </div>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Audit</p>
            <h2>Consent history</h2>
            <p className="panel-value">{visibleConsentLogs.length} in view</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search consent history"
              placeholder="Search type, version, state…"
              value={consentSearch}
              onChange={(event) => setConsentSearch(event.target.value)}
            />
            <select
              aria-label="Filter consent type"
              value={consentFilter}
              onChange={(event) => setConsentFilter(event.target.value as ConsentFilter)}
            >
              <option value="all">All types</option>
              <option value="diagnostics">Diagnostics</option>
              <option value="analytics">Analytics</option>
            </select>
            <select
              aria-label="Sort consent history"
              value={consentSort}
              onChange={(event) => setConsentSort(event.target.value as ConsentSortKey)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setConsentSearch('')
                setConsentFilter('all')
                setConsentSort('newest')
              }}
              disabled={!hasConsentFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {consentLogs.length === 0 ? (
          <p className="empty-state">No consent changes logged yet.</p>
        ) : visibleConsentLogs.length === 0 ? (
          <p className="empty-state">No consent events match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleConsentLogs.length} of {consentLogs.length} consent event{consentLogs.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table" data-testid="settings-consent-history-table">
                <caption className="sr-only">Consent history</caption>
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">State</th>
                    <th scope="col">Version</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleConsentLogs.map((entry) => (
                    <tr key={entry._id}>
                      <td>
                        <span className={consentTypePill(entry.consentType)}>{entry.consentType}</span>
                      </td>
                      <td>
                        <span className={entry.enabled ? 'pill pill--good' : 'pill pill--neutral'}>
                          {entry.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </td>
                      <td>{entry.version}</td>
                      <td>{cycleDateLabel.format(new Date(entry.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Danger zone</p>
            <h2>Delete my Convex data</h2>
            <p className="panel-value">This removes your app records only</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="delete-confirm">Type DELETE to confirm</label>
              <input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
              />
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void onRequestDeletion()}
              disabled={isDeleting || !deleteReady}
            >
              {isDeleting ? 'Deleting...' : 'Delete my data'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => setDeleteConfirmText('')}
              disabled={deleteConfirmText.length === 0 || isDeleting}
            >
              Clear
            </button>
          </div>

          <p className="form-hint">
            You must type <strong>DELETE</strong> exactly before the action is enabled.
          </p>

          {latestDeletionJob ? (
            <p className="subnote">
              Latest job status: <span className={deletionStatusPill(latestDeletionJob.status)}>{latestDeletionJob.status}</span> •{' '}
              {cycleDateLabel.format(new Date(latestDeletionJob.updatedAt))}
              {deletionProgress ? ` • ${deletionProgress}` : ''}
            </p>
          ) : null}
        </div>
      </article>

      <article className="panel panel-audit-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Operations</p>
            <h2>Retention policies</h2>
            <p className="panel-value">
              {visibleRetentionPolicies.length} in view • {retentionEnabledCount} enabled
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search retention policies"
              placeholder="Search policies…"
              value={retentionSearch}
              onChange={(event) => setRetentionSearch(event.target.value)}
            />
            <select
              aria-label="Sort retention policies"
              value={retentionSort}
              onChange={(event) => setRetentionSort(event.target.value as RetentionSortKey)}
            >
              <option value="policy_asc">Policy (A-Z)</option>
              <option value="retention_desc">Retention (high-low)</option>
              <option value="enabled_first">Enabled first</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void onRunRetentionNow()}
              disabled={isApplyingRetention}
            >
              {isApplyingRetention ? 'Applying...' : 'Run retention now'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setRetentionSearch('')
                setRetentionSort('policy_asc')
              }}
              disabled={!hasRetentionFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {retentionPolicies.length === 0 ? (
          <p className="empty-state">Retention policies are unavailable.</p>
        ) : visibleRetentionPolicies.length === 0 ? (
          <p className="empty-state">No retention policies match this filter.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="settings-retention-table">
              <caption className="sr-only">Retention policies</caption>
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Enabled</th>
                  <th scope="col">Retention</th>
                  <th scope="col">Update</th>
                </tr>
              </thead>
              <tbody>
                {visibleRetentionPolicies.map((policy) => (
                  <tr key={policy.policyKey}>
                    <td>{policyLabel(policy.policyKey)}</td>
                    <td>
                      <span className={policy.enabled ? 'pill pill--good' : 'pill pill--neutral'}>
                        {policy.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                    <td>{policy.retentionDays === 0 ? 'Forever' : `${policy.retentionDays} days`}</td>
                    <td>
                      <div className="inline-cadence-controls">
                        <select
                          aria-label={`Retention days for ${policyLabel(policy.policyKey)}`}
                          value={policy.retentionDays}
                          onChange={(event) =>
                            void onUpsertRetention(policy.policyKey, Number(event.target.value), policy.enabled)
                          }
                        >
                          {presetOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Retention enabled state for ${policyLabel(policy.policyKey)}`}
                          value={policy.enabled ? 'enabled' : 'disabled'}
                          onChange={(event) =>
                            void onUpsertRetention(
                              policy.policyKey,
                              policy.retentionDays,
                              event.target.value === 'enabled',
                            )
                          }
                        >
                          <option value="disabled">Disabled</option>
                          <option value="enabled">Enabled</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}
