import { useEffect, useMemo, useRef, useState } from 'react'

import {
  authenticateWithTelegram,
  createPianoProcessingRequest,
  createProjectImport,
  createProjectUpload,
  getCurrentAccount,
  getProjectImport,
  searchCatalog,
  submitProject,
  uploadProjectSource,
} from '../api/account'
import { ApiError } from '../api/client'
import { currentCampaignCode, recordCampaignEvent } from '../api/reels'
import type { AccountSummary, CatalogTrack } from '../api/types'
import {
  clearProjectDraft,
  nextStep,
  PRIMARY_ENGINES,
  previousStep,
  readProjectDraft,
  searchForStep,
  SECONDARY_ENGINES,
  stepFromSearch,
  writeProjectDraft,
  type NewProjectStep,
  type SourceMode,
} from '../newProjectState'
import EmailAuthForm from './EmailAuthForm'
import { PageHeading, ProductHeader, ProductLoading } from './ProductFrame'

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
  { id: 'picogen', name: 'Пиано-кавер', hint: 'Выразительное фортепианное переложение' },
  { id: 'piano_transcription', name: 'Ноты из записи фортепиано', hint: 'Точная транскрипция, если в записи уже звучит пианино' },
  { id: 'sheetsage', name: 'Мелодия и аккорды', hint: 'Мелодическая линия, гармония и MIDI' },
  { id: 'music2midi', name: 'Быстрый MIDI', hint: 'Универсальная транскрипция без долгого ожидания' },
  { id: 'audio_separator', name: 'Разделить аудио', hint: 'Получить вокал и инструментал отдельно' },
] as const

