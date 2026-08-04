import { useEffect, useMemo, useState } from 'react'

import {
  authenticateWithTelegram,
  getCurrentAccount,
  getEditorCapabilities,
  getLibrary,
  getNotifications,
  logout,
  markNotificationRead,
  materializeEditorProject,
} from '../api/account'
import { ApiError } from '../api/client'
import type { AccountNotification, AccountSummary, LibraryItem } from '../api/types'
import { telegramLoginUrl } from '../routing'
import EmailAuthForm from './EmailAuthForm'
import { PageHeading, ProductHeader, ProductLoading, StatusBadge } from './ProductFrame'

interface DashboardProps {
  initData: string | null
  colorScheme: 'light' | 'dark'
  returnPath: string | null
}

type DashboardState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | {
      kind: 'ready'
      account: AccountSummary
      items: LibraryItem[]
      editorEnabled: boolean
      notifications: AccountNotification[]
    }
  | { kind: 'error'; message: string }

const METHOD_NAMES: Record<string, string> = {
  picogen: 'Пиано-кавер',
  sheetsage: 'Мелодия и аккорды',
  piano_transcription: 'Ноты из записи фортепиано',
  music2midi: 'Быстрый MIDI',
  audio_separator: 'Разделение аудио',
  whisper: 'Текст песни',
  video_render: 'Видео',
}

const STATUS_NAMES: Record<string, string> = {
  queued: 'В очереди',
  leased: 'Назначено серверу',
  running: 'Обрабатывается',
  processing: 'Обрабатывается',
  succeeded: 'Готово',
  ready: 'Готово',
  failed: 'Не удалось',
  cancelled: 'Отменено',
}

const ARTIFACT_NAMES: Record<string, string> = {
  midi: 'Скачать MIDI',
  pdf: 'Скачать PDF',
  mp3: 'Скачать MP3',
  wav: 'Скачать WAV',
  full_audio: 'Скачать аудио',
  preview_mp3: 'Скачать демо',
  vocals: 'Скачать вокал',
  accompaniment: 'Скачать инструментал',
  transcript: 'Скачать текст',
  video: 'Скачать видео',
  archive: 'Скачать архив',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
}

function subscriptionLabel(account: AccountSummary): string {
  if (!account.subscription_until) return 'Нет активной подписки'
  const until = new Date(account.subscription_until)
  if (Number.isNaN(until.getTime()) || until <= new Date()) return 'Подписка закончилась'
  return `Подписка до ${new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(until)}`
}

function visualizerUrl(downloadUrl: string): string {
  const absoluteDownload = new URL(downloadUrl, window.location.origin).toString()
  return `/visualizer?file=${encodeURIComponent(absoluteDownload)}`
}

