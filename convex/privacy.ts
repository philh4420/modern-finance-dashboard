import { v } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { requireIdentity } from './lib/authz'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { strToU8, zipSync } from 'fflate'

const consentTypeValidator = v.union(v.literal('diagnostics'), v.literal('analytics'))

const retentionPolicyKeyValidator = v.union(
  v.literal('exports'),
  v.literal('client_ops_metrics'),
  v.literal('cycle_audit_ledger'),
  v.literal('consent_logs'),
  v.literal('deletion_jobs'),
)

type DeletionTable =
  | 'incomePaymentChecks'
  | 'billPaymentChecks'
  | 'subscriptionPriceChanges'
  | 'incomeChangeEvents'
  | 'ledgerLines'
  | 'ledgerEntries'
  | 'financeAuditEvents'
  | 'monthCloseSnapshots'
  | 'monthlyCycleRuns'
  | 'cycleAuditLogs'
  | 'purchaseSplits'
  | 'purchases'
  | 'transactionRules'
  | 'envelopeBudgets'
  | 'incomeAllocationRules'
  | 'incomeAllocationSuggestions'
  | 'incomes'
  | 'bills'
  | 'cards'
  | 'loans'
  | 'accounts'
  | 'goals'
  | 'financePreferences'
  | 'consentLogs'
  | 'consentSettings'
  | 'retentionPolicies'
  | 'clientOpsMetrics'

const deletionTableValidator = v.union(
  v.literal('incomePaymentChecks'),
  v.literal('billPaymentChecks'),
  v.literal('subscriptionPriceChanges'),
  v.literal('incomeChangeEvents'),
  v.literal('ledgerLines'),
  v.literal('ledgerEntries'),
  v.literal('financeAuditEvents'),
  v.literal('monthCloseSnapshots'),
  v.literal('monthlyCycleRuns'),
  v.literal('cycleAuditLogs'),
  v.literal('purchaseSplits'),
  v.literal('purchases'),
  v.literal('transactionRules'),
  v.literal('envelopeBudgets'),
  v.literal('incomeAllocationRules'),
  v.literal('incomeAllocationSuggestions'),
  v.literal('incomes'),
  v.literal('bills'),
  v.literal('cards'),
  v.literal('loans'),
  v.literal('accounts'),
  v.literal('goals'),
  v.literal('financePreferences'),
  v.literal('consentLogs'),
  v.literal('consentSettings'),
  v.literal('retentionPolicies'),
  v.literal('clientOpsMetrics'),
)

const EXPORT_FORMAT_VERSION = 'finance_export_v1'
const CONSENT_VERSION = 'v1'

const nowPlusDays = (now: number, days: number) => now + days * 86400000

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return JSON.stringify({ error: 'Failed to serialize value.' }, null, 2)
  }
}

const csvEscape = (value: string) => {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

const toCsv = (rows: Array<Record<string, unknown>>) => {
  if (rows.length === 0) {
    return ''
  }

  const headerSet = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => headerSet.add(key))
  })
  const headers = Array.from(headerSet).sort((a, b) => a.localeCompare(b))

  const lines: string[] = []
  lines.push(headers.map(csvEscape).join(','))

  rows.forEach((row) => {
    const line = headers
      .map((key) => {
        const raw = row[key]
        if (raw === undefined || raw === null) {
          return ''
        }
        if (typeof raw === 'string') {
          return csvEscape(raw)
        }
        if (typeof raw === 'number' || typeof raw === 'boolean') {
          return String(raw)
        }
        return csvEscape(safeJson(raw))
      })
      .join(',')
    lines.push(line)
  })

  return lines.join('\n')
}

const docsToPortableRows = <T extends { _id?: unknown }>(docs: T[]) =>
  docs.map((doc) => ({
    ...doc,
    _id: doc._id ? String(doc._id) : undefined,
  })) as Array<Record<string, unknown>>

export const getConsentSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        diagnosticsEnabled: false,
        analyticsEnabled: false,
        updatedAt: 0,
      }
    }

    const existing = await ctx.db
      .query('consentSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first()

    return {
      diagnosticsEnabled: existing?.diagnosticsEnabled ?? false,
      analyticsEnabled: existing?.analyticsEnabled ?? false,
      updatedAt: existing?.updatedAt ?? 0,
    }
  },
})

