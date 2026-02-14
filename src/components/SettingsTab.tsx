import type { Dispatch, SetStateAction } from 'react'
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
  return (
    <section className="content-grid" aria-label="Settings and trust controls">
      <article className="panel panel-settings-consent">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Privacy</p>
            <h2>Consent Controls</h2>
          </div>
        </header>

        <div className="entry-form">
          <label className="checkbox-row" htmlFor="diagnostics-toggle">
            <input
              id="diagnostics-toggle"
              type="checkbox"
              checked={consentSettings.diagnosticsEnabled}
              onChange={(event) => void onToggleConsent('diagnostics', event.target.checked)}
            />
            Diagnostics (Sentry) opt-in
          </label>

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

        <header className="panel-header" style={{ marginTop: '1rem' }}>
          <div>
            <p className="panel-kicker">Audit</p>
            <h3 className="settings-subtitle">Consent History</h3>
          </div>
        </header>

        {consentLogs.length === 0 ? (
          <p className="empty-state">No consent changes logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Consent history</caption>
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Enabled</th>
                  <th scope="col">Version</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {consentLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.consentType}</td>
                    <td>{entry.enabled ? 'yes' : 'no'}</td>
                    <td>{entry.version}</td>
                    <td>{cycleDateLabel.format(new Date(entry.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-settings-controls">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data Controls</p>
            <h2>Export + Delete</h2>
          </div>
        </header>

        <div className="entry-form">
          <button type="button" className="btn btn-primary" onClick={() => void onGenerateExport()} disabled={isExporting}>
            {isExporting ? 'Generating Export...' : 'Generate Export (ZIP)'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void onDownloadLatestExport()}
            disabled={!latestExport || latestExport.status !== 'ready'}
          >
            Download Latest Export
          </button>

          {latestExport ? (
            <p className="subnote">
              Latest export: {latestExport.status} • {cycleDateLabel.format(new Date(latestExport.createdAt))}
            </p>
          ) : (
            <p className="subnote">No exports generated yet.</p>
          )}
        </div>

        <header className="panel-header" style={{ marginTop: '1rem' }}>
          <div>
            <p className="panel-kicker">Danger Zone</p>
            <h3 className="settings-subtitle">Delete My Data</h3>
          </div>
        </header>

        <div className="entry-form">
          <label htmlFor="delete-confirm">Type DELETE to confirm</label>
          <input
            id="delete-confirm"
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
            placeholder="DELETE"
          />
          <button type="button" className="btn btn-ghost" onClick={() => void onRequestDeletion()} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete My Convex Data'}
          </button>

          {latestDeletionJob ? (
            <p className="subnote">
              Deletion job: {latestDeletionJob.status} • {cycleDateLabel.format(new Date(latestDeletionJob.updatedAt))}
            </p>
          ) : (
            <p className="subnote">No deletion jobs recorded.</p>
          )}
        </div>
      </article>

      <article className="panel panel-settings-retention">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Operations</p>
            <h2>Retention Policies</h2>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onRunRetentionNow()}
              disabled={isApplyingRetention}
            >
              {isApplyingRetention ? 'Applying...' : 'Run Retention Now'}
            </button>
          </div>
        </header>

        {retentionPolicies.length === 0 ? (
          <p className="empty-state">Retention policies are unavailable.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Retention policies</caption>
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Enabled</th>
                  <th scope="col">Retention</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {retentionPolicies.map((policy) => (
                  <tr key={policy.policyKey}>
                    <td>{policyLabel(policy.policyKey)}</td>
                    <td>{policy.enabled ? 'yes' : 'no'}</td>
                    <td>{policy.retentionDays === 0 ? 'Forever' : `${policy.retentionDays} days`}</td>
                    <td>
                      <div className="inline-cadence-controls">
                        <select
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
                          value={policy.enabled ? 'enabled' : 'disabled'}
                          onChange={(event) =>
                            void onUpsertRetention(policy.policyKey, policy.retentionDays, event.target.value === 'enabled')
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
