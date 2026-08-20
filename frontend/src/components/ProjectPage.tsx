import { useEffect, useMemo, useRef, useState } from 'react'

import {
  authenticateWithTelegram,
  createBrowserHandoff,
  getEditorCapabilities,
  getProject,
  renderProjectVideo,
  sendProjectFeedback,
} from '../api/account'
import { ApiError } from '../api/client'
import { downloadIntentUrl, trackProductEvent, visualizerUrl } from '../api/analytics'
import type { LibraryArtifact, ProjectDetail } from '../api/types'
import { PageHeading, ProductHeader, ProductLoading, StatusBadge } from './ProductFrame'

interface ProjectPageProps {
  projectId: string
  initData: string | null
  colorScheme: 'light' | 'dark'
}

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Загрузка', queued: 'В очереди', processing: 'Обрабатывается', ready: 'Готово', failed: 'Ошибка обработки',
}

const METHOD_LABELS: Record<string, string> = {
  picogen: 'Пиано-кавер',
  piano_transcription: 'Ноты из записи фортепиано',
  sheetsage: 'Мелодия и аккорды',
  music2midi: 'Быстрый MIDI',
  audio_separator: 'Разделение аудио',
}

const ARTIFACT_LABELS: Record<string, string> = {
  midi: 'MIDI', source_midi: 'Исходный MIDI', score_midi: 'MIDI партитуры', musicxml: 'MusicXML',
  pdf: 'Партитура PDF', mp3: 'Аудио MP3', wav: 'Аудио WAV', full_audio: 'Полное аудио',
  preview_mp3: 'Демо 30 секунд', vocals: 'Вокал', accompaniment: 'Инструментал',
  video: 'Видео', transcript: 'Текст', native_pdf: 'Оригинальная партитура', native_lilypond: 'LilyPond',
}

function artifact(artifacts: LibraryArtifact[], role: string) {
  return artifacts.find((item) => item.role === role)
}