export const getPrivacyData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        consentSettings: {
          diagnosticsEnabled: false,
          analyticsEnabled: false,
          updatedAt: 0,
        },
        consentLogs: [],
        retentionPolicies: [],
        latestExport: null,
        latestDeletionJob: null,
      }
    }

    const [consentSettings, consentLogs, retentionPolicies, latestExport, latestDeletionJob] = await Promise.all([
      ctx.db
        .query('consentSettings')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .first(),
      ctx.db
        .query('consentLogs')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(25),
      ctx.db
        .query('retentionPolicies')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('userExports')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .first(),
      ctx.db
        .query('deletionJobs')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .first(),
    ])

    return {
      consentSettings: {
        diagnosticsEnabled: consentSettings?.diagnosticsEnabled ?? false,
        analyticsEnabled: consentSettings?.analyticsEnabled ?? false,
        updatedAt: consentSettings?.updatedAt ?? 0,
      },
      consentLogs,
      retentionPolicies,
      latestExport: latestExport ?? null,
      latestDeletionJob: latestDeletionJob ?? null,
    }
  },
})

export const setConsent = mutation({
  args: {
    consentType: consentTypeValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const existing = await ctx.db
      .query('consentSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first()

    const updatedAt = Date.now()
    const nextSettings = {
      diagnosticsEnabled:
        args.consentType === 'diagnostics' ? args.enabled : existing?.diagnosticsEnabled ?? false,
      analyticsEnabled: args.consentType === 'analytics' ? args.enabled : existing?.analyticsEnabled ?? false,
      updatedAt,
    }

    if (existing) {
      await ctx.db.patch(existing._id, nextSettings)
    } else {
      await ctx.db.insert('consentSettings', {
        userId: identity.subject,
        ...nextSettings,
      })
    }

    await ctx.db.insert('consentLogs', {
      userId: identity.subject,
      consentType: args.consentType,
      enabled: args.enabled,
      version: CONSENT_VERSION,
      createdAt: updatedAt,
    })

    return nextSettings
  },
})

export const upsertRetentionPolicy = mutation({
  args: {
    policyKey: retentionPolicyKeyValidator,
    retentionDays: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const policyKey = args.policyKey
    const retentionDays = Math.max(0, Math.floor(args.retentionDays))
    const updatedAt = Date.now()

    const existing = await ctx.db
      .query('retentionPolicies')
      .withIndex('by_userId_policyKey', (q) => q.eq('userId', identity.subject).eq('policyKey', policyKey))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        retentionDays,
        enabled: args.enabled,
        updatedAt,
      })
      return
    }

    await ctx.db.insert('retentionPolicies', {
      userId: identity.subject,
      policyKey,
      retentionDays,
      enabled: args.enabled,
      updatedAt,
    })
  },
})

export const generateUserExport = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const now = Date.now()
    const expiresAt = nowPlusDays(now, 7)

    const exportId = (await ctx.runMutation(internal.privacy._createExportJob, {
      formatVersion: EXPORT_FORMAT_VERSION,
      expiresAt,
    })) as Id<'userExports'>

    try {
      const payload = await ctx.runQuery(internal.privacy._collectExportData, {
        userId: identity.subject,
      })

      const meta = {
        formatVersion: EXPORT_FORMAT_VERSION,
        calcVersion: 'finance_calc_2026_02',
        generatedAt: new Date(now).toISOString(),
        range: 'all',
        tables: Object.keys(payload),
      }

      const files: Record<string, Uint8Array> = {
        'meta.json': strToU8(safeJson(meta)),
      }

      Object.entries(payload).forEach(([table, rows]) => {
        files[`json/${table}.json`] = strToU8(safeJson(rows))
        files[`csv/${table}.csv`] = strToU8(toCsv(rows as Array<Record<string, unknown>>))
      })

      const zipped = zipSync(files, { level: 6 })
      const arrayBuffer = (zipped.buffer as ArrayBuffer).slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
      const blob = new Blob([arrayBuffer], { type: 'application/zip' })
      const storageId = await ctx.storage.store(blob)

      await ctx.runMutation(internal.privacy._finalizeExportJob, {
        exportId,
        storageId,
        byteSize: zipped.byteLength,
      })

      return {
        exportId: String(exportId),
        status: 'ready' as const,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await ctx.runMutation(internal.privacy._failExportJob, { exportId, reason })
      return {
        exportId: String(exportId),
        status: 'failed' as const,
        reason,
      }
    }
  },
})

