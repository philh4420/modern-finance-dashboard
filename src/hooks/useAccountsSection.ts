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
  balance: '',
  liquid: true,
}

const initialAccountEditDraft: AccountEditDraft = {
  name: '',
  type: 'checking',
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
      await addAccount({
        name: accountForm.name,
        type: accountForm.type,
        balance: parseFloatInput(accountForm.balance, 'Account balance'),
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
      balance: String(entry.balance),
      liquid: entry.liquid,
    })
  }

  const saveAccountEdit = async () => {
    if (!accountEditId) return

    clearError()
    try {
      await updateAccount({
        id: accountEditId,
        name: accountEditDraft.name,
        type: accountEditDraft.type,
        balance: parseFloatInput(accountEditDraft.balance, 'Account balance'),
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
