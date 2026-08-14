import { useCallback, useEffect, useMemo, useState } from 'react'

import { getCurrentAccount } from '../api/account'
import { ApiError } from '../api/client'
import {
  cancelReelCandidate,
  getReelCandidate,
  getReelCandidates,
  getReelsCapabilities,
  publishReelCandidate,
  reviewReelRender,
  selectReelRender,
  updateReelRender,
  type ReelCandidate,
  type ReelCandidateSummary,
  type ReelRender,
} from '../api/reels'
import EmailAuthForm from './EmailAuthForm'

interface ReelsStudioProps {
  candidateId?: string
  colorScheme: 'light' | 'dark'
}

const STATUS_LABELS: Record<string, string> = {
  discovered: 'Найдено',
  selected: 'Выбрано',
  source_ready: 'Фрагмент готов',
  generating: 'PiCoGen',
  rendering: 'Рендер',
  ready_for_preview: 'Готов к проверке',
  preview: 'На проверке',
  scheduled: 'Запланировано',
  published: 'Опубликовано',
  rejected: 'Отбраковано',
  failed: 'Ошибка',
  cancelled: 'Отменено',
  queued: 'В очереди',
  running: 'В работе',
  succeeded: 'Прошло',
  ready: 'Готово',
}

const VARIANT_LABELS: Record<string, string> = {
  piano_original: 'Piano → original',
  original_piano: 'Original → piano',
  guess_reveal: 'Угадай → reveal',
}

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function ReelsStudio({
  candidateId,
  colorScheme,
}: ReelsStudioProps) {
  const [authState, setAuthState] = useState<
    'loading' | 'signed-out' | 'denied' | 'ready' | 'error'
  >('loading')
  const [authNonce, setAuthNonce] = useState(0)
  const [publishActionsEnabled, setPublishActionsEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getCurrentAccount()
      .then(() => getReelsCapabilities())
      .then((capabilities) => {
        if (!cancelled) {
          setPublishActionsEnabled(capabilities.publish_actions_enabled)
          setAuthState(capabilities.enabled ? 'ready' : 'denied')
        }
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          setAuthState('signed-out')
        } else {
          setAuthState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [authNonce])

  if (authState === 'loading') {
    return <StudioMessage colorScheme={colorScheme}>Открываем Studio…</StudioMessage>
  }
  if (authState === 'signed-out') {
    return (
      <StudioMessage colorScheme={colorScheme}>
        <p className="eyebrow">Закрытая студия</p>
        <h1>Войдите в Audio2MIDI</h1>
        <p>Доступ проверяется по вашему аккаунту beta.</p>
        <EmailAuthForm
          compact
          onComplete={() => {
            setAuthState('loading')
            setAuthNonce((value) => value + 1)
          }}
        />
      </StudioMessage>
    )
  }
  if (authState === 'denied') {
    return (
      <StudioMessage colorScheme={colorScheme}>
        <p className="eyebrow">Private beta</p>
        <h1>Доступ пока закрыт</h1>
        <p>Аккаунт работает, но ещё не добавлен в allowlist Reels Studio.</p>
        <a href="/">Вернуться в кабинет</a>
      </StudioMessage>
    )
  }
  if (authState === 'error') {
    return (
      <StudioMessage colorScheme={colorScheme}>
        Не удалось открыть Studio. Обновите страницу.
      </StudioMessage>
    )
  }
  return candidateId
    ? (
        <ReelDetail
          candidateId={candidateId}
          colorScheme={colorScheme}
          publishActionsEnabled={publishActionsEnabled}
        />
      )
    : <ReelList colorScheme={colorScheme} />
}

function StudioMessage({
  colorScheme,
  children,
}: {
  colorScheme: 'light' | 'dark'
  children: React.ReactNode
}) {
  return (
    <main className="reels-shell reels-centered" data-theme={colorScheme}>
      <section className="reels-message">{children}</section>
    </main>
  )
}

function ReelList({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  const [items, setItems] = useState<ReelCandidateSummary[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await getReelCandidates(filter || undefined))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить список.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="reels-shell" data-theme={colorScheme}>
      <div className="reels-container">
        <header className="reels-topbar">
          <a href="/">Audio2MIDI</a>
          <span>Internal / Reels Studio</span>
          <button type="button" onClick={() => void load()}>Обновить</button>
        </header>
        <section className="reels-hero">
          <div>
            <p className="eyebrow">Daily acquisition lab</p>
            <h1>Песни, варианты,<br />публикации.</h1>
          </div>
          <p>
            Маркетинговые jobs имеют низкий приоритет и не вытесняют
            пользовательскую очередь.
          </p>
        </section>
        <nav className="reels-filters" aria-label="Фильтр статусов">
          {['', 'generating', 'rendering', 'ready_for_preview', 'preview', 'scheduled', 'published', 'rejected', 'failed'].map((value) => (
            <button
              className={filter === value ? 'is-active' : ''}
              key={value || 'all'}
              type="button"
              onClick={() => setFilter(value)}
            >
              {value ? statusLabel(value) : 'Все'}
            </button>
          ))}
        </nav>
        {error && <p className="reels-error">{error}</p>}
        {loading ? (
          <p className="reels-muted">Загрузка…</p>
        ) : (
          <section className="reels-list">
            {items.map((item) => (
              <a className="reels-row" href={`/internal/reels/${item.id}`} key={item.id}>
                <span className={`reels-region reels-region--${item.region}`}>
                  {item.region.toUpperCase()}
                </span>
                <span className="reels-track">
                  <strong>{item.artist} — {item.title}</strong>
                  <small>{item.source_provider} · trend {item.trend_score.toFixed(1)}</small>
                </span>
                <span>
                  <strong>{item.best_quality_score?.toFixed(1) ?? '—'}</strong>
                  <small>quality</small>
                </span>
                <span>
                  <strong>{item.ready_render_count}/3</strong>
                  <small>ролики</small>
                </span>
                <span className={`reels-status reels-status--${item.status}`}>
                  {statusLabel(item.status)}
                </span>
                <span className="reels-row__arrow">↗</span>
              </a>
            ))}
            {!items.length && <p className="reels-empty">В этом статусе пока ничего нет.</p>}
          </section>
        )}
      </div>
    </main>
  )
}

function ReelDetail({
  candidateId,
  colorScheme,
  publishActionsEnabled,
}: {
  candidateId: string
  colorScheme: 'light' | 'dark'
  publishActionsEnabled: boolean
}) {
  const [candidate, setCandidate] = useState<ReelCandidate | null>(null)
  const [selectedRenderId, setSelectedRenderId] = useState('')
  const [settings, setSettings] = useState<Record<string, string | number>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [reviewVerdict, setReviewVerdict] = useState<'good' | 'usable_with_edits' | 'bad'>('good')
  const [reviewComment, setReviewComment] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await getReelCandidate(candidateId)
      setCandidate(next)
      const selected = next.renders.find((render) => render.selected)
        ?? next.renders.find((render) => render.status === 'ready')
      if (selected) setSelectedRenderId(selected.id)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть композицию.')
    }
  }, [candidateId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedRender = useMemo(
    () => candidate?.renders.find((render) => render.id === selectedRenderId) ?? null,
    [candidate, selectedRenderId],
  )

  useEffect(() => {
    if (!selectedRender) return
    setSettings({
      clip_start_seconds: selectedRender.settings.clip_start_seconds ?? 0,
      duration_seconds: selectedRender.settings.duration_seconds ?? 22,
      transition_seconds: selectedRender.settings.transition_seconds ?? 12.3,
      crossfade_seconds: selectedRender.settings.crossfade_seconds ?? 1.2,
      hook_text: selectedRender.settings.hook_text ?? '',
      cta_text: selectedRender.settings.cta_text ?? '',
    })
    const review = candidate?.reviews.find((item) => item.render_id === selectedRender.id)
    setReviewVerdict(review?.verdict ?? 'good')
    setReviewComment(review?.comment ?? '')
  }, [candidate?.reviews, selectedRender])

  async function action(name: string, task: () => Promise<void>) {
    setBusy(name)
    setError('')
    try {
      await task()
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Операция не выполнена.')
    } finally {
      setBusy('')
    }
  }

  if (!candidate) {
    return (
      <StudioMessage colorScheme={colorScheme}>
        {error || 'Загрузка композиции…'}
      </StudioMessage>
    )
  }

  return (
    <main className="reels-shell" data-theme={colorScheme}>
      <div className="reels-container">
        <header className="reels-topbar">
          <a href="/internal/reels">← Все композиции</a>
          <span>{candidate.campaign_code}</span>
          <button type="button" onClick={() => void load()}>Обновить</button>
        </header>
        <section className="reels-detail-heading">
          <div>
            <p className="eyebrow">{candidate.region.toUpperCase()} · {candidate.source_provider}</p>
            <h1>{candidate.artist}<br /><i>{candidate.title}</i></h1>
          </div>
          <div className="reels-detail-meta">
            <span className={`reels-status reels-status--${candidate.status}`}>
              {statusLabel(candidate.status)}
            </span>
            <a href={candidate.source_url} rel="noreferrer" target="_blank">Открыть источник ↗</a>
            <small>Автопубликация: {formatDate(candidate.auto_publish_at)}</small>
          </div>
        </section>

        {error && <p className="reels-error">{error}</p>}

        <section className="reels-audio-grid">
          <article className="reels-panel">
            <p className="eyebrow">Источник · {candidate.fragment_duration_seconds ?? 40} сек</p>
            <h2>Original fragment</h2>
            {candidate.source_audio_url
              ? <audio controls preload="metadata" src={candidate.source_audio_url} />
              : <p className="reels-muted">Фрагмент ещё не подготовлен.</p>}
          </article>
          <article className="reels-panel reels-attempts">
            <p className="eyebrow">Stochastic attempts</p>
            <h2>PiCoGen × {candidate.generations.length}</h2>
            {candidate.generations.map((generation) => (
              <div className={generation.selected ? 'reels-attempt is-selected' : 'reels-attempt'} key={generation.id}>
                <span>#{generation.attempt_no}</span>
                <strong>{generation.quality_score?.toFixed(1) ?? statusLabel(generation.status)}</strong>
                <small>seed {generation.seed}</small>
                {generation.preview_audio_url && (
                  <audio controls preload="none" src={generation.preview_audio_url} />
                )}
                {generation.rejection_reasons.length > 0 && (
                  <em>{generation.rejection_reasons.join(' · ')}</em>
                )}
              </div>
            ))}
          </article>
        </section>

        <section className="reels-section-heading">
          <div>
            <p className="eyebrow">Render variants</p>
            <h2>Три честно ротируемых шаблона</h2>
          </div>
        </section>
        <section className="reels-render-grid">
          {candidate.renders.map((render) => (
            <RenderCard
              key={render.id}
              render={render}
              active={render.id === selectedRenderId}
              onOpen={() => setSelectedRenderId(render.id)}
              onSelect={() => void action(
                `select-${render.id}`,
                () => selectReelRender(candidate.id, render.id),
              )}
              busy={Boolean(busy)}
            />
          ))}
        </section>

        {selectedRender && (
          <><section className="reels-controls">
            <div>
              <p className="eyebrow">Fine tune</p>
              <h2>{VARIANT_LABELS[selectedRender.variant] ?? selectedRender.variant}</h2>
              <p>Изменение создаёт новый idempotent render-job. Старый MP4 не переиспользуется.</p>
            </div>
            <div className="reels-control-grid">
              <NumberField label="Начало, сек" min={0} max={12} step={0.1} name="clip_start_seconds" settings={settings} setSettings={setSettings} />
              <NumberField label="Длительность" min={8} max={35} step={1} name="duration_seconds" settings={settings} setSettings={setSettings} />
              <NumberField label="Переход" min={2} max={32} step={0.1} name="transition_seconds" settings={settings} setSettings={setSettings} />
              <NumberField label="Crossfade" min={0.3} max={3} step={0.1} name="crossfade_seconds" settings={settings} setSettings={setSettings} />
              <label className="reels-wide-field">
                <span>Hook</span>
                <input value={String(settings.hook_text ?? '')} maxLength={120} onChange={(event) => setSettings((value) => ({ ...value, hook_text: event.target.value }))} />
              </label>
              <label className="reels-wide-field">
                <span>CTA</span>
                <input value={String(settings.cta_text ?? '')} maxLength={120} onChange={(event) => setSettings((value) => ({ ...value, cta_text: event.target.value }))} />
              </label>
              <button
                className="reels-primary reels-wide-field"
                disabled={Boolean(busy) || selectedRender.status === 'rendering'}
                type="button"
                onClick={() => void action(
                  'rerender',
                  () => updateReelRender(selectedRender.id, settings),
                )}
              >
                {busy === 'rerender' ? 'Создаём job…' : 'Перерендерить вариант'}
              </button>
            </div>
          </section>
          <section className="reels-controls reels-review-panel">
            <div><p className="eyebrow">Human review</p><h2>Можно использовать этот ролик?</h2><p>Публикация доступна только после оценки «хорошо» или «можно после правок».</p></div>
            <div className="reels-control-grid">
              <label className="reels-wide-field"><span>Вердикт</span><select value={reviewVerdict} onChange={(event) => setReviewVerdict(event.target.value as typeof reviewVerdict)}><option value="good">Хорошо</option><option value="usable_with_edits">Можно после правок</option><option value="bad">Плохо</option></select></label>
              <label className="reels-wide-field"><span>Комментарий</span><textarea maxLength={2000} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Коротко: что хорошо или что исправить…" /></label>
              <button className="reels-primary reels-wide-field" disabled={Boolean(busy)} type="button" onClick={() => void action('review', () => reviewReelRender(selectedRender.id, { verdict: reviewVerdict, tags: [], comment: reviewComment }))}>{busy === 'review' ? 'Сохраняем…' : 'Сохранить оценку'}</button>
            </div>
          </section></>
        )}

        <section className="reels-publication-panel">
          <div>
            <p className="eyebrow">Distribution</p>
            <h2>YouTube + Instagram</h2>
            <div className="reels-publications">
              {candidate.publications.map((publication) => (
                <span key={publication.id}>
                  <strong>{publication.platform}</strong>
                  {statusLabel(publication.status)}
                  {publication.external_url && <a href={publication.external_url} target="_blank" rel="noreferrer">↗</a>}
                </span>
              ))}
              {!candidate.publications.length && <small>Публикации ещё не создавались.</small>}
            </div>
          </div>
          <div className="reels-actions">
            <button
              disabled={Boolean(busy)}
              type="button"
              onClick={() => void action('cancel', () => cancelReelCandidate(candidate.id))}
            >
              Отменить
            </button>
            <button
              className="reels-primary"
              disabled={
                Boolean(busy)
                || !publishActionsEnabled
                || !candidate.renders.some((render) => render.selected && render.status === 'ready')
                || !candidate.reviews.some((review) => candidate.renders.some((render) => render.id === review.render_id && render.selected) && review.verdict !== 'bad')
              }
              type="button"
              onClick={() => void action('publish', () => publishReelCandidate(candidate.id))}
            >
              {busy === 'publish'
                ? 'Ставим в очередь…'
                : publishActionsEnabled
                  ? 'Опубликовать сейчас'
                  : 'Публикация выключена'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function RenderCard({
  render,
  active,
  onOpen,
  onSelect,
  busy,
}: {
  render: ReelRender
  active: boolean
  onOpen: () => void
  onSelect: () => void
  busy: boolean
}) {
  return (
    <article className={`reels-render-card${active ? ' is-active' : ''}`}>
      <button className="reels-video-button" type="button" onClick={onOpen}>
        {render.preview_url
          ? <video controls playsInline preload="metadata" src={render.preview_url} />
          : <span className="reels-video-placeholder">{statusLabel(render.status)}</span>}
      </button>
      <div>
        <strong>{VARIANT_LABELS[render.variant] ?? render.variant}</strong>
        <span>{statusLabel(render.status)}</span>
      </div>
      <button
        disabled={busy || render.status !== 'ready' || render.selected}
        type="button"
        onClick={onSelect}
      >
        {render.selected ? 'Выбран' : 'Выбрать'}
      </button>
    </article>
  )
}

function NumberField({
  label,
  min,
  max,
  step,
  name,
  settings,
  setSettings,
}: {
  label: string
  min: number
  max: number
  step: number
  name: string
  settings: Record<string, string | number>
  setSettings: React.Dispatch<React.SetStateAction<Record<string, string | number>>>
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        max={max}
        min={min}
        step={step}
        type="number"
        value={Number(settings[name] ?? min)}
        onChange={(event) => setSettings((value) => ({
          ...value,
          [name]: Number(event.target.value),
        }))}
      />
    </label>
  )
}
