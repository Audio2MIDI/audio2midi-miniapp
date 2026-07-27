import { useEffect, useMemo, useRef, useState } from 'react'

import {
  authenticateWithTelegram,
  createProjectUpload,
  getCurrentAccount,
  submitProject,
  uploadProjectSource,
} from '../api/account'
import { ApiError } from '../api/client'
import type { AccountSummary } from '../api/types'

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
  const [title, setTitle] = useState('')
  const [engine, setEngine] = useState('picogen')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
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
          response = await authenticateWithTelegram(initData)
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
  }, [initData])

  const effectiveTitle = useMemo(
    () => title.trim() || file?.name.replace(/\.[^.]+$/, '') || '',
    [file, title],
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

  async function startProcessing() {
    if (!file || page.kind !== 'ready') return
    if (!hasSubscription(page.account)) {
      setError('Для обработки на сайте нужна активная подписка. Управление оплатой добавим следующим этапом.')
      return
    }
    setError('')
    try {
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
      await uploadProjectSource(
        upload.upload_url,
        file,
        upload.required_headers,
      )
      setProgress('Ставим задачу в очередь…')
      await submitProject(upload.project.id, engine)
      window.location.assign(`/tracks/${upload.project.id}`)
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 402) {
        setError('Подписка не активна. Пока оформить её можно через Telegram-бота.')
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
          <h1>Войдите через Telegram</h1>
          <p>После входа проекты и подписка автоматически привяжутся к вашему аккаунту.</p>
          <a className="primary-action" href="https://t.me/Audio2MIDIBot?startapp=cabinet">Открыть Telegram</a>
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

        <div className="studio-grid">
          <section className="studio-panel">
            <div className="studio-step"><span>01</span><div><h2>Аудиофайл</h2><p>До 20 МБ · MP3, WAV, M4A, OGG, FLAC, AAC</p></div></div>
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
          <button
            className="primary-action studio-submit__button"
            type="button"
            disabled={!file || Boolean(progress)}
            onClick={() => void startProcessing()}
          >
            {progress || 'Начать обработку →'}
          </button>
        </section>
        {error && <p className="studio-error">{error}</p>}
      </div>
    </main>
  )
}