function ResultRow({ item, editorEnabled }: { item: LibraryItem; editorEnabled: boolean }) {
  const midi = item.artifacts.find((entry) => entry.role === 'midi')
  const active = ['queued', 'leased', 'running', 'processing'].includes(item.status)
  const primaryUrl = item.project_id
    ? `/tracks/${item.project_id}`
    : midi
      ? visualizerUrl(midi.download_url)
      : undefined
  const [openingEditor, setOpeningEditor] = useState(false)
  const [editorError, setEditorError] = useState('')

  async function openEditor() {
    if (!midi || openingEditor) return
    setOpeningEditor(true)
    setEditorError('')
    try {
      if (item.project_id) {
        window.location.assign(`/editor/${item.project_id}`)
        return
      }
      const materialized = await materializeEditorProject(item.id)
      window.location.assign(materialized.editor_url)
    } catch (error) {
      setEditorError(
        error instanceof ApiError && error.status === 403
          ? 'Редактор пока доступен только участникам beta.'
          : 'Не удалось открыть редактор. Попробуйте ещё раз.',
      )
      setOpeningEditor(false)
    }
  }

  return (
    <article className="result-card">
      <div className="result-card__icon" aria-hidden="true">
        {item.engine === 'audio_separator' ? '◐' : item.engine === 'video_render' ? '▶' : '♪'}
      </div>
      <div className="result-card__identity">
        <h3>{item.title}</h3>
        <p>
          <span>{METHOD_NAMES[item.engine] ?? 'Музыкальная обработка'}</span>
          <span>·</span>
          <span>{formatDate(item.created_at)}</span>
          {active && <span>· страницу можно закрыть</span>}
        </p>
      </div>
      <StatusBadge status={item.status}>{STATUS_NAMES[item.status] ?? item.status}</StatusBadge>
      {primaryUrl ? (
        <a className="result-card__open" href={primaryUrl}>Открыть</a>
      ) : <span />}
      <details className="result-menu">
        <summary aria-label={`Действия: ${item.title}`}>•••</summary>
        <div className="result-menu__content">
          {primaryUrl && <a href={primaryUrl}>Открыть композицию</a>}
          {midi && <a href={visualizerUrl(midi.download_url)}>Открыть визуализацию</a>}
          {midi && editorEnabled && (
            <button disabled={openingEditor} onClick={() => void openEditor()} type="button">
              {openingEditor ? 'Открываем…' : 'Редактировать MIDI'}
            </button>
          )}
          {item.artifacts.map((entry) => (
            <a href={entry.download_url} key={entry.id} rel="noreferrer">
              {ARTIFACT_NAMES[entry.role] ?? `Скачать ${entry.role}`}
            </a>
          ))}
        </div>
      </details>
      {item.sanitized_error && (
        <p className="result-error">Обработка не завершилась. Проект сохранён и его можно повторить позже.</p>
      )}
      {item.delivery_state === 'locked' && (
        <p className="result-error">Полная версия готова. <a href="/billing">Открыть файлы</a></p>
      )}
      {editorError && <p className="result-error">{editorError}</p>}
    </article>
  )
}

