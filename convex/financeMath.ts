export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
export type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'

export type CardCycleInput = {
  usedLimit?: number | null
  spendPerMonth?: number | null
  minimumPayment?: number | null
  interestRate?: number | null
}

export type LoanCycleInput = {
  balance?: number | null
  minimumPayment?: number | null
  interestRate?: number | null
  cadence: Cadence
  customInterval?: number
  customUnit?: CustomCadenceUnit
}

export const roundCurrency = (value: number) => Math.round(value * 100) / 100

export const finiteOrZero = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, daysInMonth))
}

export const addCalendarMonthsKeepingDay = (date: Date, months: number) =>
  dateWithClampedDay(date.getFullYear(), date.getMonth() + months, date.getDate())

export const countCompletedMonthlyCycles = (fromTimestamp: number, now: Date) => {
  const today = startOfDay(now)
  let marker = startOfDay(new Date(fromTimestamp))
  let cycles = 0

  for (let i = 0; i < 600; i += 1) {
    const next = addCalendarMonthsKeepingDay(marker, 1)
    if (next > today) {
      break
    }
    marker = next
    cycles += 1
  }

  return cycles
}

export const toCycleKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const toMonthlyAmount = (
  amount: number,
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  switch (cadence) {
    case 'weekly':
      return (amount * 52) / 12
    case 'biweekly':
      return (amount * 26) / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }

      switch (customUnit) {
        case 'days':
          return (amount * 365.2425) / (customInterval * 12)
        case 'weeks':
          return (amount * 365.2425) / (customInterval * 7 * 12)
        case 'months':
          return amount / customInterval
        case 'years':
          return amount / (customInterval * 12)
        default:
          return 0
      }
    case 'one_time':
      return 0
    default:
      return amount
  }
}

export const applyCardMonthlyLifecycle = (card: CardCycleInput, cycles: number) => {
  let balance = finiteOrZero(card.usedLimit)
  const spendPerMonth = finiteOrZero(card.spendPerMonth)
  const minimumPayment = finiteOrZero(card.minimumPayment)
  const apr = finiteOrZero(card.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  let interestAccrued = 0
  let paymentsApplied = 0
  let spendAdded = 0

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    balance += spendPerMonth
    spendAdded += spendPerMonth
    const interest = balance * monthlyRate
    balance += interest
    interestAccrued += interest
    const payment = Math.min(balance, minimumPayment)
    balance -= payment
    paymentsApplied += payment
  }

  return {
    balance: roundCurrency(Math.max(balance, 0)),
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
    spendAdded: roundCurrency(spendAdded),
  }
}

export const applyLoanMonthlyLifecycle = (loan: LoanCycleInput, cycles: number) => {
  let balance = finiteOrZero(loan.balance)
  const monthlyPayment = toMonthlyAmount(
    finiteOrZero(loan.minimumPayment),
    loan.cadence,
    loan.customInterval,
    loan.customUnit,
  )
  const apr = finiteOrZero(loan.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  let interestAccrued = 0
  let paymentsApplied = 0

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const interest = balance * monthlyRate
    balance += interest
    interestAccrued += interest
    const payment = Math.min(balance, monthlyPayment)
    balance -= payment
    paymentsApplied += payment
  }

  return {
    balance: roundCurrency(Math.max(balance, 0)),
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
  }
}
