import { useEffect, useMemo, useRef, useState } from 'react'

import {
  authenticateWithTelegram,
  createPianoProcessingRequest,
  createProjectImport,
  createProjectUpload,
  getProjectImport,
  getCurrentAccount,
  searchCatalog,
  submitProject,
  uploadProjectSource,
} from '../api/account'
import { ApiError } from '../api/client'
import {
  currentCampaignCode,
  recordCampaignEvent,
} from '../api/reels'
import type { AccountSummary, CatalogTrack } from '../api/types'
import EmailAuthForm from './EmailAuthForm'

interface NewProjectProps {
  initData: string | null
  colorScheme: 'light' | 'dark'
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; account: AccountSummary }
  | { kind: 'error'; message: string }

const MAX_FILE_BYTES = 20 * 1024 * 1024
const ACCEPTED_AUDIO = '.mp3,.wav,.m4a,.ogg,.flac,.aac'

const METHODS = [
  {
    id: 'picogen',
    name: 'Пиано-кавер',
    hint: 'Выразительное фортепианное переложение',
    tag: 'Основной',
  },
  {
    id: 'piano_transcription',
    name: 'Фортепиано → ноты',
    hint: 'Для записей, где уже звучит пианино',
    tag: 'Точно',
  },
  {
    id: 'sheetsage',
    name: 'Мелодия и гармония',
    hint: 'Структура композиции, аккорды и MIDI',
    tag: 'Подробно',
  },
  {
    id: 'music2midi',
    name: 'Быстрый MIDI',
    hint: 'Универсальная транскрипция без долгого ожидания',
    tag: 'Быстро',
  },
  {
    id: 'audio_separator',
    name: 'Разделить аудио',
    hint: 'Получить вокал и инструментал отдельно',
    tag: 'Стемы',
  },
] as const

