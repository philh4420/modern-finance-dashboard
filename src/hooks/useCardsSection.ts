import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CardEditDraft, CardEntry, CardForm, CardId } from '../components/financeTypes'
import { parseFloatInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseCardsSectionArgs = {
  cards: CardEntry[]
} & MutationHandlers

const initialCardForm: CardForm = {
  name: '',
  creditLimit: '',
  usedLimit: '',
  minimumPayment: '',
  spendPerMonth: '',
}

const initialCardEditDraft: CardEditDraft = {
  name: '',
  creditLimit: '',
  usedLimit: '',
  minimumPayment: '',
  spendPerMonth: '',
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
        minimumPayment: parseFloatInput(cardForm.minimumPayment, 'Minimum payment'),
        spendPerMonth: parseFloatInput(cardForm.spendPerMonth, 'Spend per month'),
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
      minimumPayment: String(entry.minimumPayment),
      spendPerMonth: String(entry.spendPerMonth),
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
        minimumPayment: parseFloatInput(cardEditDraft.minimumPayment, 'Minimum payment'),
        spendPerMonth: parseFloatInput(cardEditDraft.spendPerMonth, 'Spend per month'),
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
