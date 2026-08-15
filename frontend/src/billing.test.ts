import { describe, expect, it } from 'vitest'

import type { BillingPlan, BillingProvider } from './api/types'
import { plansForProvider, priceForProvider } from './billing'

const plans: BillingPlan[] = [
  { period: 'day', title: 'День', days: 1, price_rub: 390, cadence: 'каждый день' },
  { period: 'month', title: 'Месяц', days: 30, price_rub: 990, cadence: 'каждый месяц' },
]

describe('Robokassa canary billing', () => {
  it('shows only the canary period and exact provider price', () => {
    const provider: BillingProvider = {
      id: 'robokassa',
      title: 'Тест Robokassa',
      recurring: false,
      canary: true,
      canary_period: 'day',
      canary_price_rub: 10,
    }

    expect(plansForProvider(plans, provider)).toEqual([plans[0]])
    expect(priceForProvider(plans[0], provider)).toBe(10)
  })

  it('keeps public plan prices unchanged', () => {
    const provider: BillingProvider = {
      id: 'robokassa',
      title: 'Иностранная карта',
      recurring: false,
    }

    expect(plansForProvider(plans, provider)).toEqual(plans)
    expect(priceForProvider(plans[1], provider)).toBe(990)
  })
})
