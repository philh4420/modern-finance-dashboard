import { useEffect, useMemo, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useAuth, useClerk, useSessionList, useUser } from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'
import type {
  BillCategory,
  BillScope,
  DashboardCardId,
  DefaultMonthPreset,
  FinancePreference,
  PrivacyData,
  PurchaseOwnership,
  RetentionPolicyRow,
  SecuritySessionActivity,
  UiDensity,
  WeekStartDay,
} from '../components/financeTypes'
import {
  dashboardCardOrderOptions,
  defaultPreference,
  fallbackLocaleOptions,
  tabs,
  currencyOptions,
} from '../lib/financeConstants'
import { isValidLocale } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseSettingsSectionArgs = {
  preference: FinancePreference
} & MutationHandlers

type ExportActionResult =
  | { exportId: string; status: 'ready' }
  | { exportId: string; status: 'failed'; reason: string }

type SettingsPreferenceDraft = {
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
  defaultPurchaseOwnership: PurchaseOwnership
  defaultPurchaseCategory: string
  billNotesTemplate: string
  purchaseNotesTemplate: string
  uiDensity: UiDensity
  defaultLandingTab: FinancePreference['defaultLandingTab']
  dashboardCardOrder: DashboardCardId[]
}

const weekStartDayOptions: Array<{ value: WeekStartDay; label: string }> = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
]

const defaultMonthPresetOptions: Array<{ value: DefaultMonthPreset; label: string }> = [
  { value: 'current', label: 'Current month' },
  { value: 'previous', label: 'Previous month' },
  { value: 'next', label: 'Next month' },
  { value: 'last_used', label: 'Last used month' },
]

const uiDensityOptions: Array<{ value: UiDensity; label: string }> = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

const commonTimezones = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Toronto',
  'Australia/Sydney',
]

