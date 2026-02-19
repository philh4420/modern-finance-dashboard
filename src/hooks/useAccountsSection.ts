import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { AccountEditDraft, AccountEntry, AccountForm, AccountId } from '../components/financeTypes'
import { parseFloatInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseAccountsSectionArgs = {
  accounts: AccountEntry[]
} & MutationHandlers

const initialAccountForm: AccountForm = {
  name: '',
  type: 'checking',
  purpose: 'spending',
  ledgerBalance: '',
  pendingBalance: '0',
  balance: '',
  liquid: true,
}

const initialAccountEditDraft: AccountEditDraft = {
  name: '',
  type: 'checking',
  purpose: 'spending',
  ledgerBalance: '',
  pendingBalance: '0',
  balance: '',
  liquid: true,
}

export const useAccountsSection = ({ accounts, clearError, handleMutationError }: UseAccountsSectionArgs) => {
  const addAccount = useMutation(api.finance.addAccount)
  const updateAccount = useMutation(api.finance.updateAccount)
  const removeAccount = useMutation(api.finance.removeAccount)

  const [accountForm, setAccountForm] = useState<AccountForm>(initialAccountForm)
  const [accountEditId, setAccountEditId] = useState<AccountId | null>(null)
  const [accountEditDraft, setAccountEditDraft] = useState<AccountEditDraft>(initialAccountEditDraft)

  const onAddAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const ledgerBalance = parseFloatInput(accountForm.ledgerBalance, 'Account ledger balance')
      const pendingBalance = parseFloatInput(accountForm.pendingBalance || '0', 'Account pending balance')
      const balance = ledgerBalance + pendingBalance

      await addAccount({
        name: accountForm.name,
        type: accountForm.type,
        purpose: accountForm.purpose,
        ledgerBalance,
        pendingBalance,
        balance,
        liquid: accountForm.liquid,
      })

      setAccountForm(initialAccountForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteAccount = async (id: AccountId) => {
    clearError()
    try {
      if (accountEditId === id) {
        setAccountEditId(null)
      }
      await removeAccount({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startAccountEdit = (entry: AccountEntry) => {
    setAccountEditId(entry._id)
    setAccountEditDraft({
      name: entry.name,
      type: entry.type,
      purpose: entry.purpose ?? (entry.type === 'debt' ? 'debt' : 'spending'),
      ledgerBalance: String(entry.ledgerBalance ?? entry.balance),
      pendingBalance: String(entry.pendingBalance ?? 0),
      balance: String(entry.balance),
      liquid: entry.liquid,
    })
  }

  const saveAccountEdit = async () => {
    if (!accountEditId) return

    clearError()
    try {
      const ledgerBalance = parseFloatInput(accountEditDraft.ledgerBalance, 'Account ledger balance')
      const pendingBalance = parseFloatInput(accountEditDraft.pendingBalance || '0', 'Account pending balance')
      const balance = ledgerBalance + pendingBalance

      await updateAccount({
        id: accountEditId,
        name: accountEditDraft.name,
        type: accountEditDraft.type,
        purpose: accountEditDraft.purpose,
        ledgerBalance,
        pendingBalance,
        balance,
        liquid: accountEditDraft.liquid,
      })
      setAccountEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    accountForm,
    setAccountForm,
    accountEditId,
    setAccountEditId,
    accountEditDraft,
    setAccountEditDraft,
    onAddAccount,
    onDeleteAccount,
    startAccountEdit,
    saveAccountEdit,
    accounts,
  }
}
