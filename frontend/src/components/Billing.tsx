import { useEffect, useMemo, useState } from 'react'

import {
  createBillingCheckout,
  getBillingPlans,
  getCurrentAccount,
} from '../api/account'
import { plansForProvider, priceForProvider } from '../billing'
import { ApiError } from '../api/client'
import type {
  AccountSummary,
  BillingPlan,
  BillingProvider,
  PaymentProvider,
  SubscriptionPeriod,
} from '../api/types'
import EmailAuthForm from './EmailAuthForm'

interface BillingProps {
  colorScheme: 'light' | 'dark'
}

type BillingState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | {
    kind: 'ready'
    account: AccountSummary
    plans: BillingPlan[]
    providers: BillingProvider[]
    enabled: boolean
  }
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
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('tbank')
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
        providers: billing.providers?.length
          ? billing.providers
          : [{ id: 'tbank', title: 'Карта РФ / СБП', recurring: billing.recurring_enabled }],
        enabled: billing.enabled,
      })
      if (billing.providers?.length) {
        setSelectedProvider((current) => (
          billing.providers.some((provider) => provider.id === current)
            ? current
            : billing.providers[0].id
        ))
      }
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

  const provider = state.kind === 'ready'
    ? state.providers.find((item) => item.id === selectedProvider) ?? state.providers[0]
    : undefined
  const availablePlans = useMemo(
    () => state.kind === 'ready'
      ? plansForProvider(state.plans, provider)
      : [],
    [provider, state],
  )
  const selectedPlan = useMemo(
    () => availablePlans.find((plan) => plan.period === selectedPeriod) ?? availablePlans[0],
    [availablePlans, selectedPeriod],
  )
  const recurring = Boolean(provider?.recurring)
  const priceRub = priceForProvider(selectedPlan, provider)

  useEffect(() => {
    if (provider?.canary && provider.canary_period) {
      setSelectedPeriod(provider.canary_period)
    }
  }, [provider])

  async function checkout() {
    if (!selectedPlan || !provider || state.kind !== 'ready' || (recurring && !consent)) return
    setBusy(true)
    setMessage('')
    try {
      const result = await createBillingCheckout(
        selectedPlan.period,
        checkoutKey,
        provider.id,
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
          {availablePlans.map((plan) => (
            <button
              aria-pressed={plan.period === selectedPeriod}
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
              <strong>{(provider?.canary && provider.canary_price_rub
                ? provider.canary_price_rub
                : plan.price_rub).toLocaleString('ru-RU')} ₽</strong>
              <small>{plan.cadence}</small>
              {plan.period === 'month' && <em>Оптимальный</em>}
            </button>
          ))}
        </section>

        {selectedPlan && priceRub !== undefined && (
          <section className="billing-checkout-panel">
            <div className="billing-order-summary">
              <div>
                <span>К оплате сейчас</span>
                <strong>{priceRub.toLocaleString('ru-RU')} ₽</strong>
              </div>
              <p>
                {recurring
                  ? `Далее — ${selectedPlan.price_rub.toLocaleString('ru-RU')} ₽ ${selectedPlan.cadence}, пока вы не отмените подписку.`
                  : provider?.canary
                    ? 'Закрытый тестовый платёж владельца. Автоматических списаний нет.'
                    : `Разовая покупка доступа на ${selectedPlan.title.toLowerCase()}. Автоматических списаний нет.`}
              </p>
            </div>

            {state.providers.length > 1 && (
              <fieldset className="billing-provider-picker">
                <legend>Способ оплаты</legend>
                <div className="billing-provider-options">
                  {state.providers.map((item) => (
                    <label
                      className={item.id === selectedProvider
                        ? 'billing-provider billing-provider--selected'
                        : 'billing-provider'}
                      key={item.id}
                    >
                      <input
                        checked={item.id === selectedProvider}
                        name="payment-provider"
                        onChange={() => {
                          setSelectedProvider(item.id)
                          if (item.canary && item.canary_period) {
                            setSelectedPeriod(item.canary_period)
                          }
                          setConsent(false)
                          setMessage('')
                          setCheckoutKey(`web-${crypto.randomUUID()}`)
                        }}
                        type="radio"
                        value={item.id}
                      />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.canary
                            ? `Закрытая проверка платежа на ${item.canary_price_rub ?? 10} ₽`
                            : item.id === 'robokassa'
                            ? 'Карты зарубежных банков из поддерживаемых Robokassa стран'
                            : 'Российская карта или СБП'}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {recurring && <label className="billing-consent">
              <input
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                type="checkbox"
              />
              <span>
                Я согласен оформить подписку Audio2MIDI за{' '}
                <strong>{priceRub.toLocaleString('ru-RU')} ₽</strong>{' '}
                с автоматическим списанием {selectedPlan.cadence} до отмены.
                Отменить автопродление можно в профиле; оплаченный период сохранится.{' '}
                <a href="/support">Условия, отмена и возвраты</a>.
              </span>
            </label>}

            <button
              className="primary-action billing-pay-button"
              disabled={(recurring && !consent) || busy || !state.enabled}
              onClick={() => void checkout()}
              type="button"
            >
              {busy ? 'Создаём платёж…' : `Перейти к оплате · ${priceRub.toLocaleString('ru-RU')} ₽`}
            </button>
            {!state.enabled && (
              <p className="billing-message">Веб-оплата временно недоступна. Попробуйте чуть позже.</p>
            )}
            {message && <p className="billing-message billing-message--error">{message}</p>}
            <p className="billing-security">
              Данные карты вводятся на защищённой странице{' '}
              {provider?.id === 'robokassa' ? 'Robokassa' : 'Т‑Банка'} и не попадают на сервер Audio2MIDI.
            </p>
            <p className="billing-security">
              Оплачивая доступ, вы принимаете{' '}
              <a href="https://audio2midi.ru/offer">публичную оферту</a>,{' '}
              <a href="https://audio2midi.ru/privacy">политику конфиденциальности</a>{' '}
              и <a href="https://audio2midi.ru/refunds">условия возврата</a>.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
