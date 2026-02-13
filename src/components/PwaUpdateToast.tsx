import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (!registration) {
        return
      }

      setInterval(() => {
        void registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  const dismiss = () => {
    setNeedRefresh(false)
  }

  if (!needRefresh) {
    return null
  }

  return (
    <aside className="pwa-update-toast" role="status" aria-live="polite" aria-label="Application update available">
      <div className="pwa-update-toast__body">
        <p className="pwa-update-toast__title">Update Available</p>
        <p className="pwa-update-toast__text">
          A new version is ready. Reload now to use the latest dashboard updates.
        </p>
      </div>
      <div className="pwa-update-toast__actions">
        <button type="button" className="btn btn-primary" onClick={() => void updateServiceWorker(true)}>
          Update Now
        </button>
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  )
}
