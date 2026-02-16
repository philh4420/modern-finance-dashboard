import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  ConsentLogEntry,
  ConsentSettingsView,
  DeletionJobEntry,
  RetentionPolicyRow,
  UserExportEntry,
} from './financeTypes'

type SettingsTabProps = {
  consentSettings: ConsentSettingsView
  consentLogs: ConsentLogEntry[]
  latestExport: UserExportEntry | null
  latestDeletionJob: DeletionJobEntry | null
  retentionPolicies: RetentionPolicyRow[]
  isExporting: boolean
  onGenerateExport: () => Promise<void>
  onDownloadLatestExport: () => Promise<void>
  deleteConfirmText: string
  setDeleteConfirmText: Dispatch<SetStateAction<string>>
  isDeleting: boolean
  onRequestDeletion: () => Promise<void>
  isApplyingRetention: boolean
  onRunRetentionNow: () => Promise<void>
  onToggleConsent: (type: 'diagnostics' | 'analytics', enabled: boolean) => Promise<void>
  onUpsertRetention: (policyKey: RetentionPolicyRow['policyKey'], retentionDays: number, enabled: boolean) => Promise<void>
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
  consentSettings,
  consentLogs,
  latestExport,
  latestDeletionJob,
  retentionPolicies,
  isExporting,
  onGenerateExport,
  onDownloadLatestExport,
  deleteConfirmText,
  setDeleteConfirmText,
  isDeleting,
  onRequestDeletion,
  isApplyingRetention,
  onRunRetentionNow,
  onToggleConsent,
  onUpsertRetention,
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

  const deleteReady = deleteConfirmText.trim().toUpperCase() === 'DELETE'

  return (
    <section className="content-grid" aria-label="Settings and trust controls">
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
