import { type FormEvent, useEffect, useMemo, useState } from 'react'

import {
  authenticateWithTelegram,
  confirmAccountMerge,
  disableAutoRenew,
  getCurrentAccount,
  getProfile,
  getSessions,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
} from '../api/account'
import { ApiError } from '../api/client'
import type { AccountProfile, AccountSummary, WebSession } from '../api/types'
import EmailAuthForm from './EmailAuthForm'

interface ProfileProps {
  initData: string | null
  colorScheme: 'light' | 'dark'
}

interface ProfileState {
  account: AccountSummary
  profile: AccountProfile
  sessions: WebSession[]
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function Profile({ initData, colorScheme }: ProfileProps) {
  const [state, setState] = useState<ProfileState | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [mergeToken, setMergeToken] = useState<string | null>(null)

  async function load() {
    const [account, profile, sessions] = await Promise.all([
      getCurrentAccount(),
      getProfile(),
      getSessions(),
    ])
    setState({
      account: account.account,
      profile: profile.profile,
      sessions: sessions.sessions,
    })
    setDisplayName(profile.profile.display_name ?? '')
  }

  useEffect(() => {
    void load().catch(() => {
      window.location.href = '/'
    })
  }, [])

  const providers = useMemo(
    () => new Set(state?.profile.identities.map((identity) => identity.provider) ?? []),
    [state],
  )

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const result = await updateProfile({
        display_name: displayName.trim() || null,
        locale: state?.profile.locale ?? 'ru',
      })
      if (state) setState({ ...state, profile: result.profile })
      setMessage('Профиль сохранён.')
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Не удалось сохранить профиль.')
    } finally {
      setBusy(false)
    }
  }

  async function linkTelegram() {
    if (!initData) return
    setBusy(true)
    setMessage('')
    try {
      const result = await authenticateWithTelegram(initData)
      if ('merge_required' in result && result.merge_required) {
        setMergeToken(result.merge_token)
        setMessage('Telegram уже содержит историю. Подтвердите объединение аккаунтов.')
      } else {
        await load()
        setMessage('Telegram привязан.')
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Не удалось привязать Telegram.')
    } finally {
      setBusy(false)
    }
  }

  async function mergeAccounts() {
    if (!mergeToken) return
    setBusy(true)
    try {
      await confirmAccountMerge(mergeToken)
      setMergeToken(null)
      await load()
      setMessage('Аккаунты объединены.')
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Не удалось объединить аккаунты.')
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <div className="cabinet-loading">
          <div className="brand-mark">♪</div>
          <div className="loading-line" />
        </div>
      </main>
    )
  }

  const emailIdentity = state.profile.identities.find(
    (identity) => identity.provider === 'supabase',
  )
  const subscriptionActive = Boolean(
    state.account.subscription_until
      && new Date(state.account.subscription_until).getTime() > Date.now(),
  )

  return (
    <main className="cabinet-shell" data-theme={colorScheme}>
      <div className="profile-page">
        <header className="profile-page__header">
          <a className="brand" href="/">
            <strong>Audio2MIDI</strong>
          </a>
          <a className="support-back-link" href="/">← К транскрипциям</a>
        </header>

        <div className="profile-page__intro">
          <p className="eyebrow">Аккаунт</p>
          <h1>Профиль и безопасность</h1>
          <p>Управляйте входом, подпиской и активными устройствами.</p>
        </div>

        {message && <div className="profile-notice">{message}</div>}

        <div className="profile-grid">
          <section className="profile-card">
            <span className="profile-card__number">01</span>
            <h2>Профиль</h2>
            <form className="profile-form" onSubmit={saveProfile}>
              <label>
                <span>Как к вам обращаться</span>
                <input
                  maxLength={80}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Имя или псевдоним"
                  value={displayName}
                />
              </label>
              <button className="profile-button" disabled={busy} type="submit">
                Сохранить
              </button>
            </form>
          </section>

          <section className="profile-card">
            <span className="profile-card__number">02</span>
            <h2>Способы входа</h2>
            <div className="identity-list">
              <div>
                <strong>Email</strong>
                <span>{emailIdentity?.metadata.email ?? 'Не привязан'}</span>
              </div>
              <div>
                <strong>Telegram</strong>
                <span>{providers.has('telegram') ? 'Привязан' : 'Не привязан'}</span>
              </div>
            </div>
            {!providers.has('supabase') && (
              <EmailAuthForm compact onComplete={() => void load()} />
            )}
            {!providers.has('telegram') && initData && (
              <button
                className="profile-button profile-button--secondary"
                disabled={busy}
                onClick={() => void linkTelegram()}
                type="button"
              >
                Привязать текущий Telegram
              </button>
            )}
            {!providers.has('telegram') && !initData && (
              <a
                className="profile-button profile-button--secondary"
                href="https://t.me/Audio2MIDIBot?startapp=cabinet"
              >
                Открыть через Telegram
              </a>
            )}
            {mergeToken && (
              <button
                className="profile-button"
                disabled={busy}
                onClick={() => void mergeAccounts()}
                type="button"
              >
                Объединить подтверждённые аккаунты
              </button>
            )}
          </section>

          <section className="profile-card">
            <span className="profile-card__number">03</span>
            <h2>Подписка</h2>
            <p className="profile-card__copy">
              {subscriptionActive && state.account.subscription_until
                ? `Доступ оплачен до ${formatDate(state.account.subscription_until)}.`
                : 'Активной подписки нет.'}
            </p>
            {!subscriptionActive && (
              <a className="profile-button" href="/billing">
                Оформить подписку на сайте
              </a>
            )}
            {subscriptionActive && state.account.auto_renew ? (
              <button
                className="profile-button profile-button--danger"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void disableAutoRenew()
                    .then(load)
                    .then(() => setMessage('Автопродление отключено. Оплаченный период сохранён.'))
                    .catch((error) => {
                      setMessage(error instanceof ApiError ? error.message : 'Не удалось отключить автопродление.')
                    })
                    .finally(() => setBusy(false))
                }}
                type="button"
              >
                Отключить автопродление
              </button>
            ) : subscriptionActive ? (
              <span className="profile-status">Автопродление выключено</span>
            ) : null}
            <a className="profile-card__link" href="/support">Возврат и поддержка →</a>
          </section>

          <section className="profile-card profile-card--wide">
            <div className="profile-card__heading">
              <div>
                <span className="profile-card__number">04</span>
                <h2>Устройства</h2>
              </div>
              {state.sessions.length > 1 && (
                <button
                  className="secondary-text-action"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    void revokeOtherSessions()
                      .then(load)
                      .finally(() => setBusy(false))
                  }}
                  type="button"
                >
                  Завершить остальные
                </button>
              )}
            </div>
            <div className="session-list">
              {state.sessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <div>
                    <strong>
                      {session.device_label ?? 'Браузер'}
                      {session.is_current && <em>Это устройство</em>}
                    </strong>
                    <span>
                      {session.auth_provider === 'supabase' ? 'Email' : 'Telegram'}
                      {' · '}
                      активность {formatDate(session.last_seen_at)}
                    </span>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setBusy(true)
                      void revokeSession(session.id)
                        .then(() => {
                          if (session.is_current) window.location.href = '/'
                          else return load()
                        })
                        .finally(() => setBusy(false))
                    }}
                    type="button"
                  >
                    Выйти
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
