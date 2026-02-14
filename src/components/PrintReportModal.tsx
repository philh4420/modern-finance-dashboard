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
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Print report"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <p className="panel-kicker">Report</p>
            <h2>Print Report</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="modal__body">
          <div className="modal-grid">
            <label>
              Start month
              <input
                type="month"
                value={startMonthValue}
                onChange={(event) => setStartMonthValue(event.target.value)}
              />
              <small className="subnote">Selected: {isValidMonthKey(startMonthValue) ? monthLabel.format(new Date(`${startMonthValue}-01T00:00:00`)) : 'n/a'}</small>
            </label>

            <label>
              End month
              <input
                type="month"
                value={endMonthValue}
                onChange={(event) => setEndMonthValue(event.target.value)}
              />
              <small className="subnote">Selected: {isValidMonthKey(endMonthValue) ? monthLabel.format(new Date(`${endMonthValue}-01T00:00:00`)) : 'n/a'}</small>
            </label>
          </div>

          <div className="entry-form" style={{ marginTop: '0.8rem' }}>
            <label className="checkbox-row" htmlFor="print-purchases">
              <input
                id="print-purchases"
                type="checkbox"
                checked={includePurchases}
                onChange={(event) => setIncludePurchases(event.target.checked)}
              />
              Include purchases (recommended)
            </label>

            <label className="checkbox-row" htmlFor="print-notes">
              <input
                id="print-notes"
                type="checkbox"
                checked={includeNotes}
                onChange={(event) => setIncludeNotes(event.target.checked)}
              />
              Include notes
            </label>

            <label className="checkbox-row" htmlFor="print-audit">
              <input
                id="print-audit"
                type="checkbox"
                checked={includeAuditLogs}
                onChange={(event) => setIncludeAuditLogs(event.target.checked)}
              />
              Include audit logs
            </label>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}
        </div>

        <footer className="modal__footer">
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
