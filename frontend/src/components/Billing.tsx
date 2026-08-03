import { useEffect, useMemo, useState } from 'react'

import {
  createBillingCheckout,
  getBillingPlans,
  getCurrentAccount,
} from '../api/account'
import { ApiError } from '../api/client'
import type {
  AccountSummary,
  BillingPlan,
  SubscriptionPeriod,
} from '../api/types'
import EmailAuthForm from './EmailAuthForm'

interface BillingProps {
  colorScheme: 'light' | 'dark'
}

type BillingState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; account: AccountSummary; plans: BillingPlan[]; enabled: boolean; recurring: boolean }
  | { kind: 'error'; message: string }

function accessActive(account: AccountSummary): boolean {
  return Boolean(
    account.subscription_until
      && new Date(account.subscription_until).getTime() > Date.now(),
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

export default function Billing({ colorScheme }: BillingProps) {
  const [state, setState] = useState<BillingState>({ kind: 'loading' })
  const [selectedPeriod, setSelectedPeriod] = useState<SubscriptionPeriod>('month')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [checkoutKey, setCheckoutKey] = useState(() => `web-${crypto.randomUUID()}`)

  async function load() {
    setState({ kind: 'loading' })
    try {
      const [account, billing] = await Promise.all([
        getCurrentAccount(),
        getBillingPlans(),
      ])
      setState({
        kind: 'ready',
        account: account.account,
        plans: billing.plans,
        enabled: billing.enabled,
        recurring: billing.recurring_enabled,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ kind: 'signed-out' })
        return
      }
      setState({
        kind: 'error',
        message: error instanceof ApiError
          ? error.message
          : 'Не удалось загрузить тарифы.',
      })
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selectedPlan = useMemo(
    () => state.kind === 'ready'
      ? state.plans.find((plan) => plan.period === selectedPeriod) ?? state.plans[0]
      : undefined,
    [selectedPeriod, state],
  )

  async function checkout() {
    if (!selectedPlan || state.kind !== 'ready' || (state.recurring && !consent)) return
    setBusy(true)
    setMessage('')
    try {
      const result = await createBillingCheckout(
        selectedPlan.period,
        checkoutKey,
      )
      if (!result.payment_url) {
        if (result.intent.status === 'paid') {
          window.location.assign(`/payment/return?intent=${result.intent.id}`)
          return
        }
        throw new Error('Платёжная ссылка не получена')
      }
      window.location.assign(result.payment_url)
    } catch (error) {
      if (
        error instanceof ApiError
        && error.status === 409
        && error.message.includes('verified email')
      ) {
        setMessage('Для оплаты на сайте сначала привяжите подтверждённый email в профиле.')
      } else {
        setMessage(error instanceof ApiError
          ? error.message
          : 'Не удалось перейти к оплате. Попробуйте ещё раз.')
      }
      setBusy(false)
    }
  }

  if (state.kind === 'loading') {
    return (
      <main className="cabinet-shell billing-shell billing-shell--centered" data-theme={colorScheme}>
        <div className="cabinet-loading"><div className="loading-line" /></div>
      </main>
    )
  }

  if (state.kind === 'signed-out') {
    return (
      <main className="cabinet-shell billing-shell billing-shell--centered" data-theme={colorScheme}>
        <a className="cabinet-home-link" href="https://audio2midi.ru">Audio2MIDI</a>
        <section className="sign-in-card">
          <p className="eyebrow">Подписка</p>
          <h1>Сначала войдите по email</h1>
          <p>Telegram для оформления подписки не нужен.</p>
          <EmailAuthForm onComplete={() => void load()} />
        </section>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="cabinet-shell billing-shell billing-shell--centered" data-theme={colorScheme}>
        <section className="billing-result-card">
          <h1>Не удалось открыть оплату</h1>
          <p>{state.message}</p>
          <button className="primary-action" onClick={() => void load()}>Попробовать снова</button>
        </section>
      </main>
    )
  }

  return (
    <main className="cabinet-shell billing-shell" data-theme={colorScheme}>
      <div className="billing-container">
        <header className="billing-header">
          <a className="brand" href="/">Audio2MIDI</a>
          <a className="support-back-link" href="/profile">Профиль</a>
        </header>

        <section className="billing-hero">
          <p className="eyebrow">Подписка</p>
          <h1>Выберите период доступа</h1>
          <p>Один тариф открывает полные MIDI, PDF и аудиофайлы. Telegram не требуется.</p>
          {accessActive(state.account) && state.account.subscription_until && (
            <div className="billing-current-access">
              Доступ уже активен до {formatDate(state.account.subscription_until)}.
              Новая покупка продлит его.
            </div>
          )}
        </section>

        <section className="billing-plans" aria-label="Тарифы">
          {state.plans.map((plan) => (
            <button
              className={plan.period === selectedPeriod
                ? 'billing-plan billing-plan--selected'
                : 'billing-plan'}
              key={plan.period}
              onClick={() => {
                setSelectedPeriod(plan.period)
                setConsent(false)
                setMessage('')
                setCheckoutKey(`web-${crypto.randomUUID()}`)
              }}
              type="button"
            >
              <span>{plan.title}</span>
              <strong>{plan.price_rub.toLocaleString('ru-RU')} ₽</strong>
              <small>{plan.cadence}</small>
              {plan.period === 'month' && <em>Оптимальный</em>}
            </button>
          ))}
        </section>

        {selectedPlan && (
          <section className="billing-checkout-panel">
            <div className="billing-order-summary">
              <div>
                <span>К оплате сейчас</span>
                <strong>{selectedPlan.price_rub.toLocaleString('ru-RU')} ₽</strong>
              </div>
              <p>
                {state.recurring
                  ? `Далее — ${selectedPlan.price_rub.toLocaleString('ru-RU')} ₽ ${selectedPlan.cadence}, пока вы не отмените подписку.`
                  : `Разовая покупка доступа на ${selectedPlan.title.toLowerCase()}. Автоматических списаний нет.`}
              </p>
            </div>

            {state.recurring && <label className="billing-consent">
              <input
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                type="checkbox"
              />
              <span>
                Я согласен оформить подписку Audio2MIDI за{' '}
                <strong>{selectedPlan.price_rub.toLocaleString('ru-RU')} ₽</strong>{' '}
                с автоматическим списанием {selectedPlan.cadence} до отмены.
                Отменить автопродление можно в профиле; оплаченный период сохранится.{' '}
                <a href="/support">Условия, отмена и возвраты</a>.
              </span>
            </label>}

            <button
              className="primary-action billing-pay-button"
              disabled={(state.recurring && !consent) || busy || !state.enabled}
              onClick={() => void checkout()}
              type="button"
            >
              {busy ? 'Создаём платёж…' : `Перейти к оплате · ${selectedPlan.price_rub.toLocaleString('ru-RU')} ₽`}
            </button>
            {!state.enabled && (
              <p className="billing-message">Веб-оплата временно недоступна. Попробуйте чуть позже.</p>
            )}
            {message && <p className="billing-message billing-message--error">{message}</p>}
            <p className="billing-security">
              Данные карты вводятся на защищённой странице Т‑Банка и не попадают на сервер Audio2MIDI.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
