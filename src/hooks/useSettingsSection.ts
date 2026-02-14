import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useAuth } from '@clerk/clerk-react'
import { api } from '../../convex/_generated/api'
import type { PrivacyData, RetentionPolicyRow } from '../components/financeTypes'
import type { MutationHandlers } from './useMutationFeedback'

type UseSettingsSectionArgs = MutationHandlers

type ExportActionResult =
  | { exportId: string; status: 'ready' }
  | { exportId: string; status: 'failed'; reason: string }

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

export const useSettingsSection = ({ clearError, handleMutationError }: UseSettingsSectionArgs) => {
  const privacyData = useQuery(api.privacy.getPrivacyData) as PrivacyData | undefined
  const retentionData = useQuery(api.ops.getRetentionPolicies) as { policies: RetentionPolicyRow[] } | undefined

  const setConsent = useMutation(api.privacy.setConsent)
  const upsertRetentionPolicy = useMutation(api.privacy.upsertRetentionPolicy)

  const generateUserExport = useAction(api.privacy.generateUserExport)
  const requestDeletion = useAction(api.privacy.requestDeletion)
  const applyRetentionForUser = useAction(api.ops.applyRetentionForUser)

  const { getToken } = useAuth()

  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isApplyingRetention, setIsApplyingRetention] = useState(false)

  const retentionPolicies = retentionData?.policies ?? []

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

  const onDownloadLatestExport = async () => {
    clearError()
    try {
      const latest = privacyData?.latestExport
      if (!latest) {
        throw new Error('No export is available yet.')
      }
      const convexSiteUrl = resolveConvexSiteUrl()
      if (!convexSiteUrl) {
        throw new Error('Missing VITE_CONVEX_SITE_URL. Add it to your env vars to enable downloads.')
      }

      const token = (await getToken({ template: 'convex' })) ?? (await getToken())
      if (!token) {
        throw new Error('Unable to fetch an auth token for downloads.')
      }

      const response = await fetch(`${convexSiteUrl}/exports/download?exportId=${latest._id}`, {
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
      const filename = `finance-export-${new Date(latest.createdAt).toISOString().slice(0, 10)}.zip`
      downloadBlob(blob, filename)
    } catch (error) {
      handleMutationError(error)
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
  }
}
