import { useEffect, useMemo, useState } from 'react'

import {
  authenticateWithTelegram,
  getEditorCapabilities,
  getProject,
  renderProjectVideo,
  sendProjectFeedback,
} from '../api/account'
import { ApiError } from '../api/client'
import type { LibraryArtifact, ProjectDetail } from '../api/types'

interface ProjectPageProps {
  projectId: string
  initData: string | null
  colorScheme: 'light' | 'dark'
}

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Загрузка',
  queued: 'В очереди',
  processing: 'Обрабатывается',
  ready: 'Готово',
  failed: 'Ошибка обработки',
}

const ARTIFACT_LABELS: Record<string, string> = {
  midi: 'MIDI',
  pdf: 'Партитура PDF',
  mp3: 'Аудио MP3',
  preview_mp3: 'Демо 30 секунд',
  vocals: 'Вокал',
  accompaniment: 'Инструментал',
  video: 'Видео',
  transcript: 'Текст',
}

function visualizerUrl(downloadUrl: string): string {
  const absolute = new URL(downloadUrl, window.location.origin).toString()
  return `/visualizer?file=${encodeURIComponent(absolute)}`
}

function artifact(artifacts: LibraryArtifact[], role: string) {
  return artifacts.find((item) => item.role === role)
}

export default function ProjectPage({
  projectId,
  initData,
  colorScheme,
}: ProjectPageProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [editorEnabled, setEditorEnabled] = useState(false)
  const [error, setError] = useState('')
  const [videoBusy, setVideoBusy] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    async function load() {
      try {
        let response
        try {
          response = await getProject(projectId)
        } catch (loadError) {
          if (!(loadError instanceof ApiError) || loadError.status !== 401 || !initData) {
            throw loadError
          }
          const authentication = await authenticateWithTelegram(initData)
          if ('merge_required' in authentication && authentication.merge_required) {
            throw new ApiError('Сначала объедините аккаунты в профиле.', 409)
          }
          response = await getProject(projectId)
        }
        if (cancelled) return
        setProject(response.project)
        const capabilities = await getEditorCapabilities().catch(() => null)
        if (!cancelled) {
          setEditorEnabled(Boolean(capabilities?.enabled))
        }
        setError('')
        if (['queued', 'processing'].includes(response.project.status)) {
          timer = window.setTimeout(() => void load(), 4000)
        }
      } catch (loadError) {
        if (cancelled) return
        setError(
          loadError instanceof ApiError && loadError.status === 401
            ? 'Откройте кабинет через Telegram, чтобы увидеть этот проект.'
            : 'Не удалось загрузить проект.',
        )
      }
    }
    void load()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [initData, projectId])

  const latest = project?.versions[0]
  const artifacts = useMemo(() => latest?.artifacts ?? [], [latest])
  const midi = artifact(artifacts, 'midi')
  const playable = artifacts.filter((item) =>
    ['mp3', 'preview_mp3', 'vocals', 'accompaniment'].includes(item.role),
  )
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
        : 'Не удалось запустить рендер видео.')
      setVideoBusy(false)
    }
  }

  async function submitFeedback() {
    if (!latest || feedbackRating < 1) return
    await sendProjectFeedback(projectId, {
      project_version_id: latest.version_id,
      rating: feedbackRating,
      tags: [],
      comment: feedbackComment,
    })
    setFeedbackSent(true)
  }

  if (!project && !error) {
    return <main className="cabinet-shell studio-centered" data-theme={colorScheme}>Загружаем проект…</main>
  }
  if (!project) {
    return (
      <main className="cabinet-shell studio-centered" data-theme={colorScheme}>
        <section className="studio-message"><h1>Проект недоступен</h1><p>{error}</p><a href="/">Вернуться в кабинет</a></section>
      </main>
    )
  }

  return (
    <main className="cabinet-shell studio-shell" data-theme={colorScheme}>
      <div className="cabinet-container">
        <header className="studio-header">
          <a className="studio-back" href="/">← Все композиции</a>
          <a className="studio-new-link" href="/new">+ Новый проект</a>
        </header>

        <section className="project-heading">
          <div>
            <p className="eyebrow">Композиция</p>
            <h1>{project.title}</h1>
            <p>{project.source_filename || 'MIDI из истории Audio2MIDI'}</p>
          </div>
          <span className={`project-status project-status--${project.status}`}>
            {['queued', 'processing'].includes(project.status) && <i />}
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
        </section>

        {['queued', 'processing'].includes(project.status) && (
          <section className="queue-panel">
            <div className="queue-panel__pulse">♪</div>
            <div>
              <h2>{project.status === 'queued' ? 'Задача надёжно сохранена в очереди' : 'Сейчас обрабатываем аудио'}</h2>
              <p>
                {project.status === 'queued'
                  ? 'Даже если GPU-сервер временно занят или недоступен, файл не потеряется.'
                  : 'Страницу можно закрыть — результат останется в личном кабинете.'}
              </p>
            </div>
          </section>
        )}

        {project.status === 'failed' && (
          <section className="queue-panel queue-panel--error">
            <div className="queue-panel__pulse">!</div>
            <div><h2>Обработка не завершилась</h2><p>{latest?.sanitized_error || 'Мы сохранили проект и можем повторить обработку позже.'}</p></div>
          </section>
        )}

        {project.status === 'ready' && (
          <>
            <section className="workspace-grid">
              <article className="workspace-card workspace-card--primary">
                <p className="eyebrow">Piano Roll</p>
                <h2>Посмотрите результат<br />по нотам и времени.</h2>
                <div className="workspace-roll" aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </div>
                {midi && (
                  <div className="workspace-actions">
                    <a className="primary-action" href={visualizerUrl(midi.download_url)}>
                      Смотреть →
                    </a>
                    {editorEnabled && (
                      <a className="secondary-action" href={`/editor/${project.id}`}>
                        Редактировать
                      </a>
                    )}
                    <button className="secondary-action" disabled={videoBusy} onClick={() => void makeVideo()} type="button">
                      {videoBusy ? 'Запускаем…' : 'Сделать видео'}
                    </button>
                  </div>
                )}
              </article>
              <article className="workspace-card">
                <p className="eyebrow">Версия</p>
                <h2>{latest?.version_label ?? 'Исходная генерация'}</h2>
                <p>
                  {editorEnabled
                    ? 'Изменения сохраняются как новая версия — исходник останется доступен.'
                    : 'Редактор сейчас включается по закрытому beta-списку.'}
                </p>
                <span className="workspace-version">v{project.versions.length}</span>
              </article>
            </section>

            {playable.length > 0 && (
              <section className="project-section">
                <div className="section-heading"><div><p className="eyebrow">Прослушивание</p><h2>Аудиорезультат</h2></div></div>
                <div className="audio-list">
                  {playable.map((item) => (
                    <article className="audio-result" key={item.id}>
                      <strong>{ARTIFACT_LABELS[item.role] ?? item.role}</strong>
                      <audio controls preload="metadata" src={item.download_url} />
                    </article>
                  ))}
                </div>
              </section>
            )}

            {locked && (
              <section className="queue-panel">
                <div className="queue-panel__pulse">♬</div>
                <div>
                  <h2>Полная версия готова</h2>
                  <p>Послушайте демо. После покупки откроются MIDI, PDF и полный MP3 — повторная обработка не нужна.</p>
                  <a className="primary-action" href="/billing">Открыть полный результат →</a>
                </div>
              </section>
            )}

            <section className="project-section">
              <div className="section-heading"><div><p className="eyebrow">Файлы</p><h2>Скачать результат</h2></div></div>
              <div className="project-files">
                {artifacts.filter((item) => item.role !== 'archive').map((item) => (
                  <a href={item.download_url} key={item.id}>
                    <span>{item.role === 'midi' ? '♪' : item.role === 'pdf' ? '▤' : '▶'}</span>
                    <div><strong>{ARTIFACT_LABELS[item.role] ?? item.role}</strong><small>{item.size_bytes ? `${(item.size_bytes / 1024 / 1024).toFixed(1)} МБ` : 'Готово к скачиванию'}</small></div>
                    <em>↓</em>
                  </a>
                ))}
              </div>
            </section>

            <section className="project-section feedback-panel">
              <div className="section-heading"><div><p className="eyebrow">Обратная связь</p><h2>Как получился результат?</h2></div></div>
              {feedbackSent ? <p className="feedback-thanks">Спасибо — это поможет улучшить следующие партитуры.</p> : <>
                <div className="feedback-stars" aria-label="Оценка от 1 до 5">
                  {[1, 2, 3, 4, 5].map((rating) => <button className={rating <= feedbackRating ? 'feedback-star feedback-star--active' : 'feedback-star'} key={rating} onClick={() => setFeedbackRating(rating)} type="button">★</button>)}
                </div>
                <textarea maxLength={4000} onChange={(event) => setFeedbackComment(event.target.value)} placeholder="Что было хорошо или что стоит исправить?" value={feedbackComment} />
                <button className="secondary-action" disabled={!feedbackRating} onClick={() => void submitFeedback()} type="button">Отправить отзыв</button>
              </>}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
