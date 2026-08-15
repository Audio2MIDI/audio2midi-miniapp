import type { BillingPlan, BillingProvider } from './api/types'

export function plansForProvider(
  plans: BillingPlan[],
  provider: BillingProvider | undefined,
): BillingPlan[] {
  if (!provider?.canary || !provider.canary_period) return plans
  return plans.filter((plan) => plan.period === provider.canary_period)
}

export function priceForProvider(
  plan: BillingPlan | undefined,
  provider: BillingProvider | undefined,
): number | undefined {
  if (provider?.canary && provider.canary_price_rub) {
    return provider.canary_price_rub
  }
  return plan?.price_rub
}