function mimeForFile(file: File): string {
  if (file.type) return file.type
  const suffix = file.name.split('.').pop()?.toLowerCase()
  return {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
  }[suffix ?? ''] ?? 'application/octet-stream'
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hasSubscription(account: AccountSummary): boolean {
  if (account.subscription_status === 'active') return true
  if (!account.subscription_until) return false
  return new Date(account.subscription_until) > new Date()
}

export default function NewProject({ initData, colorScheme }: NewProjectProps) {
  const [page, setPage] = useState<PageState>({ kind: 'loading' })
  const [file, setFile] = useState<File | null>(null)
  const [sourceMode, setSourceMode] = useState<'file' | 'link' | 'catalog'>('file')
  const [sourceUrl, setSourceUrl] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogTracks, setCatalogTracks] = useState<CatalogTrack[]>([])
  const [selectedTrack, setSelectedTrack] = useState<CatalogTrack | null>(null)
  const [searching, setSearching] = useState(false)
  const [title, setTitle] = useState('')
  const [engine, setEngine] = useState('picogen')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [authNonce, setAuthNonce] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function authenticate() {
      try {
        let response
        try {
          response = await getCurrentAccount()
        } catch (authError) {
          if (!(authError instanceof ApiError) || authError.status !== 401 || !initData) {
            throw authError
          }
          const authentication = await authenticateWithTelegram(initData)
          if ('merge_required' in authentication && authentication.merge_required) {
            throw new ApiError('Сначала объедините аккаунты в профиле.', 409)
          }
          response = authentication
        }
        if (!cancelled) setPage({ kind: 'ready', account: response.account })
      } catch (authError) {
        if (cancelled) return
        if (authError instanceof ApiError && authError.status === 401) {
          setPage({ kind: 'signed-out' })
        } else {
          setPage({ kind: 'error', message: 'Не удалось открыть создание проекта.' })
        }
      }
    }
    void authenticate()
    return () => {
      cancelled = true
    }
  }, [authNonce, initData])

  useEffect(() => {
    currentCampaignCode()
  }, [])

  const effectiveTitle = useMemo(
    () => title.trim() || selectedTrack?.title || file?.name.replace(/\.[^.]+$/, '') || '',
    [file, selectedTrack, title],
  )

  const canStart = sourceMode === 'file'
    ? Boolean(file)
    : sourceMode === 'link'
      ? /^https:\/\//i.test(sourceUrl.trim())
      : Boolean(selectedTrack)

  const availableAccount = page.kind === 'ready' ? page.account : null
  const hasEntitlement = Boolean(
    availableAccount
      && (hasSubscription(availableAccount) || Number(availableAccount.remaining_requests ?? 0) > 0),
  )

  function chooseFile(nextFile: File | undefined) {
    setError('')
    if (!nextFile) return
    if (nextFile.size > MAX_FILE_BYTES) {
      setError('Файл больше 20 МБ. Пока загрузите более короткую или сжатую версию.')
      return
    }
    const suffix = `.${nextFile.name.split('.').pop()?.toLowerCase()}`
    if (!ACCEPTED_AUDIO.includes(suffix)) {
      setError('Поддерживаются MP3, WAV, M4A, OGG, FLAC и AAC.')
      return
    }
    setFile(nextFile)
    if (!title) setTitle(nextFile.name.replace(/\.[^.]+$/, ''))
  }

  async function runCatalogSearch() {
    const query = catalogQuery.trim()
    if (query.length < 2) return
    setSearching(true)
    setError('')
    try {
      const result = await searchCatalog(query)
      setCatalogTracks(result.tracks)
      if (!result.tracks.length) setError('Ничего не нашли. Попробуйте исполнителя и название.')
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Каталог временно недоступен.')
    } finally {
      setSearching(false)
    }
  }

  async function waitForImport(importId: string): Promise<string> {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const result = await getProjectImport(importId)
      if (result.import.status === 'ready' && result.import.project_id) return result.import.project_id
      if (result.import.status === 'failed') {
        throw new Error(result.import.sanitized_error || 'Не удалось получить аудио по ссылке.')
      }
      setProgress(result.import.status === 'resolving' ? 'Получаем аудио…' : 'Источник в очереди…')
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
    }
    throw new Error('Источник сохранён, но подготовка занимает больше обычного. Проверьте кабинет позже.')
  }

  async function startProcessing() {
    if (!canStart || page.kind !== 'ready') return
    if (!hasEntitlement) {
      setError('Пробные обработки закончились. Оформите доступ прямо на сайте.')
      return
    }
    setError('')
    try {
      await recordCampaignEvent('upload_started', {
        engine,
        source: sourceMode,
        size_bytes: file?.size,
      }).catch(() => undefined)
      let projectId: string
      if (sourceMode === 'file' && file) {
        setProgress('Проверяем файл…')
        const digest = await sha256(file)
        setProgress('Загружаем аудио в защищённое хранилище…')
        const upload = await createProjectUpload({
          title: effectiveTitle,
          filename: file.name,
          sha256: digest,
          size_bytes: file.size,
          mime_type: mimeForFile(file),
        })
        await uploadProjectSource(upload.upload_url, file, upload.required_headers)
        projectId = upload.project.id
      } else {
        setProgress('Готовим источник…')
        const sourceValue = sourceMode === 'catalog'
          ? selectedTrack!.source_id
          : sourceUrl.trim()
        const created = await createProjectImport({
          source_kind: sourceMode === 'catalog' ? 'catalog_track' : 'url',
          source_value: sourceValue,
          title: effectiveTitle || undefined,
        })
        projectId = await waitForImport(created.import.id)
      }
      setProgress('Ставим задачу в очередь…')
      if (engine === 'piano_transcription') {
        await createPianoProcessingRequest(projectId)
      } else {
        await submitProject(projectId, engine)
      }
      await recordCampaignEvent('upload_completed', {
        engine,
        project_id: projectId,
      }).catch(() => undefined)
      window.location.assign(`/tracks/${projectId}`)
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 402) {
        setError('Пробные обработки закончились. Оформите доступ и повторите.')
      } else {
        setError(submitError instanceof Error
          ? submitError.message
          : 'Не удалось создать проект. Попробуйте ещё раз.')
      }
      setProgress('')
    }
  }

  if (page.kind === 'loading') {
    return <main className="cabinet-shell studio-centered" data-theme={colorScheme}>Загрузка…</main>
  }
  if (page.kind === 'signed-out') {
    return (
      <main className="cabinet-shell studio-centered" data-theme={colorScheme}>
        <section className="studio-message">
          <p className="eyebrow">Audio2MIDI Studio</p>
          <h1>Войдите, чтобы загрузить песню</h1>
          <p>Получите код по email. Telegram остаётся быстрым дополнительным способом входа.</p>
          <EmailAuthForm
            onComplete={() => {
              void recordCampaignEvent('signup').catch(() => undefined)
              setPage({ kind: 'loading' })
              setAuthNonce((value) => value + 1)
            }}
          />
          <div className="auth-method-divider"><span>или</span></div>
          <a className="secondary-text-action" href="https://t.me/Audio2MIDIBot?startapp=cabinet">Открыть через Telegram</a>
        </section>
      </main>
    )
  }
  if (page.kind === 'error') {
    return <main className="cabinet-shell studio-centered" data-theme={colorScheme}>{page.message}</main>
  }

  return (
    <main className="cabinet-shell studio-shell" data-theme={colorScheme}>
      <div className="cabinet-container">
        <header className="studio-header">
          <a className="studio-back" href="/">← Кабинет</a>
          <span>Новая композиция</span>
        </header>

        <section className="studio-intro">
          <p className="eyebrow">Новый проект</p>
          <h1>Превратим аудио<br />в рабочий материал.</h1>
          <p>Загрузите композицию и выберите, какой результат нужен.</p>
        </section>

        {!hasSubscription(page.account) && (
          <section className="studio-subscription-notice">
            <div>
              <span>Пробный доступ</span>
              <strong>{page.account.remaining_requests ?? 0} обработки бесплатно</strong>
              <p>Попробуйте без оплаты. Полные файлы открываются после покупки доступа.</p>
            </div>
            <a className="primary-action" href="/billing">Выбрать тариф →</a>
          </section>
        )}

        <div className="studio-grid">
          <section className="studio-panel">
            <div className="studio-step"><span>01</span><div><h2>Аудиофайл</h2><p>До 20 МБ · MP3, WAV, M4A, OGG, FLAC, AAC</p></div></div>
            <div className="source-tabs" role="tablist">
              {([['file', 'Файл'], ['link', 'Ссылка'], ['catalog', 'Найти песню']] as const).map(([mode, label]) => (
                <button className={sourceMode === mode ? 'source-tab source-tab--active' : 'source-tab'} key={mode} onClick={() => { setSourceMode(mode); setError('') }} type="button">{label}</button>
              ))}
            </div>
            {sourceMode === 'file' && <>
            <input
              ref={inputRef}
              hidden
              type="file"
              accept={ACCEPTED_AUDIO}
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <button
              className={`upload-dropzone${dragging ? ' upload-dropzone--dragging' : ''}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                chooseFile(event.dataTransfer.files[0])
              }}
            >
              <span className="upload-dropzone__icon">↑</span>
              {file ? (
                <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} МБ · нажмите, чтобы заменить</small></>
              ) : (
                <><strong>Выберите файл или перетащите сюда</strong><small>Файл сразу попадёт в приватное хранилище</small></>
              )}
            </button>
            </>}
            {sourceMode === 'link' && (
              <div className="source-link-box">
                <span className="source-link-box__icon">↗</span>
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Ссылка на Яндекс Музыку, Spotify или YouTube" type="url" />
                <small>Ссылка сохранится как источник проекта; аудио заберёт сервер.</small>
              </div>
            )}
            {sourceMode === 'catalog' && (
              <div className="catalog-search">
                <div className="catalog-search__bar"><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void runCatalogSearch() }} placeholder="Исполнитель или название" /><button disabled={searching} onClick={() => void runCatalogSearch()} type="button">{searching ? '…' : 'Найти'}</button></div>
                <div className="catalog-results">
                  {catalogTracks.map((track) => (
                    <button className={selectedTrack?.source_id === track.source_id ? 'catalog-track catalog-track--active' : 'catalog-track'} key={track.source_id} onClick={() => { setSelectedTrack(track); if (!title) setTitle(`${track.artist} — ${track.title}`) }} type="button">
                      {track.artwork_url ? <img alt="" src={track.artwork_url} /> : <span>♪</span>}
                      <span><strong>{track.title}</strong><small>{track.artist}</small></span><em>+</em>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="studio-field">
              <span>Название композиции</span>
              <input
                value={title}
                maxLength={255}
                placeholder="Например, Ночной поезд"
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          </section>

          <section className="studio-panel">
            <div className="studio-step"><span>02</span><div><h2>Метод обработки</h2><p>Результаты сохранятся в этом проекте</p></div></div>
            <div className="method-picker">
              {METHODS.map((method) => (
                <button
                  className={engine === method.id ? 'method-choice method-choice--active' : 'method-choice'}
                  key={method.id}
                  type="button"
                  onClick={() => setEngine(method.id)}
                >
                  <span className="method-choice__note">♪</span>
                  <span><strong>{method.name}</strong><small>{method.hint}</small></span>
                  <em>{method.tag}</em>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="studio-submit">
          <div>
            <strong>{effectiveTitle || 'Новая композиция'}</strong>
            <span>{file ? METHODS.find((method) => method.id === engine)?.name : 'Сначала выберите аудиофайл'}</span>
          </div>
          {hasEntitlement ? (
            <button
              className="primary-action studio-submit__button"
              type="button"
              disabled={!canStart || Boolean(progress)}
              onClick={() => void startProcessing()}
            >
              {progress || 'Начать обработку →'}
            </button>
          ) : (
            <a className="primary-action studio-submit__button" href="/billing">
              Оформить подписку →
            </a>
          )}
        </section>
        {error && <p className="studio-error">{error}</p>}
      </div>
    </main>
  )
}