export default function Dashboard({ initData, colorScheme, returnPath }: DashboardProps) {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let accountResponse
        try {
          accountResponse = await getCurrentAccount()
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401 || !initData) throw error
          const authentication = await authenticateWithTelegram(initData)
          if ('merge_required' in authentication && authentication.merge_required) {
            throw new ApiError('Требуется объединить аккаунты в профиле.', 409)
          }
          accountResponse = authentication
        }
        if (returnPath) {
          window.location.replace(returnPath)
          return
        }
        const [library, editor, notifications] = await Promise.all([
          getLibrary(),
          getEditorCapabilities().catch(() => ({ enabled: false })),
          getNotifications().catch(() => ({ items: [] })),
        ])
        if (!cancelled) {
          setState({
            kind: 'ready',
            account: accountResponse.account,
            items: library.items,
            editorEnabled: editor.enabled,
            notifications: notifications.items,
          })
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          setState({ kind: 'signed-out' })
        } else {
          setState({ kind: 'error', message: 'Не удалось загрузить кабинет. Попробуйте ещё раз.' })
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [initData, returnPath])

  const activeItems = useMemo(() => state.kind === 'ready'
    ? state.items.filter((item) => ['queued', 'leased', 'running', 'processing'].includes(item.status))
    : [], [state])
  const historyItems = useMemo(() => state.kind === 'ready'
    ? state.items.filter((item) => !['queued', 'leased', 'running', 'processing'].includes(item.status))
    : [], [state])

  if (state.kind === 'loading') return <ProductLoading label="Открываем кабинет…" />

  if (state.kind === 'signed-out') {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <a className="cabinet-home-link" href="https://audio2midi.ru">Audio2MIDI</a>
        <section className="sign-in-card">
          <p className="eyebrow">Личный кабинет</p>
          <h1>Ваша музыка всегда рядом</h1>
          <p>Войдите по email, чтобы открыть историю, подписку и результаты с любого устройства.</p>
          <EmailAuthForm onComplete={() => window.location.assign(returnPath ?? '/')} />
          <div className="auth-divider"><span>или</span></div>
          <a className="secondary-action" href={telegramLoginUrl(returnPath)}>Войти через Telegram</a>
        </section>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <a className="cabinet-home-link" href="https://audio2midi.ru">Audio2MIDI</a>
        <section className="sign-in-card">
          <p className="eyebrow">Ошибка</p>
          <h1>Кабинет не открылся</h1>
          <p>{state.message}</p>
          <button className="primary-action" onClick={() => window.location.reload()} type="button">Попробовать снова</button>
        </section>
      </main>
    )
  }

  const { account, editorEnabled, notifications } = state
  const displayName = account.username ? `@${account.username}` : 'Профиль'

  return (
    <main className="cabinet-shell" data-theme={colorScheme}>
      <div className="cabinet-container">
        <ProductHeader actions={(
          <>
            <a className="notification-chip" href="#notifications" aria-label="Уведомления">
              <svg aria-hidden="true" className="notification-chip__icon" viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              {account.unread_notification_count > 0 && <em>{account.unread_notification_count}</em>}
            </a>
            <a className="profile-chip" href="/profile">
              <div className="profile-avatar">{displayName.replace('@', '').slice(0, 1).toUpperCase()}</div>
              <div><strong>{displayName}</strong><span>Аккаунт</span></div>
            </a>
          </>
        )} />

        <PageHeading
          title="Мои композиции"
          description="Результаты из сайта и Telegram собраны в одной библиотеке."
          action={<a className="primary-action" href="/new">Новая композиция</a>}
        />

        <div className="account-strip">
          <span>{subscriptionLabel(account)}</span>
          <span className="account-strip__separator" aria-hidden="true" />
          <span>{account.result_count} {account.result_count === 1 ? 'результат' : 'результатов'}</span>
          <span className="account-strip__separator" aria-hidden="true" />
          <span>{account.active_job_count ? `${account.active_job_count} в обработке` : 'Очередь свободна'}</span>
          <a href="/billing">Тарифы</a>
        </div>

        {activeItems.length > 0 && (
          <section className="cabinet-section" aria-live="polite">
            <div className="section-heading"><h2>Сейчас обрабатывается</h2><span>Страницу можно закрыть</span></div>
            <div className="result-list">
              {activeItems.map((item) => <ResultRow editorEnabled={editorEnabled} item={item} key={item.id} />)}
            </div>
          </section>
        )}

        <section className="cabinet-section">
          <div className="section-heading"><h2>Библиотека</h2><span>{historyItems.length} из {account.result_count}</span></div>
          {historyItems.length ? (
            <div className="result-list">
              {historyItems.map((item) => <ResultRow editorEnabled={editorEnabled} item={item} key={item.id} />)}
            </div>
          ) : (
            <div className="empty-library">
              <h3>Здесь появятся ваши композиции</h3>
              <p>Загрузите первый трек — мы сохраним результат и все доступные файлы в библиотеке.</p>
              <a className="primary-action" href="/new">Загрузить первую композицию</a>
            </div>
          )}
        </section>

        {notifications.length > 0 && (
          <section className="cabinet-section" id="notifications">
            <div className="section-heading"><h2>Уведомления</h2></div>
            <div className="notification-list">
              {notifications.slice(0, 5).map((notification) => (
                <a
                  className={notification.read_at ? 'notification-item' : 'notification-item notification-item--unread'}
                  href={notification.action_url || '/'}
                  key={notification.id}
                  onClick={() => { if (!notification.read_at) void markNotificationRead(notification.id) }}
                >
                  <span aria-hidden="true">{notification.kind === 'result_ready' ? '✓' : notification.kind === 'result_failed' ? '!' : '•'}</span>
                  <div><strong>{notification.title}</strong><p>{notification.body}</p></div>
                  <time>{formatDate(notification.created_at)}</time>
                </a>
              ))}
            </div>
          </section>
        )}

        <footer className="cabinet-footer">
          <span>Audio2MIDI · 2026</span>
          <div className="cabinet-footer__actions">
            <a href="/support">Поддержка и отмена подписки</a>
            <button onClick={async () => { await logout(); window.location.reload() }} type="button">Выйти</button>
          </div>
        </footer>
      </div>
    </main>
  )
}