export const requestDeletion = action({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    const jobId = await ctx.runMutation(internal.privacy._startDeletionJob, {})

    const deleteTables: DeletionTable[] = [
      'incomePaymentChecks',
      'billPaymentChecks',
      'subscriptionPriceChanges',
      'incomeChangeEvents',
      'ledgerLines',
      'ledgerEntries',
      'financeAuditEvents',
      'monthCloseSnapshots',
      'monthlyCycleRuns',
      'cycleAuditLogs',
      'purchaseSplits',
      'purchases',
      'transactionRules',
      'envelopeBudgets',
      'incomeAllocationRules',
      'incomeAllocationSuggestions',
      'incomes',
      'bills',
      'cards',
      'loans',
      'accounts',
      'goals',
      'financePreferences',
      'consentLogs',
      'consentSettings',
      'retentionPolicies',
      'clientOpsMetrics',
    ]

    try {
      // Exports need storage cleanup first.
      let exportBatch: { exportIds: Array<Id<'userExports'>>; storageIds: Array<Id<'_storage'>> }
      do {
        exportBatch = (await ctx.runQuery(internal.privacy._getUserExportsBatch, { limit: 10 })) as {
          exportIds: Array<Id<'userExports'>>
          storageIds: Array<Id<'_storage'>>
        }

        for (const storageId of exportBatch.storageIds) {
          await ctx.storage.delete(storageId)
        }

        if (exportBatch.exportIds.length > 0) {
          await ctx.runMutation(internal.privacy._deleteUserExportsByIds, { ids: exportBatch.exportIds })
        }
      } while (exportBatch.exportIds.length > 0)

      for (const table of deleteTables) {
        // Delete in batches until empty.
        for (;;) {
          const result = (await ctx.runMutation(internal.privacy._deleteUserDocsBatch, {
            table,
            limit: 250,
          })) as { deleted: number }

          await ctx.runMutation(internal.privacy._updateDeletionJobProgress, {
            jobId: jobId as Id<'deletionJobs'>,
            progressJson: safeJson({
              table,
              lastDeleted: result.deleted,
              at: new Date().toISOString(),
            }),
          })

          if (result.deleted === 0) {
            break
          }
        }
      }

      await ctx.runMutation(internal.privacy._completeDeletionJob, { jobId: jobId as Id<'deletionJobs'> })
      return { ok: true as const }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await ctx.runMutation(internal.privacy._failDeletionJob, {
        jobId: jobId as Id<'deletionJobs'>,
        reason,
      })
      return { ok: false as const, reason }
    }
  },
})

export const _createExportJob = internalMutation({
  args: {
    formatVersion: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    return await ctx.db.insert('userExports', {
      userId: identity.subject,
      status: 'processing',
      storageId: undefined,
      byteSize: undefined,
      failureReason: undefined,
      formatVersion: args.formatVersion,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    })
  },
})

export const _finalizeExportJob = internalMutation({
  args: {
    exportId: v.id('userExports'),
    storageId: v.id('_storage'),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.exportId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Export job not found.')
    }
    await ctx.db.patch(args.exportId, {
      storageId: args.storageId,
      byteSize: args.byteSize,
      status: 'ready',
      failureReason: undefined,
    })
  },
})

export const _failExportJob = internalMutation({
  args: {
    exportId: v.id('userExports'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.exportId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Export job not found.')
    }
    await ctx.db.patch(args.exportId, {
      status: 'failed',
      failureReason: args.reason.slice(0, 280),
      storageId: undefined,
      byteSize: undefined,
    })
  },
})