const resolveConvexSiteUrl = () => {
  const raw = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined
  if (!raw) return null
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const toEpoch = (value: Date | null | undefined) => {
  if (!value) return 0
  const time = value.getTime()
  return Number.isFinite(time) ? time : 0
}

const buildPreferenceDraft = (preference: FinancePreference): SettingsPreferenceDraft => ({
  displayName: preference.displayName ?? defaultPreference.displayName,
  currency: preference.currency ?? defaultPreference.currency,
  locale: preference.locale ?? defaultPreference.locale,
  timezone: preference.timezone ?? defaultPreference.timezone,
  weekStartDay: preference.weekStartDay ?? defaultPreference.weekStartDay,
  defaultMonthPreset: preference.defaultMonthPreset ?? defaultPreference.defaultMonthPreset,
  dueRemindersEnabled: preference.dueRemindersEnabled ?? defaultPreference.dueRemindersEnabled,
  dueReminderDays: String(preference.dueReminderDays ?? defaultPreference.dueReminderDays),
  monthlyCycleAlertsEnabled: preference.monthlyCycleAlertsEnabled ?? defaultPreference.monthlyCycleAlertsEnabled,
  reconciliationRemindersEnabled:
    preference.reconciliationRemindersEnabled ?? defaultPreference.reconciliationRemindersEnabled,
  goalAlertsEnabled: preference.goalAlertsEnabled ?? defaultPreference.goalAlertsEnabled,
  defaultBillCategory: preference.defaultBillCategory ?? defaultPreference.defaultBillCategory,
  defaultBillScope: preference.defaultBillScope ?? defaultPreference.defaultBillScope,
  defaultPurchaseOwnership: preference.defaultPurchaseOwnership ?? defaultPreference.defaultPurchaseOwnership,
  defaultPurchaseCategory: preference.defaultPurchaseCategory ?? defaultPreference.defaultPurchaseCategory,
  billNotesTemplate: preference.billNotesTemplate ?? defaultPreference.billNotesTemplate,
  purchaseNotesTemplate: preference.purchaseNotesTemplate ?? defaultPreference.purchaseNotesTemplate,
  uiDensity: preference.uiDensity ?? defaultPreference.uiDensity,
  defaultLandingTab: preference.defaultLandingTab ?? defaultPreference.defaultLandingTab,
  dashboardCardOrder:
    preference.dashboardCardOrder && preference.dashboardCardOrder.length > 0
      ? [...preference.dashboardCardOrder]
      : [...defaultPreference.dashboardCardOrder],
})

const normalizeDashboardCardOrder = (order: DashboardCardId[]) => {
  const validIds = new Set(dashboardCardOrderOptions.map((option) => option.id))
  const seen = new Set<string>()
  const normalized: DashboardCardId[] = []

  for (const id of order) {
    if (!validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
  }

  for (const option of dashboardCardOrderOptions) {
    if (!seen.has(option.id)) {
      normalized.push(option.id)
    }
  }

  return normalized
}

export const useSettingsSection = ({ preference, clearError, handleMutationError }: UseSettingsSectionArgs) => {
  const privacyData = useQuery(api.privacy.getPrivacyData) as PrivacyData | undefined
  const retentionData = useQuery(api.ops.getRetentionPolicies) as { policies: RetentionPolicyRow[] } | undefined

  const setConsent = useMutation(api.privacy.setConsent)
  const upsertRetentionPolicy = useMutation(api.privacy.upsertRetentionPolicy)
  const upsertFinancePreference = useMutation(api.finance.upsertFinancePreference)

  const generateUserExport = useAction(api.privacy.generateUserExport)
  const requestDeletion = useAction(api.privacy.requestDeletion)
  const applyRetentionForUser = useAction(api.ops.applyRetentionForUser)

  const { getToken, sessionId } = useAuth()
  const clerk = useClerk()
  const { user, isLoaded: isUserLoaded } = useUser()
  const { isLoaded: isSessionListLoaded, sessions: clientDeviceSessions } = useSessionList()

  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isApplyingRetention, setIsApplyingRetention] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [securitySessions, setSecuritySessions] = useState<SecuritySessionActivity[]>([])
  const [isLoadingSecuritySessions, setIsLoadingSecuritySessions] = useState(false)
  const [isRefreshingSecuritySessions, setIsRefreshingSecuritySessions] = useState(false)
  const [hasLoadedSecuritySessions, setHasLoadedSecuritySessions] = useState(false)
  const [revokingSecuritySessionId, setRevokingSecuritySessionId] = useState<string | null>(null)
  const [isRevokingAllSessions, setIsRevokingAllSessions] = useState(false)
  const [preferenceDraft, setPreferenceDraft] = useState<SettingsPreferenceDraft>(() => buildPreferenceDraft(preference))
  const latestPreferenceRef = useRef(preference)
  latestPreferenceRef.current = preference

  const preferenceSignature = JSON.stringify(preference)

  useEffect(() => {
    setPreferenceDraft(buildPreferenceDraft(latestPreferenceRef.current))
  }, [preferenceSignature])

  const clientDeviceSessionIdSet = useMemo(
    () => new Set((clientDeviceSessions ?? []).map((session) => session.id)),
    [clientDeviceSessions],
  )
  const clientDeviceSessionSignature = useMemo(
    () => (clientDeviceSessions ?? []).map((session) => session.id).sort().join('|'),
    [clientDeviceSessions],
  )

  const refreshSecuritySessions = async () => {
    if (!isUserLoaded || !user) {
      setSecuritySessions([])
      setHasLoadedSecuritySessions(true)
      return
    }

    const setLoadingState = hasLoadedSecuritySessions ? setIsRefreshingSecuritySessions : setIsLoadingSecuritySessions
    setLoadingState(true)
    clearError()

    try {
      const sessions = await user.getSessions()
      const rows = sessions
        .map<SecuritySessionActivity>((session) => {
          const latestActivity = session.latestActivity
          const sessionWithMaybeCreatedAt = session as unknown as { createdAt?: Date | null }
          const browserLabel = [latestActivity?.browserName, latestActivity?.browserVersion].filter(Boolean).join(' ') || 'Unknown browser'
          const deviceLabel = latestActivity?.deviceType || (latestActivity?.isMobile ? 'mobile' : 'device')
          const locationLabel =
            [latestActivity?.city, latestActivity?.country].filter(Boolean).join(', ') ||
            (latestActivity?.ipAddress ? 'IP only' : 'Unknown location')

          return {
            sessionId: session.id,
            status: session.status,
            createdAt: toEpoch(sessionWithMaybeCreatedAt.createdAt) || toEpoch(session.lastActiveAt),
            lastActiveAt: toEpoch(session.lastActiveAt),
            expiresAt: toEpoch(session.expireAt),
            deviceLabel,
            browserLabel,
            locationLabel,
            ipAddress: latestActivity?.ipAddress ?? null,
            current: session.id === sessionId,
            onThisDevice: clientDeviceSessionIdSet.has(session.id),
          }
        })
        .sort((left, right) => {
          if (right.lastActiveAt !== left.lastActiveAt) return right.lastActiveAt - left.lastActiveAt
          return right.createdAt - left.createdAt
        })

      setSecuritySessions(rows)
      setHasLoadedSecuritySessions(true)
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsLoadingSecuritySessions(false)
      setIsRefreshingSecuritySessions(false)
    }
  }

  useEffect(() => {
    if (!isUserLoaded) return
    void refreshSecuritySessions()
    // Intentionally driven by user/session identity and local client session list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, user?.id, sessionId, isSessionListLoaded, clientDeviceSessionSignature])

  const retentionPolicies = retentionData?.policies ?? []
  const exportHistory = privacyData?.exportHistory ?? []
  const exportDownloadLogs = privacyData?.exportDownloadLogs ?? []

  const localeOptions = useMemo(() => {
    const fromNavigator = typeof navigator !== 'undefined' ? navigator.languages : []
    const combined = Array.from(new Set([...fallbackLocaleOptions, ...fromNavigator, preferenceDraft.locale]))
    return combined.filter((locale) => isValidLocale(locale))
  }, [preferenceDraft.locale])

  const timezoneOptions = useMemo(() => {
    const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (input: 'timeZone') => string[] }).supportedValuesOf
    const supported = supportedValuesOf ? supportedValuesOf('timeZone') : []
    const combined = Array.from(new Set([...commonTimezones, ...supported, preferenceDraft.timezone]))
    return combined
  }, [preferenceDraft.timezone])

  const defaultLandingTabOptions = useMemo(
    () => tabs.map((tab) => ({ value: tab.key, label: tab.label })),
    [],
  )

  const normalizedDraftOrder = useMemo(
    () => normalizeDashboardCardOrder(preferenceDraft.dashboardCardOrder),
    [preferenceDraft.dashboardCardOrder],
  )

  const serverPreferenceSnapshot = buildPreferenceDraft(latestPreferenceRef.current)
  const hasUnsavedPreferences =
    JSON.stringify({ ...preferenceDraft, dashboardCardOrder: normalizedDraftOrder }) !==
    JSON.stringify({ ...serverPreferenceSnapshot, dashboardCardOrder: normalizeDashboardCardOrder(serverPreferenceSnapshot.dashboardCardOrder) })

  const onToggleConsent = async (consentType: 'diagnostics' | 'analytics', enabled: boolean) => {
    clearError()
    try {
      await setConsent({ consentType, enabled })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onUpsertRetention = async (policyKey: RetentionPolicyRow['policyKey'], retentionDays: number, enabled: boolean) => {
    clearError()
    try {
      await upsertRetentionPolicy({ policyKey, retentionDays, enabled })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onSavePreferences = async () => {
    clearError()
    setIsSavingPreferences(true)
    try {
      const dueReminderDays = Number.parseInt(preferenceDraft.dueReminderDays.trim(), 10)
      if (!Number.isInteger(dueReminderDays) || dueReminderDays < 0 || dueReminderDays > 60) {
        throw new Error('Due reminder lead days must be an integer between 0 and 60.')
      }

      await upsertFinancePreference({
        currency: preferenceDraft.currency,
        locale: preferenceDraft.locale,
        displayName: preferenceDraft.displayName,
        timezone: preferenceDraft.timezone,
        weekStartDay: preferenceDraft.weekStartDay,
        defaultMonthPreset: preferenceDraft.defaultMonthPreset,
        dueRemindersEnabled: preferenceDraft.dueRemindersEnabled,
        dueReminderDays,
        monthlyCycleAlertsEnabled: preferenceDraft.monthlyCycleAlertsEnabled,
        reconciliationRemindersEnabled: preferenceDraft.reconciliationRemindersEnabled,
        goalAlertsEnabled: preferenceDraft.goalAlertsEnabled,
        defaultBillCategory: preferenceDraft.defaultBillCategory,
        defaultBillScope: preferenceDraft.defaultBillScope,
        defaultPurchaseOwnership: preferenceDraft.defaultPurchaseOwnership,
        defaultPurchaseCategory: preferenceDraft.defaultPurchaseCategory,
        billNotesTemplate: preferenceDraft.billNotesTemplate,
        purchaseNotesTemplate: preferenceDraft.purchaseNotesTemplate,
        uiDensity: preferenceDraft.uiDensity,
        defaultLandingTab: preferenceDraft.defaultLandingTab,
        dashboardCardOrder: normalizedDraftOrder,
      })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const onResetPreferencesDraft = () => {
    clearError()
    setPreferenceDraft(buildPreferenceDraft(preference))
  }

  const moveDashboardCard = (cardId: DashboardCardId, direction: -1 | 1) => {
    setPreferenceDraft((prev) => {
      const order = normalizeDashboardCardOrder(prev.dashboardCardOrder)
      const index = order.indexOf(cardId)
      if (index < 0) return prev
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= order.length) return prev
      const nextOrder = [...order]
      const [item] = nextOrder.splice(index, 1)
      nextOrder.splice(nextIndex, 0, item)
      return {
        ...prev,
        dashboardCardOrder: nextOrder,
      }
    })
  }

  const onGenerateExport = async () => {
    clearError()
    setIsExporting(true)
    try {
      const result = (await generateUserExport({})) as ExportActionResult
      if (result.status === 'failed') {
        throw new Error(result.reason)
      }
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsExporting(false)
    }
  }

  const onDownloadExportById = async (exportId: string) => {
    clearError()
    try {
      const exportDoc = exportHistory.find((entry) => String(entry._id) === exportId) ?? privacyData?.latestExport ?? null
      if (!exportDoc) {
        throw new Error('Export record not found.')
      }
      const convexSiteUrl = resolveConvexSiteUrl()
      if (!convexSiteUrl) {
        throw new Error('Missing VITE_CONVEX_SITE_URL. Add it to your env vars to enable downloads.')
      }

      const token = (await getToken({ template: 'convex' })) ?? (await getToken())
      if (!token) {
        throw new Error('Unable to fetch an auth token for downloads.')
      }

      const response = await fetch(`${convexSiteUrl}/exports/download?exportId=${exportDoc._id}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `Download failed (${response.status}).`)
      }

      const blob = await response.blob()
      const filename = `finance-export-${new Date(exportDoc.createdAt).toISOString().slice(0, 10)}.zip`
      downloadBlob(blob, filename)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDownloadLatestExport = async () => {
    const latest = privacyData?.latestExport
    if (!latest) {
      handleMutationError(new Error('No export is available yet.'))
      return
    }
    await onDownloadExportById(String(latest._id))
  }

  const onRevokeSecuritySession = async (targetSessionId: string) => {
    if (!isUserLoaded || !user) {
      handleMutationError(new Error('User sessions are not loaded yet.'))
      return
    }

    clearError()
    setRevokingSecuritySessionId(targetSessionId)
    try {
      const sessions = await user.getSessions()
      const target = sessions.find((session) => session.id === targetSessionId)
      if (!target) {
        throw new Error('Session not found.')
      }
      await target.revoke()
      await refreshSecuritySessions()
      if (targetSessionId === sessionId) {
        await clerk.signOut()
      }
    } catch (error) {
      handleMutationError(error)
    } finally {
      setRevokingSecuritySessionId(null)
    }
  }

  const onSignOutAllSessions = async () => {
    if (!isUserLoaded || !user) {
      handleMutationError(new Error('User sessions are not loaded yet.'))
      return
    }

    clearError()
    setIsRevokingAllSessions(true)
    try {
      const sessions = await user.getSessions()
      await Promise.all(
        sessions
          .filter((session) => session.status === 'active' || session.status === 'pending')
          .map((session) => session.revoke()),
      )
      await refreshSecuritySessions()
      await clerk.signOut()
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsRevokingAllSessions(false)
    }
  }

  const onRequestDeletion = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      handleMutationError(new Error('Type DELETE to confirm data deletion.'))
      return
    }

    clearError()
    setIsDeleting(true)
    try {
      const result = (await requestDeletion({})) as { ok: boolean; reason?: string }
      if (!result.ok) {
        throw new Error(result.reason || 'Deletion failed.')
      }
      setDeleteConfirmText('')
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsDeleting(false)
    }
  }

  const onRunRetentionNow = async () => {
    clearError()
    setIsApplyingRetention(true)
    try {
      await applyRetentionForUser({})
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsApplyingRetention(false)
    }
  }

  return {
    privacyData,
    retentionPolicies,
    exportHistory,
    exportDownloadLogs,
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
    clientDeviceSessionCount: isSessionListLoaded ? clientDeviceSessions?.length ?? 0 : null,
    onRefreshSecuritySessions: refreshSecuritySessions,
    onRevokeSecuritySession,
    onSignOutAllSessions,
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
  }
}
