import { useEffect, useMemo, useState } from 'react'

import {
  authenticateWithTelegram,
  getEditorCapabilities,
  getCurrentAccount,
  getLibrary,
  logout,
  materializeEditorProject,
} from '../api/account'
import { ApiError } from '../api/client'
import type { AccountSummary, LibraryItem } from '../api/types'
import EmailAuthForm from './EmailAuthForm'
import { telegramLoginUrl } from '../routing'

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
    }
  | { kind: 'error'; message: string }

const METHOD_NAMES: Record<string, string> = {
  picogen: 'Пиано-кавер',
  sheetsage: 'Аккорды и мелодия',
  piano_transcription: 'Транскрипция фортепиано',
  music2midi: 'Music2MIDI',
  audio_separator: 'Разделение аудио',
  whisper: 'Текст песни',
  video_render: 'Видео',
}

const STATUS_NAMES: Record<string, string> = {
  queued: 'В очереди',
  leased: 'Назначено серверу',
  running: 'Обрабатывается',
  succeeded: 'Готово',
  failed: 'Не удалось',
  cancelled: 'Отменено',
}

const ARTIFACT_NAMES: Record<string, string> = {
  midi: 'MIDI',
  pdf: 'PDF',
  mp3: 'MP3',
  vocals: 'Вокал',
  accompaniment: 'Инструментал',
  transcript: 'Текст',
  video: 'Видео',
  archive: 'Архив',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function subscriptionLabel(account: AccountSummary): string {
  if (!account.subscription_until) return 'Нет активной подписки'
  const until = new Date(account.subscription_until)
  if (Number.isNaN(until.getTime()) || until <= new Date()) {
    return 'Подписка закончилась'
  }
  return `Активна до ${new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(until)}`
}

function visualizerUrl(downloadUrl: string): string {
  const absoluteDownload = new URL(downloadUrl, window.location.origin).toString()
  return `/visualizer?file=${encodeURIComponent(absoluteDownload)}`
}

function ResultCard({
  item,
  editorEnabled,
}: {
  item: LibraryItem
  editorEnabled: boolean
}) {
  const midi = item.artifacts.find((artifact) => artifact.role === 'midi')
  const isActive = ['queued', 'leased', 'running'].includes(item.status)
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
      <div className="result-card__top">
        <div className={`method-icon method-icon--${item.engine}`}>
          {item.engine === 'audio_separator' ? '◐' : item.engine === 'video_render' ? '▶' : '♪'}
        </div>
        <div className="result-card__identity">
          <h3>
            {item.project_id
              ? <a href={`/tracks/${item.project_id}`}>{item.title}</a>
              : item.title}
          </h3>
          <p>
            {METHOD_NAMES[item.engine] ?? item.engine}
            <span>·</span>
            {formatDate(item.created_at)}
          </p>
        </div>
        <span className={`status-pill status-pill--${item.status}`}>
          {isActive && <span className="status-dot" />}
          {STATUS_NAMES[item.status] ?? item.status}
        </span>
      </div>

      {item.sanitized_error && (
        <p className="result-error">Обработка не завершилась. Задание можно будет повторить позже.</p>
      )}

      {item.artifacts.length > 0 && (
        <div className="artifact-row">
          {midi && (
            <a className="artifact-button artifact-button--primary" href={visualizerUrl(midi.download_url)}>
              <span>▶</span>
              Смотреть
            </a>
          )}
          {midi && editorEnabled && (
            <button
              className="artifact-button artifact-button--editor"
              disabled={openingEditor}
              onClick={() => void openEditor()}
              type="button"
            >
              <span>✎</span>
              {openingEditor ? 'Открываем…' : 'Редактировать'}
            </button>
          )}
          {item.artifacts.map((artifact) => (
            <a
              className="artifact-button"
              href={artifact.download_url}
              key={`${item.id}-${artifact.id}`}
              rel="noreferrer"
            >
              <span>↓</span>
              {ARTIFACT_NAMES[artifact.role] ?? artifact.role}
            </a>
          ))}
        </div>
      )}
      {editorError && <p className="result-error">{editorError}</p>}
    </article>
  )
}