export const _collectExportData = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = args.userId
    const [
      incomes,
      incomePaymentChecks,
      billPaymentChecks,
      subscriptionPriceChanges,
      incomeChangeEvents,
      bills,
      cards,
      loans,
      purchases,
      accounts,
      goals,
      transactionRules,
      envelopeBudgets,
      incomeAllocationRules,
      incomeAllocationSuggestions,
      purchaseSplits,
      cycleAuditLogs,
      monthlyCycleRuns,
      monthCloseSnapshots,
      financeAuditEvents,
      ledgerEntries,
      ledgerLines,
      consentSettings,
      consentLogs,
      retentionPolicies,
      clientOpsMetrics,
    ] = await Promise.all([
      ctx.db.query('incomes').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomePaymentChecks').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('billPaymentChecks').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('subscriptionPriceChanges').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomeChangeEvents').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('bills').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('cards').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('loans').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('purchases').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('accounts').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('goals').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('transactionRules').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('envelopeBudgets').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomeAllocationRules').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomeAllocationSuggestions').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('purchaseSplits').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('cycleAuditLogs').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('monthlyCycleRuns').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('monthCloseSnapshots').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('financeAuditEvents').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('ledgerEntries').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('ledgerLines').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('consentSettings').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('consentLogs').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('retentionPolicies').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('clientOpsMetrics').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
    ])

    return {
      incomes: docsToPortableRows(incomes),
      incomePaymentChecks: docsToPortableRows(incomePaymentChecks),
      billPaymentChecks: docsToPortableRows(billPaymentChecks),
      subscriptionPriceChanges: docsToPortableRows(subscriptionPriceChanges),
      incomeChangeEvents: docsToPortableRows(incomeChangeEvents),
      bills: docsToPortableRows(bills),
      cards: docsToPortableRows(cards),
      loans: docsToPortableRows(loans),
      purchases: docsToPortableRows(purchases),
      accounts: docsToPortableRows(accounts),
      goals: docsToPortableRows(goals),
      transactionRules: docsToPortableRows(transactionRules),
      envelopeBudgets: docsToPortableRows(envelopeBudgets),
      incomeAllocationRules: docsToPortableRows(incomeAllocationRules),
      incomeAllocationSuggestions: docsToPortableRows(incomeAllocationSuggestions),
      purchaseSplits: docsToPortableRows(purchaseSplits),
      cycleAuditLogs: docsToPortableRows(cycleAuditLogs),
      monthlyCycleRuns: docsToPortableRows(monthlyCycleRuns),
      monthCloseSnapshots: docsToPortableRows(monthCloseSnapshots),
      financeAuditEvents: docsToPortableRows(financeAuditEvents),
      ledgerEntries: docsToPortableRows(ledgerEntries),
      ledgerLines: docsToPortableRows(ledgerLines),
      consentSettings: docsToPortableRows(consentSettings),
      consentLogs: docsToPortableRows(consentLogs),
      retentionPolicies: docsToPortableRows(retentionPolicies),
      clientOpsMetrics: docsToPortableRows(clientOpsMetrics),
    }
  },
})

export const _startDeletionJob = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const now = Date.now()
    return await ctx.db.insert('deletionJobs', {
      userId: identity.subject,
      status: 'running',
      progressJson: safeJson({ startedAt: new Date(now).toISOString() }),
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const _updateDeletionJobProgress = internalMutation({
  args: {
    jobId: v.id('deletionJobs'),
    progressJson: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.jobId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Deletion job not found.')
    }
    await ctx.db.patch(args.jobId, {
      progressJson: args.progressJson,
      updatedAt: Date.now(),
    })
  },
})

export const _completeDeletionJob = internalMutation({
  args: { jobId: v.id('deletionJobs') },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.jobId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Deletion job not found.')
    }
    await ctx.db.patch(args.jobId, {
      status: 'completed',
      updatedAt: Date.now(),
      progressJson: safeJson({ completedAt: new Date().toISOString() }),
    })
  },
})

export const _failDeletionJob = internalMutation({
  args: { jobId: v.id('deletionJobs'), reason: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.jobId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Deletion job not found.')
    }
    await ctx.db.patch(args.jobId, {
      status: 'failed',
      updatedAt: Date.now(),
      progressJson: safeJson({ failedAt: new Date().toISOString(), reason: args.reason }),
    })
  },
})

export const _deleteUserDocsBatch = internalMutation({
  args: {
    table: deletionTableValidator,
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit)))
    const table = args.table

    const docs = await ctx.db
      .query(table)
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .take(limit)

    await Promise.all(docs.map((doc) => ctx.db.delete(doc._id)))
    return { deleted: docs.length }
  },
})

export const _getUserExportsBatch = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit)))
    const docs = await ctx.db
      .query('userExports')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .take(limit)

    const exportIds = docs.map((doc) => doc._id)
    const storageIds = docs.map((doc) => doc.storageId).filter((id): id is Id<'_storage'> => Boolean(id))

    return { exportIds, storageIds }
  },
})

export const _deleteUserExportsByIds = internalMutation({
  args: { ids: v.array(v.id('userExports')) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    for (const id of args.ids) {
      const doc = await ctx.db.get(id)
      if (!doc || doc.userId !== identity.subject) {
        continue
      }
      await ctx.db.delete(id)
    }
  },
})

export const _getUserExportById = internalQuery({
  args: { id: v.id('userExports') },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc || doc.userId !== identity.subject) {
      return null
    }
    return doc
  },
})