function mimeForFile(file: File): string {
  if (file.type) return file.type
  const suffix = file.name.split('.').pop()?.toLowerCase()
  return {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
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

function freeProcessingLabel(value: number | null): string {
  const count = Math.max(0, Number(value ?? 0))
  const modulo100 = count % 100
  const modulo10 = count % 10
  const noun = modulo100 >= 11 && modulo100 <= 14
    ? 'обработок'
    : modulo10 === 1
      ? 'обработка'
      : modulo10 >= 2 && modulo10 <= 4
        ? 'обработки'
        : 'обработок'
  return `${count} бесплатн${noun === 'обработка' ? 'ая' : noun === 'обработки' ? 'ые' : 'ых'} ${noun}`
}

export default function NewProject({ initData, colorScheme }: NewProjectProps) {
  const savedDraft = useMemo(() => readProjectDraft(window.sessionStorage), [])
  const [page, setPage] = useState<PageState>({ kind: 'loading' })
  const [step, setStep] = useState<NewProjectStep>(() => stepFromSearch(window.location.search))
  const [file, setFile] = useState<File | null>(null)
  const [sourceMode, setSourceMode] = useState<SourceMode>(savedDraft?.sourceMode ?? 'file')
  const [sourceUrl, setSourceUrl] = useState(savedDraft?.sourceUrl ?? '')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogTracks, setCatalogTracks] = useState<CatalogTrack[]>([])
  const [selectedTrack, setSelectedTrack] = useState<CatalogTrack | null>(savedDraft?.selectedTrack ?? null)
  const [searching, setSearching] = useState(false)
  const [title, setTitle] = useState(savedDraft?.title ?? '')
  const [engine, setEngine] = useState(savedDraft?.engine ?? 'picogen')
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
          if (!(authError instanceof ApiError) || authError.status !== 401 || !initData) throw authError
          const authentication = await authenticateWithTelegram(initData)
          if ('merge_required' in authentication && authentication.merge_required) {
            throw new ApiError('Сначала объедините аккаунты в профиле.', 409)
          }
          response = authentication
        }
        if (!cancelled) setPage({ kind: 'ready', account: response.account })
      } catch (authError) {
        if (cancelled) return
        if (authError instanceof ApiError && authError.status === 401) setPage({ kind: 'signed-out' })
        else setPage({ kind: 'error', message: 'Не удалось открыть создание композиции.' })
      }
    }
    void authenticate()
    return () => { cancelled = true }
  }, [authNonce, initData])

  useEffect(() => { currentCampaignCode() }, [])

  useEffect(() => {
    const onPopState = () => setStep(stepFromSearch(window.location.search))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    writeProjectDraft(window.sessionStorage, { sourceMode, sourceUrl, title, engine, selectedTrack })
  }, [engine, selectedTrack, sourceMode, sourceUrl, title])

  const effectiveTitle = useMemo(
    () => title.trim() || (selectedTrack ? `${selectedTrack.artist} — ${selectedTrack.title}` : '') || file?.name.replace(/\.[^.]+$/, '') || 'Моя композиция',
    [file, selectedTrack, title],
  )
  const sourceReady = sourceMode === 'file'
    ? Boolean(file)
    : sourceMode === 'link'
      ? /^https:\/\//i.test(sourceUrl.trim())
      : Boolean(selectedTrack)
  const availableAccount = page.kind === 'ready' ? page.account : null
  const hasEntitlement = Boolean(availableAccount
    && (hasSubscription(availableAccount) || Number(availableAccount.remaining_requests ?? 0) > 0))
  const selectedMethod = METHODS.find((method) => method.id === engine) ?? METHODS[0]

  function goToStep(next: NewProjectStep) {
    setError('')
    window.history.pushState({}, '', `${window.location.pathname}${searchForStep(next)}`)
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function chooseFile(nextFile: File | undefined) {
    setError('')
    if (!nextFile) return
    if (nextFile.size > MAX_FILE_BYTES) {
      setError('Файл больше 20 МБ. Загрузите более короткую или сжатую версию.')
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
      if (result.import.status === 'failed') throw new Error(result.import.sanitized_error || 'Не удалось получить аудио по ссылке.')
      setProgress(result.import.status === 'resolving' ? 'Получаем аудио…' : 'Источник в очереди…')
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
    }
    throw new Error('Источник сохранён, но подготовка занимает больше обычного. Проверьте кабинет позже.')
  }

  async function startProcessing() {
    if (!sourceReady || page.kind !== 'ready' || !hasEntitlement) return
    setError('')
    try {
      await recordCampaignEvent('upload_started', { engine, source: sourceMode, size_bytes: file?.size }).catch(() => undefined)
      let projectId: string
      if (sourceMode === 'file' && file) {
        setProgress('Проверяем файл…')
        const digest = await sha256(file)
        setProgress('Загружаем аудио…')
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
        const sourceValue = sourceMode === 'catalog' ? selectedTrack!.source_id : sourceUrl.trim()
        const created = await createProjectImport({
          source_kind: sourceMode === 'catalog' ? 'catalog_track' : 'url',
          source_value: sourceValue,
          title: effectiveTitle || undefined,
        })
        projectId = await waitForImport(created.import.id)
      }
      setProgress('Ставим задачу в очередь…')
      if (engine === 'piano_transcription') await createPianoProcessingRequest(projectId)
      else await submitProject(projectId, engine)
      await recordCampaignEvent('upload_completed', { engine, project_id: projectId }).catch(() => undefined)
      clearProjectDraft(window.sessionStorage)
      window.location.assign(`/tracks/${projectId}`)
    } catch (submitError) {
      setError(submitError instanceof ApiError && submitError.status === 402
        ? 'Бесплатные обработки закончились. Выберите тариф и повторите.'
        : submitError instanceof Error ? submitError.message : 'Не удалось создать проект. Попробуйте ещё раз.')
      setProgress('')
    }
  }

  if (page.kind === 'loading') return <ProductLoading label="Открываем загрузку…" />
  if (page.kind === 'signed-out') {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <a className="cabinet-home-link" href="https://audio2midi.ru">Audio2MIDI</a>
        <section className="studio-message">
          <p className="eyebrow">Новая композиция</p>
          <h1>Войдите, чтобы загрузить аудио</h1>
          <p>Получите одноразовый код по email. Telegram можно использовать как альтернативу.</p>
          <EmailAuthForm onComplete={() => {
            void recordCampaignEvent('signup').catch(() => undefined)
            setPage({ kind: 'loading' })
            setAuthNonce((value) => value + 1)
          }} />
          <div className="auth-method-divider"><span>или</span></div>
          <a className="secondary-action" href="https://t.me/Audio2MIDIBot?startapp=cabinet">Войти через Telegram</a>
        </section>
      </main>
    )
  }
  if (page.kind === 'error') {
    return (
      <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
        <section className="studio-message"><h1>Страница не открылась</h1><p>{page.message}</p><a className="secondary-action" href="/">В кабинет</a></section>
      </main>
    )
  }

  const stepNumber = step === 'source' ? 1 : step === 'result' ? 2 : 3
  const sourceLabel = sourceMode === 'file'
    ? file?.name ?? 'Файл нужно выбрать повторно'
    : sourceMode === 'catalog'
      ? selectedTrack ? `${selectedTrack.artist} — ${selectedTrack.title}` : 'Песня не выбрана'
      : sourceUrl.trim()

  return (
    <main className="cabinet-shell" data-theme={colorScheme}>
      <div className="cabinet-container">
        <ProductHeader backHref="/" backLabel="Мои композиции" />
        <PageHeading
          eyebrow="Новая композиция"
          title={step === 'source' ? 'Добавьте аудио' : step === 'result' ? 'Какой результат нужен?' : 'Всё готово к запуску'}
          description={step === 'source'
            ? 'Загрузите файл, вставьте ссылку или найдите песню.'
            : step === 'result'
              ? 'Выберите один результат — изменить решение можно до запуска.'
              : 'Проверьте источник и выбранный способ обработки.'}
        />

        <nav className="wizard-progress" aria-label="Шаги создания композиции">
          {(['source', 'result', 'review'] as const).map((item, index) => (
            <button
              className={`wizard-progress__step${step === item ? ' wizard-progress__step--active' : ''}${stepNumber > index + 1 ? ' wizard-progress__step--done' : ''}`}
              aria-current={step === item ? 'step' : undefined}
              disabled={index + 1 > stepNumber}
              key={item}
              onClick={() => goToStep(item)}
              type="button"
            >
              <span>{index + 1}</span>
              {item === 'source' ? 'Источник' : item === 'result' ? 'Результат' : 'Проверка'}
            </button>
          ))}
        </nav>

        {!hasSubscription(page.account) && (
          <p className="trial-line">
            <strong>{freeProcessingLabel(page.account.remaining_requests)}</strong>
            <span>·</span>
            <a href="/billing">Тарифы</a>
          </p>
        )}

        {step === 'source' && (
          <section className="studio-panel">
            <div className="source-tabs" role="tablist" aria-label="Источник аудио">
              {([['file', 'Файл'], ['link', 'Ссылка'], ['catalog', 'Найти песню']] as const).map(([mode, label]) => (
                <button
                  className={sourceMode === mode ? 'source-tab source-tab--active' : 'source-tab'}
                  aria-selected={sourceMode === mode}
                  key={mode}
                  onClick={() => { setSourceMode(mode); setError('') }}
                  role="tab"
                  type="button"
                >{label}</button>
              ))}
            </div>

            {sourceMode === 'file' && (
              <>
                <input ref={inputRef} hidden type="file" accept={ACCEPTED_AUDIO} onChange={(event) => chooseFile(event.target.files?.[0])} />
                <button
                  className={`upload-dropzone${dragging ? ' upload-dropzone--dragging' : ''}`}
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]) }}
                >
                  <span className="upload-dropzone__icon">↑</span>
                  {file
                    ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} МБ · нажмите, чтобы заменить</small></>
                    : <><strong>Выберите файл или перетащите сюда</strong><small>До 20 МБ · MP3, WAV, M4A, OGG, FLAC, AAC</small></>}
                </button>
              </>
            )}

            {sourceMode === 'link' && (
              <div className="source-link-box">
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Ссылка на Яндекс Музыку, Spotify или YouTube" type="url" />
                <small>Аудио загрузит сервер; ссылка останется источником композиции.</small>
              </div>
            )}

            {sourceMode === 'catalog' && (
              <div className="catalog-search">
                <div className="catalog-search__bar">
                  <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void runCatalogSearch() }} placeholder="Исполнитель или название" />
                  <button disabled={searching} onClick={() => void runCatalogSearch()} type="button">{searching ? 'Ищем…' : 'Найти'}</button>
                </div>
                <div className="catalog-results">
                  {catalogTracks.map((track) => (
                    <button
                      className={selectedTrack?.source_id === track.source_id ? 'catalog-track catalog-track--active' : 'catalog-track'}
                      key={track.source_id}
                      onClick={() => { setSelectedTrack(track); if (!title) setTitle(`${track.artist} — ${track.title}`) }}
                      type="button"
                    >
                      {track.artwork_url ? <img alt="" src={track.artwork_url} /> : <span>♪</span>}
                      <span><strong>{track.title}</strong><small>{track.artist}</small></span><em>Выбрать</em>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="studio-field">
              <span>Название композиции</span>
              <input value={title} maxLength={255} placeholder="Заполнится автоматически" onChange={(event) => setTitle(event.target.value)} />
            </label>
          </section>
        )}

        {step === 'result' && (
          <section className="studio-panel">
            <div className="method-picker">
              {METHODS.filter((method) => PRIMARY_ENGINES.includes(method.id as typeof PRIMARY_ENGINES[number])).map((method) => (
                <button aria-pressed={engine === method.id} className={engine === method.id ? 'method-choice method-choice--active' : 'method-choice'} key={method.id} type="button" onClick={() => setEngine(method.id)}>
                  <span className="method-choice__note">♪</span>
                  <span><strong>{method.name}</strong><small>{method.hint}</small></span>
                  <em>{engine === method.id ? 'Выбрано' : 'Выбрать'}</em>
                </button>
              ))}
            </div>
            <details className="other-tools" open={SECONDARY_ENGINES.includes(engine as typeof SECONDARY_ENGINES[number])}>
              <summary>Другие инструменты</summary>
              <div className="method-picker">
                {METHODS.filter((method) => SECONDARY_ENGINES.includes(method.id as typeof SECONDARY_ENGINES[number])).map((method) => (
                  <button aria-pressed={engine === method.id} className={engine === method.id ? 'method-choice method-choice--active' : 'method-choice'} key={method.id} type="button" onClick={() => setEngine(method.id)}>
                    <span className="method-choice__note">♪</span>
                    <span><strong>{method.name}</strong><small>{method.hint}</small></span>
                    <em>{engine === method.id ? 'Выбрано' : 'Выбрать'}</em>
                  </button>
                ))}
              </div>
            </details>
          </section>
        )}

        {step === 'review' && (
          <section className="wizard-review">
            <div className="review-row"><span>Источник</span><strong>{sourceLabel}</strong><button onClick={() => goToStep('source')} type="button">Изменить</button></div>
            <div className="review-row"><span>Название</span><strong>{effectiveTitle}</strong><button onClick={() => goToStep('source')} type="button">Изменить</button></div>
            <div className="review-row"><span>Результат</span><strong>{selectedMethod.name}</strong><button onClick={() => goToStep('result')} type="button">Изменить</button></div>
            <div className="review-row"><span>Доступ</span><strong>{hasSubscription(page.account) ? 'Активная подписка' : hasEntitlement ? freeProcessingLabel(page.account.remaining_requests) : 'Нужен тариф'}</strong></div>
          </section>
        )}

        {error && <p className="studio-error" role="alert">{error}</p>}
        {progress && <p className="studio-error" role="status">{progress}</p>}

        <div className="wizard-actions">
          {step !== 'source' ? (
            <button className="secondary-action" disabled={Boolean(progress)} onClick={() => goToStep(previousStep(step))} type="button">Назад</button>
          ) : <span />}
          <div className="wizard-actions__right">
            {step !== 'review' ? (
              <button
                className="primary-action"
                disabled={(step === 'source' && !sourceReady)}
                onClick={() => goToStep(nextStep(step))}
                type="button"
              >Продолжить</button>
            ) : hasEntitlement ? (
              <button className="primary-action" disabled={!sourceReady || Boolean(progress)} onClick={() => void startProcessing()} type="button">
                {progress || 'Начать обработку'}
              </button>
            ) : (
              <a className="primary-action" href="/billing">Выбрать тариф</a>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
