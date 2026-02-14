import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type OfflineQueueStatus = 'queued' | 'conflict'

export type OfflineQueueEntry = {
  id: string
  key: string
  args: unknown
  status: OfflineQueueStatus
  attempts: number
  lastError?: string
  createdAt: number
}

type OfflineExecutorMap = Record<string, (args: unknown) => Promise<unknown>>

type UseOfflineQueueArgs = {
  storageKey: string
  executors: OfflineExecutorMap
}

const parseStoredQueue = (value: string | null): OfflineQueueEntry[] => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as OfflineQueueEntry[]) : []
  } catch {
    return []
  }
}

const isNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('failed to fetch')
  )
}

const isConflictError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('not found') ||
    message.includes('validation') ||
    message.includes('unauthorized') ||
    message.includes('ownership')
  )
}

export const useOfflineQueue = ({ storageKey, executors }: UseOfflineQueueArgs) => {
  const [entries, setEntries] = useState<OfflineQueueEntry[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }
    return parseStoredQueue(window.localStorage.getItem(storageKey))
  })
  const [isFlushing, setIsFlushing] = useState(false)
  const executorsRef = useRef<OfflineExecutorMap>(executors)

  useEffect(() => {
    executorsRef.current = executors
  }, [executors])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(entries))
  }, [entries, storageKey])

  const enqueue = useCallback((key: string, args: unknown, status: OfflineQueueStatus = 'queued', lastError?: string) => {
    setEntries((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key,
        args,
        status,
        attempts: 0,
        createdAt: Date.now(),
        lastError,
      },
    ])
  }, [])

  const flushQueue = useCallback(async () => {
    if (isFlushing) {
      return
    }

    setIsFlushing(true)
    try {
      const snapshot = [...entries]
      for (const entry of snapshot) {
        if (entry.status !== 'queued') {
          continue
        }

        const executor = executorsRef.current[entry.key]
        if (!executor) {
          setEntries((previous) =>
            previous.map((current) =>
              current.id === entry.id
                ? { ...current, status: 'conflict', lastError: `Missing executor: ${entry.key}` }
                : current,
            ),
          )
          continue
        }

        try {
          await executor(entry.args)
          setEntries((previous) => previous.filter((current) => current.id !== entry.id))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setEntries((previous) =>
            previous.map((current) =>
              current.id === entry.id
                ? {
                    ...current,
                    status: isConflictError(error) ? 'conflict' : 'queued',
                    attempts: current.attempts + 1,
                    lastError: message,
                  }
                : current,
            ),
          )
        }
      }
    } finally {
      setIsFlushing(false)
    }
  }, [entries, isFlushing])

  useEffect(() => {
    const onOnline = () => {
      void flushQueue()
    }

    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [flushQueue])

  const runOrQueue = useCallback(
    async <TArgs, TResult>(key: string, args: TArgs, execute: (payload: TArgs) => Promise<TResult>) => {
      if (!navigator.onLine) {
        enqueue(key, args, 'queued', 'Queued while offline')
        return { queued: true as const, result: null }
      }

      try {
        const result = await execute(args)
        return { queued: false as const, result }
      } catch (error) {
        if (isNetworkError(error)) {
          enqueue(key, args, 'queued', 'Queued after network failure')
          return { queued: true as const, result: null }
        }
        throw error
      }
    },
    [enqueue],
  )

  const retryEntry = useCallback(
    async (id: string) => {
      setEntries((previous) =>
        previous.map((entry) => (entry.id === id ? { ...entry, status: 'queued', lastError: undefined } : entry)),
      )
      await flushQueue()
    },
    [flushQueue],
  )

  const discardEntry = useCallback((id: string) => {
    setEntries((previous) => previous.filter((entry) => entry.id !== id))
  }, [])

  const clearConflicts = useCallback(() => {
    setEntries((previous) => previous.filter((entry) => entry.status !== 'conflict'))
  }, [])

  const pendingCount = useMemo(() => entries.filter((entry) => entry.status === 'queued').length, [entries])
  const conflictCount = useMemo(() => entries.filter((entry) => entry.status === 'conflict').length, [entries])

  return {
    entries,
    pendingCount,
    conflictCount,
    isFlushing,
    runOrQueue,
    flushQueue,
    retryEntry,
    discardEntry,
    clearConflicts,
  }
}

