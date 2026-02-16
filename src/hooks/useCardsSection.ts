import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CardEditDraft, CardEntry, CardForm, CardId } from '../components/financeTypes'
import { parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseCardsSectionArgs = {
  cards: CardEntry[]
} & MutationHandlers

const initialCardForm: CardForm = {
  name: '',
  creditLimit: '',
  usedLimit: '',
  statementBalance: '',
  pendingCharges: '',
  minimumPayment: '',
  spendPerMonth: '',
  interestRate: '',
  statementDay: '1',
  dueDay: '21',
}

const initialCardEditDraft: CardEditDraft = {
  name: '',
  creditLimit: '',
  usedLimit: '',
  statementBalance: '',
  pendingCharges: '',
  minimumPayment: '',
  spendPerMonth: '',
  interestRate: '',
  statementDay: '1',
  dueDay: '21',
}

export const useCardsSection = ({ cards, clearError, handleMutationError }: UseCardsSectionArgs) => {
  const addCard = useMutation(api.finance.addCard)
  const updateCard = useMutation(api.finance.updateCard)
  const removeCard = useMutation(api.finance.removeCard)

  const [cardForm, setCardForm] = useState<CardForm>(initialCardForm)
  const [cardEditId, setCardEditId] = useState<CardId | null>(null)
  const [cardEditDraft, setCardEditDraft] = useState<CardEditDraft>(initialCardEditDraft)

  const onAddCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addCard({
        name: cardForm.name,
        creditLimit: parseFloatInput(cardForm.creditLimit, 'Credit limit'),
        usedLimit: parseFloatInput(cardForm.usedLimit, 'Used limit'),
        statementBalance: cardForm.statementBalance
          ? parseFloatInput(cardForm.statementBalance, 'Statement balance')
          : undefined,
        pendingCharges: cardForm.pendingCharges
          ? parseFloatInput(cardForm.pendingCharges, 'Pending charges')
          : undefined,
        minimumPayment: parseFloatInput(cardForm.minimumPayment, 'Minimum payment'),
        spendPerMonth: parseFloatInput(cardForm.spendPerMonth, 'Spend per month'),
        interestRate: cardForm.interestRate ? parseFloatInput(cardForm.interestRate, 'Card APR') : undefined,
        statementDay: parseIntInput(cardForm.statementDay, 'Statement day'),
        dueDay: parseIntInput(cardForm.dueDay, 'Due day'),
      })

      setCardForm(initialCardForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteCard = async (id: CardId) => {
    clearError()
    try {
      if (cardEditId === id) {
        setCardEditId(null)
      }
      await removeCard({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startCardEdit = (entry: CardEntry) => {
    setCardEditId(entry._id)
    setCardEditDraft({
      name: entry.name,
      creditLimit: String(entry.creditLimit),
      usedLimit: String(entry.usedLimit),
      statementBalance: String(entry.statementBalance ?? entry.usedLimit),
      pendingCharges: String(entry.pendingCharges ?? Math.max(entry.usedLimit - (entry.statementBalance ?? entry.usedLimit), 0)),
      minimumPayment: String(entry.minimumPayment),
      spendPerMonth: String(entry.spendPerMonth),
      interestRate: entry.interestRate !== undefined ? String(entry.interestRate) : '',
      statementDay: String(entry.statementDay ?? 1),
      dueDay: String(entry.dueDay ?? 21),
    })
  }

  const saveCardEdit = async () => {
    if (!cardEditId) return

    clearError()
    try {
      await updateCard({
        id: cardEditId,
        name: cardEditDraft.name,
        creditLimit: parseFloatInput(cardEditDraft.creditLimit, 'Credit limit'),
        usedLimit: parseFloatInput(cardEditDraft.usedLimit, 'Used limit'),
        statementBalance: cardEditDraft.statementBalance
          ? parseFloatInput(cardEditDraft.statementBalance, 'Statement balance')
          : undefined,
        pendingCharges: cardEditDraft.pendingCharges
          ? parseFloatInput(cardEditDraft.pendingCharges, 'Pending charges')
          : undefined,
        minimumPayment: parseFloatInput(cardEditDraft.minimumPayment, 'Minimum payment'),
        spendPerMonth: parseFloatInput(cardEditDraft.spendPerMonth, 'Spend per month'),
        interestRate: cardEditDraft.interestRate ? parseFloatInput(cardEditDraft.interestRate, 'Card APR') : undefined,
        statementDay: parseIntInput(cardEditDraft.statementDay, 'Statement day'),
        dueDay: parseIntInput(cardEditDraft.dueDay, 'Due day'),
      })
      setCardEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    cardForm,
    setCardForm,
    cardEditId,
    setCardEditId,
    cardEditDraft,
    setCardEditDraft,
    onAddCard,
    onDeleteCard,
    startCardEdit,
    saveCardEdit,
    cards,
  }
}