export default function ProjectPage({ projectId, initData, colorScheme }: ProjectPageProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [editorEnabled, setEditorEnabled] = useState(false)
  const [error, setError] = useState('')
  const [videoBusy, setVideoBusy] = useState(false)
  const [browserBusy, setBrowserBusy] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const projectOpenTracked = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    async function load() {
      try {
        let response
        try {
          response = await getProject(projectId)
        } catch (loadError) {
          if (!(loadError instanceof ApiError) || loadError.status !== 401 || !initData) throw loadError
          const authentication = await authenticateWithTelegram(initData)
          if ('merge_required' in authentication && authentication.merge_required) {
            throw new ApiError('Сначала объедините аккаунты в профиле.', 409)
          }
          response = await getProject(projectId)
        }
        if (cancelled) return
        setProject(response.project)
        setFeedbackSent(response.project.feedback_submitted)
        if (!projectOpenTracked.current) {
          projectOpenTracked.current = true
          void trackProductEvent('project.opened', {
            objectType: 'project', objectId: projectId, properties: { surface: 'project' },
          })
        }
        const capabilities = await getEditorCapabilities().catch(() => null)
        if (!cancelled) setEditorEnabled(Boolean(capabilities?.enabled))
        setError('')
        if (['queued', 'processing'].includes(response.project.status)) timer = window.setTimeout(() => void load(), 4000)
      } catch (loadError) {
        if (cancelled) return
        setError(loadError instanceof ApiError && loadError.status === 401
          ? 'Войдите в кабинет, чтобы открыть эту композицию.'
          : 'Не удалось загрузить композицию.')
      }
    }
    void load()
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [initData, projectId])

  useEffect(() => {
    if (project?.status !== 'ready' || project.feedback_submitted || feedbackSent) return
    const dismissedUntil = Number(localStorage.getItem(`a2m_feedback_dismissed_until:${projectId}`) || 0)
    if (dismissedUntil > Date.now()) return
    const timer = window.setTimeout(() => {
      setFeedbackVisible(true)
      void trackProductEvent('feedback.prompt_shown', {
        objectType: 'project', objectId: projectId, properties: { surface: 'project' },
      })
    }, 20_000)
    return () => window.clearTimeout(timer)
  }, [feedbackSent, project, projectId])

  const latest = project?.versions[0]
  const artifacts = useMemo(() => latest?.artifacts ?? [], [latest])
  const midi = artifact(artifacts, 'midi') ?? artifact(artifacts, 'score_midi') ?? artifact(artifacts, 'source_midi')
  const playable = artifacts.filter((item) => ['mp3', 'wav', 'full_audio', 'preview_mp3', 'vocals', 'accompaniment'].includes(item.role))
  const locked = latest?.delivery_state === 'locked'

  async function makeVideo() {
    if (!latest || videoBusy) return
    setVideoBusy(true)
    setError('')
    try {
      await renderProjectVideo(projectId, latest.version_id)
      window.location.reload()
    } catch (videoError) {
      setError(videoError instanceof ApiError && videoError.status === 402
        ? 'Сначала откройте полный результат.'
        : 'Не удалось запустить создание видео.')
      setVideoBusy(false)
    }
  }

  async function openFullEditor() {
    if (browserBusy) return
    setBrowserBusy(true)
    setError('')
    try {
      const handoff = await createBrowserHandoff(projectId)
      const url = new URL(handoff.handoff_url, window.location.origin).toString()
      const telegram = (window as unknown as {
        Telegram?: { WebApp?: { openLink?: (target: string) => void } }
      }).Telegram?.WebApp
      if (telegram?.openLink) telegram.openLink(url)
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Не удалось открыть полную версию редактора.')
    } finally {
      setBrowserBusy(false)
    }
  }

  async function submitFeedback() {
    if (!latest || feedbackRating < 1) return
    setError('')
    try {
      await sendProjectFeedback(projectId, {
        project_version_id: latest.version_id,
        rating: feedbackRating,
        tags: [feedbackRating === 5 ? 'yes' : feedbackRating === 3 ? 'partly' : 'no'],
        comment: feedbackComment,
      })
      setFeedbackSent(true)
      setFeedbackVisible(false)
    } catch {
      setError('Не удалось отправить отзыв. Попробуйте ещё раз.')
    }
  }

  function dismissFeedback() {
    localStorage.setItem(
      `a2m_feedback_dismissed_until:${projectId}`,
      String(Date.now() + 30 * 24 * 60 * 60 * 1000),
    )
    setFeedbackVisible(false)
    void trackProductEvent('feedback.prompt_dismissed', {
      objectType: 'project', objectId: projectId, properties: { surface: 'project' },
    })
  }

  if (!project && !error) return <ProductLoading label="Открываем композицию…" />
  if (!project) {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <section className="studio-message"><h1>Композиция недоступна</h1><p>{error}</p><a className="secondary-action" href="/">Вернуться в кабинет</a></section>
      </main>
    )
  }

  const methodLabel = METHOD_LABELS[latest?.engine ?? ''] ?? 'Музыкальная обработка'

  return (
    <main className="cabinet-shell" data-theme={colorScheme}>
      <div className="cabinet-container">
        <ProductHeader backHref="/" backLabel="Все композиции" actions={<a className="primary-action" href="/new">Новая композиция</a>} />
        <PageHeading
          eyebrow={methodLabel}
          title={project.title}
          description={project.source_filename || 'Композиция из истории Audio2MIDI'}
          action={<StatusBadge status={project.status}>{STATUS_LABELS[project.status] ?? project.status}</StatusBadge>}
        />

        {['queued', 'processing'].includes(project.status) && (
          <section className="queue-panel">
            <div className="queue-panel__pulse" aria-hidden="true">♪</div>
            <div>
              <h2>{project.status === 'queued' ? 'Композиция сохранена в очереди' : 'Обрабатываем аудио'}</h2>
              <p>{project.status === 'queued'
                ? 'Файл не потеряется, даже если сервер обработки временно недоступен. Страницу можно закрыть.'
                : 'Результат появится здесь автоматически. Страницу можно закрыть.'}</p>
            </div>
          </section>
        )}

        {project.status === 'failed' && (
          <section className="queue-panel queue-panel--error">
            <div className="queue-panel__pulse" aria-hidden="true">!</div>
            <div><h2>Обработка не завершилась</h2><p>{latest?.sanitized_error || 'Проект сохранён — обработку можно повторить позже.'}</p></div>
          </section>
        )}

        {project.status === 'ready' && (
          <>
            <section className="workspace-grid">
              <article className="workspace-card workspace-card--primary">
                <p className="eyebrow">Результат</p>
                <h2>Слушайте и смотрите ноты</h2>
                {playable.length > 0 ? (
                  <div className="audio-list">
                    {playable.slice(0, 2).map((item) => (
                      <article className="audio-result" key={item.id}>
                        <strong>{ARTIFACT_LABELS[item.role] ?? item.role}</strong>
                        <audio aria-label={ARTIFACT_LABELS[item.role] ?? item.role} controls preload="metadata" src={item.download_url} />
                      </article>
                    ))}
                  </div>
                ) : <p>Аудиоверсия готовится или недоступна для этого результата.</p>}
                {midi && (
                  <div className="workspace-actions">
                    <a className="primary-action" href={visualizerUrl(midi.download_url)}>Открыть визуализацию</a>
                    {editorEnabled && <a className="secondary-action" href={`/editor/${project.id}`}>Редактировать</a>}
                    {editorEnabled && initData && (
                      <button className="secondary-action" disabled={browserBusy} onClick={() => void openFullEditor()} type="button">
                        {browserBusy ? 'Открываем…' : 'Открыть в браузере ↗'}
                      </button>
                    )}
                  </div>
                )}
              </article>
            </section>

            {locked && (
              <section className="queue-panel">
                <div className="queue-panel__pulse" aria-hidden="true">♬</div>
                <div>
                  <h2>Полная версия готова</h2>
                  <p>После покупки откроются MIDI, PDF и полный MP3. Повторная обработка не нужна.</p>
                  <a className="primary-action" href="/billing">Открыть полный результат</a>
                </div>
              </section>
            )}

            {midi && !locked && (
              <section className="project-section project-visualizer">
                <div className="section-heading">
                  <h2>Piano roll</h2>
                  <a href={visualizerUrl(midi.download_url)}>На весь экран ↗</a>
                </div>
                <iframe
                  loading="lazy"
                  src={visualizerUrl(midi.download_url)}
                  title={`Piano roll — ${project.title}`}
                />
              </section>
            )}

            <section className="project-section">
              <div className="section-heading"><h2>Скачать</h2><span>{artifacts.length} файлов</span></div>
              <div className="project-files">
                {artifacts.filter((item) => item.role !== 'archive').map((item) => (
                  <a href={downloadIntentUrl(item.download_url)} key={item.id}>
                    <span aria-hidden="true">{item.role.includes('midi') ? '♪' : item.role.includes('pdf') ? '▤' : '▶'}</span>
                    <div><strong>{ARTIFACT_LABELS[item.role] ?? item.role}</strong><small>{item.size_bytes ? `${(item.size_bytes / 1024 / 1024).toFixed(1)} МБ` : 'Готово к скачиванию'}</small></div>
                    <em>↓</em>
                  </a>
                ))}
              </div>
            </section>

            <section className="project-section">
              <div className="section-heading"><h2>Другие действия</h2></div>
              <div className="project-tools">
                <button className="secondary-action" disabled={!midi || videoBusy} onClick={() => void makeVideo()} type="button">
                  {videoBusy ? 'Запускаем…' : 'Сделать видео'}
                </button>
                <a className="secondary-action" href="/new">Обработать другую композицию</a>
              </div>
              {error && <p className="studio-error" role="alert">{error}</p>}
            </section>

            {(feedbackVisible || feedbackSent) && <section className="project-section feedback-panel feedback-panel--inline">
              <div className="section-heading"><h2>Получился результат, который вы хотели?</h2>{!feedbackSent && <button className="feedback-dismiss" aria-label="Скрыть вопрос" onClick={dismissFeedback} type="button">×</button>}</div>
              {feedbackSent ? <p className="feedback-thanks">Спасибо — это поможет улучшить следующие результаты.</p> : (
                <>
                  <div className="feedback-choices" aria-label="Оценка результата">
                    {[{ rating: 5, label: 'Да' }, { rating: 3, label: 'Частично' }, { rating: 1, label: 'Нет' }].map(({ rating, label }) => (
                      <button
                        aria-label={`${rating} из 5`}
                        aria-pressed={feedbackRating === rating}
                        className={feedbackRating === rating ? 'feedback-choice feedback-choice--active' : 'feedback-choice'}
                        key={rating}
                        onClick={() => setFeedbackRating(rating)}
                        type="button"
                      >{label}</button>
                    ))}
                  </div>
                  <textarea maxLength={4000} onChange={(event) => setFeedbackComment(event.target.value)} placeholder="Если хотите, напишите одной фразой, чего не хватило…" value={feedbackComment} />
                  <button className="secondary-action" disabled={!feedbackRating} onClick={() => void submitFeedback()} type="button">Отправить отзыв</button>
                </>
              )}
            </section>}
          </>
        )}
      </div>
    </main>
  )
}
