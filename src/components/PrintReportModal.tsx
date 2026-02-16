import { useEffect, useMemo, useState } from 'react'

type PrintReportConfig = {
  startMonth: string
  endMonth: string
  includeNotes: boolean
  includeAuditLogs: boolean
  includePurchases: boolean
}

type PrintReportModalProps = {
  open: boolean
  onClose: () => void
  onStartPrint: (config: PrintReportConfig) => void
  locale?: string
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const isValidMonthKey = (value: string) => /^\d{4}-\d{2}$/.test(value)

export function PrintReportModal({ open, onClose, onStartPrint, locale }: PrintReportModalProps) {
  const defaults = useMemo(() => {
    const now = new Date()
    const current = monthKey(now)
    return {
      startMonth: current,
      endMonth: current,
    }
  }, [])

  const [startMonthValue, setStartMonthValue] = useState(defaults.startMonth)
  const [endMonthValue, setEndMonthValue] = useState(defaults.endMonth)
  const [includePurchases, setIncludePurchases] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [includeAuditLogs, setIncludeAuditLogs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthLabel = useMemo(() => {
    const resolved = locale || 'en-US'
    return new Intl.DateTimeFormat(resolved, { month: 'short', year: 'numeric' })
  }, [locale])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  const validate = () => {
    if (!isValidMonthKey(startMonthValue) || !isValidMonthKey(endMonthValue)) {
      return 'Choose a valid month range.'
    }
    if (startMonthValue > endMonthValue) {
      return 'Start month must be before end month.'
    }
    return null
  }

  const formatMonth = (value: string) => {
    if (!isValidMonthKey(value)) return 'n/a'
    return monthLabel.format(new Date(`${value}-01T00:00:00`))
  }

  const startPrint = () => {
    const message = validate()
    if (message) {
      setError(message)
      return
    }

    onStartPrint({
      startMonth: startMonthValue,
      endMonth: endMonthValue,
      includeNotes,
      includeAuditLogs,
      includePurchases,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal modal--report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-report-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header modal__header--report">
          <div>
            <p className="panel-kicker">Report</p>
            <h2 id="print-report-title">Print Report</h2>
            <p className="subnote">Choose month range and sections to include in the print view.</p>
          </div>
          <button type="button" className="btn btn-ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="modal__body modal__body--report">
          <div className="modal-grid modal-grid--report">
            <label className="modal-field-card" htmlFor="print-start-month">
              <span>Start month</span>
              <input
                id="print-start-month"
                type="month"
                value={startMonthValue}
                onChange={(event) => {
                  setStartMonthValue(event.target.value)
                  if (error) setError(null)
                }}
              />
              <small className="subnote">Selected: {formatMonth(startMonthValue)}</small>
            </label>

            <label className="modal-field-card" htmlFor="print-end-month">
              <span>End month</span>
              <input
                id="print-end-month"
                type="month"
                value={endMonthValue}
                onChange={(event) => {
                  setEndMonthValue(event.target.value)
                  if (error) setError(null)
                }}
              />
              <small className="subnote">Selected: {formatMonth(endMonthValue)}</small>
            </label>
          </div>

          <div className="modal-range-summary" aria-label="Current selected range">
            <span className="pill pill--neutral">{formatMonth(startMonthValue)}</span>
            <span className="pill pill--neutral">to</span>
            <span className="pill pill--neutral">{formatMonth(endMonthValue)}</span>
          </div>

          <fieldset className="modal-options" aria-label="Report sections">
            <legend className="sr-only">Report sections</legend>

            <label className={`modal-option-row ${includePurchases ? 'modal-option-row--active' : ''}`} htmlFor="print-purchases">
              <input
                id="print-purchases"
                type="checkbox"
                checked={includePurchases}
                onChange={(event) => setIncludePurchases(event.target.checked)}
              />
              <div>
                <strong>Include purchases</strong>
                <small>Recommended for complete spending totals.</small>
              </div>
            </label>

            <label className={`modal-option-row ${includeNotes ? 'modal-option-row--active' : ''}`} htmlFor="print-notes">
              <input
                id="print-notes"
                type="checkbox"
                checked={includeNotes}
                onChange={(event) => setIncludeNotes(event.target.checked)}
              />
              <div>
                <strong>Include notes</strong>
                <small>Add free-text context from records.</small>
              </div>
            </label>

            <label className={`modal-option-row ${includeAuditLogs ? 'modal-option-row--active' : ''}`} htmlFor="print-audit">
              <input
                id="print-audit"
                type="checkbox"
                checked={includeAuditLogs}
                onChange={(event) => setIncludeAuditLogs(event.target.checked)}
              />
              <div>
                <strong>Include audit logs</strong>
                <small>Add cycle and audit trail activity for the range.</small>
              </div>
            </label>
          </fieldset>

          {error ? <p className="error-banner">{error}</p> : null}
        </div>

        <footer className="modal__footer modal__footer--report">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={startPrint}>
            Preview & Print
          </button>
        </footer>
      </div>
    </div>
  )
}

export type { PrintReportConfig }
