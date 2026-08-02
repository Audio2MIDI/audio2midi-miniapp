import { useEffect, useState } from 'react'

import { getBillingPayment } from '../api/account'
import { ApiError } from '../api/client'
import type { WebPaymentIntent } from '../api/types'

interface PaymentReturnProps {
  colorScheme: 'light' | 'dark'
  intentId: string | null
}

type ReturnState =
  | { kind: 'checking' }
  | { kind: 'paid'; payment: WebPaymentIntent }
  | { kind: 'not-paid'; message: string }
  | { kind: 'error'; message: string }

export default function PaymentReturn({ colorScheme, intentId }: PaymentReturnProps) {
  const [state, setState] = useState<ReturnState>(() => intentId
    ? { kind: 'checking' }
    : { kind: 'error', message: 'Не найден идентификатор платежа.' })

  useEffect(() => {
    if (!intentId) return
    let cancelled = false
    let attempt = 0

    async function poll() {
      attempt += 1
      try {
        const response = await getBillingPayment(intentId as string)
        if (cancelled) return
        const payment = response.payment
        if (payment.status === 'paid') {
          setState({ kind: 'paid', payment })
          return
        }
        if (payment.status === 'failed' || payment.status === 'cancelled') {
          setState({
            kind: 'not-paid',
            message: payment.sanitized_error || 'Платёж не завершён.',
          })
          return
        }
        if (
          payment.provider_status
          && ['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED'].includes(payment.provider_status)
        ) {
          setState({
            kind: 'not-paid',
            message: 'Банк не подтвердил платёж. Деньги не списаны — можно выбрать тариф и попробовать ещё раз.',
          })
          return
        }
        if (attempt < 20) {
          window.setTimeout(() => void poll(), 2000)
          return
        }
        setState({
          kind: 'not-paid',
          message: 'Подтверждение пока не пришло. Если деньги списались, обновите страницу через минуту — доступ включится автоматически.',
        })
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          setState({ kind: 'error', message: 'Сессия истекла. Войдите снова, чтобы проверить оплату.' })
        } else {
          setState({ kind: 'error', message: 'Не удалось проверить платёж.' })
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [intentId])

  return (
    <main className="cabinet-shell billing-shell billing-shell--centered" data-theme={colorScheme}>
      <a className="cabinet-home-link" href="https://audio2midi.ru">Audio2MIDI</a>
      <section className="billing-result-card">
        {state.kind === 'checking' && (
          <>
            <div className="billing-result-icon billing-result-icon--checking">···</div>
            <p className="eyebrow">Проверяем оплату</p>
            <h1>Несколько секунд</h1>
            <p>Не закрывайте страницу — банк подтверждает платёж.</p>
          </>
        )}
        {state.kind === 'paid' && (
          <>
            <div className="billing-result-icon">✓</div>
            <p className="eyebrow">Готово</p>
            <h1>Подписка активна</h1>
            <p>Можно сразу загрузить композицию. Telegram не нужен.</p>
            <a className="primary-action" href="/new">Загрузить песню →</a>
            <a className="billing-result-link" href="/">Вернуться в кабинет</a>
          </>
        )}
        {state.kind === 'not-paid' && (
          <>
            <div className="billing-result-icon billing-result-icon--warning">!</div>
            <p className="eyebrow">Оплата не подтверждена</p>
            <h1>Доступ пока не изменился</h1>
            <p>{state.message}</p>
            <button className="primary-action" onClick={() => window.location.reload()}>Проверить ещё раз</button>
            <a className="billing-result-link" href="/billing">Вернуться к тарифам</a>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <div className="billing-result-icon billing-result-icon--warning">!</div>
            <h1>Не удалось проверить оплату</h1>
            <p>{state.message}</p>
            <a className="primary-action" href="/">Открыть кабинет</a>
            <a className="billing-result-link" href="/support">Связаться с поддержкой</a>
          </>
        )}
      </section>
    </main>
  )
}