export default function Dashboard({
  initData,
  colorScheme,
  returnPath,
}: DashboardProps) {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        let accountResponse
        try {
          accountResponse = await getCurrentAccount()
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401 || !initData) {
            throw error
          }
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
        const [library, editor] = await Promise.all([
          getLibrary(),
          getEditorCapabilities().catch(() => ({
            enabled: false,
            rollout: 'off' as const,
            can_edit_owned_results: false,
            requires_active_subscription: false,
            max_midi_bytes: 0,
          })),
        ])
        if (!cancelled) {
          setState({
            kind: 'ready',
            account: accountResponse.account,
            items: library.items,
            editorEnabled: editor.enabled,
          })
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          setState({ kind: 'signed-out' })
          return
        }
        setState({
          kind: 'error',
          message: 'Не удалось загрузить кабинет. Попробуйте ещё раз.',
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [initData, returnPath])

  const activeItems = useMemo(
    () => state.kind === 'ready'
      ? state.items.filter((item) => ['queued', 'leased', 'running'].includes(item.status))
      : [],
    [state],
  )
  const historyItems = useMemo(
    () => state.kind === 'ready'
      ? state.items.filter((item) => !['queued', 'leased', 'running'].includes(item.status))
      : [],
    [state],
  )

  if (state.kind === 'loading') {
    return (
      <main className="cabinet-shell" data-theme={colorScheme}>
        <div className="cabinet-loading">
          <div className="brand-mark">♪</div>
          <div className="loading-line" />
          <div className="loading-line loading-line--short" />
        </div>
      </main>
    )
  }

  if (state.kind === 'signed-out') {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <a className="cabinet-home-link" href="https://audio2midi.ru">
          Audio2MIDI
        </a>
        <section className="sign-in-card">
          <div className="brand-mark">♪</div>
          <p className="eyebrow">Audio2MIDI</p>
          <h1>Ваши транскрипции всегда рядом</h1>
          <p>
            Войдите по email, чтобы открыть историю, подписку и результаты
            с любого устройства.
          </p>
          <EmailAuthForm
            onComplete={() =>
              window.location.assign(returnPath ?? window.location.pathname)
            }
          />
          <div className="auth-divider"><span>или</span></div>
          <a className="primary-action" href={telegramLoginUrl(returnPath)}>
            Открыть через Telegram
            <span>→</span>
          </a>
          <small>Telegram остаётся быстрым способом входа, но не обязателен.</small>
        </section>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <a className="cabinet-home-link" href="https://audio2midi.ru">
          Audio2MIDI
        </a>
        <section className="sign-in-card">
          <div className="brand-mark brand-mark--warning">!</div>
          <h1>Что-то пошло не так</h1>
          <p>{state.message}</p>
          <button className="primary-action" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </section>
      </main>
    )
  }

  const { account, editorEnabled } = state
  const displayName = account.username ? `@${account.username}` : 'Ваш аккаунт'

  return (
    <main className="cabinet-shell" data-theme={colorScheme}>
      <div className="cabinet-container">
        <header className="cabinet-header">
          <a className="brand" href="https://audio2midi.ru">
            <div className="brand-mark">♪</div>
            <div>
              <strong>Audio2MIDI</strong>
              <span>Музыка становится видимой</span>
            </div>
          </a>
          <a className="profile-chip" href="/profile">
            <div className="profile-avatar">{displayName.replace('@', '').slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{displayName}</strong>
              <span>Профиль</span>
            </div>
          </a>
        </header>

        <section className="hero-panel">
          <div>
            <p className="eyebrow">Личный кабинет</p>
            <h1>Ваша музыка.<br />В удобном виде.</h1>
            <p className="hero-copy">
              Транскрипции, ноты и аудиофайлы собраны в одном месте.
            </p>
            <a className="hero-new-project" href="/new">
              Новая композиция
              <span>→</span>
            </a>
          </div>
          <div className="hero-note-field" aria-hidden="true">
            <span style={{ '--note-x': '8%', '--note-y': '68%', '--note-w': '26%' } as React.CSSProperties} />
            <span style={{ '--note-x': '29%', '--note-y': '45%', '--note-w': '38%' } as React.CSSProperties} />
            <span style={{ '--note-x': '48%', '--note-y': '27%', '--note-w': '22%' } as React.CSSProperties} />
            <span style={{ '--note-x': '66%', '--note-y': '56%', '--note-w': '29%' } as React.CSSProperties} />
          </div>
        </section>

        <section className="summary-grid">
          <article className="summary-card summary-card--subscription">
            <div className="summary-icon">◇</div>
            <div>
              <span>Подписка</span>
              <strong>{subscriptionLabel(account)}</strong>
              <small>
                {account.auto_renew ? 'Автопродление включено' : 'Автопродление выключено'}
              </small>
            </div>
          </article>
          <article className="summary-card">
            <div className="summary-icon">▤</div>
            <div>
              <span>Транскрипции</span>
              <strong>{account.result_count}</strong>
              <small>Сохранено в истории</small>
            </div>
          </article>
          <article className="summary-card">
            <div className="summary-icon">◎</div>
            <div>
              <span>В обработке</span>
              <strong>{account.active_job_count}</strong>
              <small>{activeItems.length ? 'Можно закрыть приложение' : 'Очередь свободна'}</small>
            </div>
          </article>
        </section>

        {activeItems.length > 0 && (
          <section className="cabinet-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Сейчас</p>
                <h2>Обрабатывается</h2>
              </div>
            </div>
            <div className="result-list">
              {activeItems.map((item) => (
                <ResultCard
                  editorEnabled={editorEnabled}
                  item={item}
                  key={item.id}
                />
              ))}
            </div>
          </section>
        )}

        <section className="cabinet-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Библиотека</p>
              <h2>Последние результаты</h2>
            </div>
            <span>{historyItems.length} из {account.result_count}</span>
          </div>
          {historyItems.length ? (
            <div className="result-list">
              {historyItems.map((item) => (
                <ResultCard
                  editorEnabled={editorEnabled}
                  item={item}
                  key={item.id}
                />
              ))}
            </div>
          ) : (
            <div className="empty-library">
              <div className="empty-library__staff">♩ ♪ ♫</div>
              <h3>Здесь появятся ваши результаты</h3>
              <p>Загрузите аудиофайл прямо здесь или отправьте песню Telegram-боту.</p>
              <a href="/new">Создать композицию →</a>
            </div>
          )}
        </section>

        <footer className="cabinet-footer">
          <span>Audio2MIDI · 2026</span>
          <div className="cabinet-footer__actions">
            <a href="/support">Поддержка и отмена подписки</a>
            <button
              onClick={async () => {
                await logout()
                window.location.reload()
              }}
            >
              Выйти
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}
