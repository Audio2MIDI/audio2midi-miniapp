import { type FormEvent, useEffect, useState } from 'react'

import {
  confirmAccountMerge,
  getAuthCapabilities,
  startEmailAuthentication,
  verifyEmailAuthentication,
} from '../api/account'
import { ApiError } from '../api/client'

interface EmailAuthFormProps {
  compact?: boolean
  onComplete: () => void
}

export default function EmailAuthForm({
  compact = false,
  onComplete,
}: EmailAuthFormProps) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [mergeToken, setMergeToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    void getAuthCapabilities()
      .then((capabilities) => {
        if (!cancelled) setAvailable(capabilities.email_otp)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function requestCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await startEmailAuthentication(email)
      setCodeSent(true)
      setMessage('Код отправлен. Проверьте входящие и папку «Спам».')
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Не удалось отправить код. Попробуйте ещё раз.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const result = await verifyEmailAuthentication(email, token)
      if ('merge_required' in result && result.merge_required) {
        setMergeToken(result.merge_token)
        setMessage('Этот email уже связан с аккаунтом. Подтвердите объединение истории.')
        return
      }
      onComplete()
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Код не подошёл или устарел.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function mergeAccounts() {
    if (!mergeToken) return
    setBusy(true)
    setMessage('')
    try {
      await confirmAccountMerge(mergeToken)
      onComplete()
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Не удалось объединить аккаунты.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (available === null) {
    return <div className="auth-inline-note">Проверяем доступные способы входа…</div>
  }
  if (!available) {
    return (
      <div className="auth-inline-note">
        Вход по email пока выключен. Telegram-вход продолжает работать.
      </div>
    )
  }

  if (mergeToken) {
    return (
      <div className={`email-auth-form${compact ? ' email-auth-form--compact' : ''}`}>
        <p className="auth-message">{message}</p>
        <button
          className="primary-action"
          disabled={busy}
          onClick={() => void mergeAccounts()}
          type="button"
        >
          {busy ? 'Объединяем…' : 'Объединить аккаунты'}
        </button>
        <small>
          Подписка, проекты, Telegram и email останутся в одном аккаунте.
        </small>
      </div>
    )
  }

  return (
    <form
      className={`email-auth-form${compact ? ' email-auth-form--compact' : ''}`}
      onSubmit={codeSent ? verifyCode : requestCode}
    >
      <label>
        <span>Email</span>
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          readOnly={codeSent}
          required
          type="email"
          value={email}
        />
      </label>
      {codeSent && (
        <label>
          <span>Код из письма</span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={8}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, ''))}
            pattern="\d{6,8}"
            placeholder="000000"
            required
            value={token}
          />
        </label>
      )}
      {message && <p className="auth-message">{message}</p>}
      <button className="primary-action" disabled={busy} type="submit">
        {busy
          ? 'Подождите…'
          : codeSent
            ? 'Подтвердить код'
            : 'Получить код'}
      </button>
      {codeSent && (
        <button
          className="secondary-text-action"
          disabled={busy}
          onClick={() => {
            setCodeSent(false)
            setToken('')
            setMessage('')
          }}
          type="button"
        >
          Изменить email
        </button>
      )}
    </form>
  )
}
