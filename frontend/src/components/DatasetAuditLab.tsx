import { useCallback, useEffect, useRef, useState } from 'react'

import { authenticateWithTelegram } from '../api/account'
import {
  getNextDatasetAuditCard,
  listDatasetAudits,
  submitDatasetAuditReview,
} from '../api/research'
import type {
  DatasetAudit,
  DatasetAuditArrangementType,
  DatasetAuditCard,
  DatasetAuditReview,
  DatasetAuditTriState,
  ResearchProgress,
} from '../api/research'

interface DatasetAuditLabProps {
  initData: string | null
  colorScheme: 'light' | 'dark'
}

type CompletedAuditForm = Omit<
  DatasetAuditReview,
  'session_id' | 'card_id' | 'response_ms'
>
type AuditForm = {
  same_composition: DatasetAuditTriState | ''
  piano_clean: DatasetAuditTriState | ''
  target_suitable: DatasetAuditTriState | ''
  arrangement_type: DatasetAuditArrangementType | ''
  extra_instruments: DatasetAuditTriState | ''
  comment: string
}
type AuditField = Exclude<keyof AuditForm, 'comment'>

const INITIAL_FORM: AuditForm = {
  same_composition: '',
  piano_clean: '',
  target_suitable: '',
  arrangement_type: '',
  extra_instruments: '',
  comment: '',
}

const TRI_STATE_OPTIONS: Array<{ value: DatasetAuditTriState; label: string }> = [
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
  { value: 'unsure', label: 'Не уверен' },
]

const ARRANGEMENT_OPTIONS: Array<{
  value: DatasetAuditArrangementType
  label: string
}> = [
  { value: 'full_arrangement', label: 'Полная аранжировка' },
  { value: 'accompaniment', label: 'Только аккомпанемент' },
  { value: 'piano_original', label: 'Изначально фортепианная музыка' },
  { value: 'other', label: 'Другой тип' },
  { value: 'unsure', label: 'Не уверен' },
]

function auditSessionId(): string {
  const key = 'audio2midi-dataset-audit-session'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const created = window.crypto.randomUUID()
  window.localStorage.setItem(key, created)
  return created
}

function isComplete(form: AuditForm): form is CompletedAuditForm {
  return Boolean(
    form.same_composition
    && form.piano_clean
    && form.target_suitable
    && form.arrangement_type
    && form.extra_instruments,
  )
}

function ChoiceGroup({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string
  name: AuditField
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (field: AuditField, value: string) => void
}) {
  return (
    <fieldset className="dataset-audit-fieldset">
      <legend>{label}</legend>
      <div className="dataset-audit-choices">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(name, option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function AuditPlayer({
  title,
  description,
  src,
  onPlay,
}: {
  title: string
  description: string
  src: string
  onPlay: (element: HTMLAudioElement) => void
}) {
  return (
    <article className="research-variant dataset-audit-player">
      <div className="research-variant__title">
        <strong className="research-variant__heading">{title}</strong>
      </div>
      <p>{description}</p>
      <audio
        controls
        preload="metadata"
        src={src}
        onPlay={(event) => onPlay(event.currentTarget)}
      />
    </article>
  )
}

export default function DatasetAuditLab({
  initData,
  colorScheme,
}: DatasetAuditLabProps) {
  const [audits, setAudits] = useState<DatasetAudit[]>([])
  const [auditId, setAuditId] = useState('')
  const [card, setCard] = useState<DatasetAuditCard | null>(null)
  const [progress, setProgress] = useState<ResearchProgress>({ completed: 0, total: 0 })
  const [form, setForm] = useState<AuditForm>(INITIAL_FORM)
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'error'>(
    'loading',
  )
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const activeAudio = useRef<HTMLAudioElement | null>(null)
  const startedAt = useRef(0)

  const loadNext = useCallback(async (id: string) => {
    setStatus('loading')
    setError('')
    try {
      const payload = await getNextDatasetAuditCard(id)
      setCard(payload.card)
      setProgress(payload.progress)
      setForm(INITIAL_FORM)
      startedAt.current = performance.now()
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть карточку')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        if (initData) await authenticateWithTelegram(initData)
        const items = await listDatasetAudits()
        setAudits(items)
        const first = items.find((item) => item.completed_count < item.card_count)
          ?? items[0]
        if (!first) throw new Error('Активных аудитов корпуса пока нет')
        setAuditId(first.id)
        await loadNext(first.id)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Не удалось открыть аудит')
        setStatus('error')
      }
    }
    void load()
  }, [initData, loadNext])

  const pauseOtherPlayers = useCallback((element: HTMLAudioElement) => {
    if (activeAudio.current && activeAudio.current !== element) {
      activeAudio.current.pause()
    }
    activeAudio.current = element
  }, [])

  function updateField(field: AuditField, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(filesBroken = false) {
    if (!card || status === 'submitting') return
    let values: CompletedAuditForm
    if (filesBroken) {
      values = {
        same_composition: 'files_broken',
        piano_clean: 'files_broken',
        target_suitable: 'files_broken',
        arrangement_type: 'files_broken',
        extra_instruments: 'files_broken',
        comment: form.comment,
      }
    } else {
      if (!isComplete(form)) {
        setError('Ответьте на 5 вопросов или отметьте, что файлы не открываются.')
        return
      }
      values = form
    }
    setStatus('submitting')
    setError('')
    setSaved(false)
    try {
      await submitDatasetAuditReview(auditId, {
        session_id: auditSessionId(),
        card_id: card.id,
        ...values,
        response_ms: Math.max(0, Math.round(performance.now() - startedAt.current)),
      })
      activeAudio.current?.pause()
      setSaved(true)
      await loadNext(auditId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить ответы')
      setStatus('ready')
    }
  }

  const percent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0

  return (
    <main
      className={`research-shell${initData ? ' research-shell--telegram' : ''}`}
      data-theme={colorScheme}
    >
      <div className="research-container">
        <header className="research-header">
          <a href="https://audio2midi.ru" className="research-brand">Audio2MIDI</a>
          <a className="dataset-audit-back" href="/research/listening">К сравнениям</a>
        </header>

        <section className="research-intro">
          <p>ПРИВАТНАЯ ПРОВЕРКА КОРПУСА</p>
          <h1>Проверяем пару,<br />а не источник.</h1>
          <div className="research-intro__meta">
            <span>{audits.find((item) => item.id === auditId)?.title ?? 'Аудит корпуса'}</span>
            <span>{progress.completed} / {progress.total}</span>
          </div>
          <div className="research-progress"><span style={{ width: `${percent}%` }} /></div>
        </section>

        <section className="research-audit-note">
          <strong>Здесь нет результатов PiCoGen</strong>
          <p>
            Сравните песню с фортепианной версией, затем проверьте звучание
            MIDI. Название источника и автоматические метрики скрыты.
          </p>
        </section>

        {error && <div className="research-error" role="alert">{error}</div>}
        {saved && <p className="research-vote-saved" role="status">Ответы сохранены</p>}
        {status === 'loading' && <div className="research-loading">Готовлю пару…</div>}

        {status !== 'loading' && !card && !error && (
          <section className="research-complete">
            <span>✓</span>
            <h2>Все 100 пар проверены</h2>
            <p>Теперь можно собрать high-confidence выборку и сравнить режимы обучения.</p>
          </section>
        )}

        {card && status !== 'loading' && (
          <>
            <section className="research-variants dataset-audit-players">
              <AuditPlayer
                title="1. Исходная песня"
                description="Нужна как ориентир: мелодия, гармония и структура."
                src={card.source_audio_url}
                onPlay={pauseOtherPlayers}
              />
              <AuditPlayer
                title="2. Фортепианная версия"
                description="Проверьте, та ли это композиция, чистое ли пианино и какой это тип аранжировки."
                src={card.target_piano_audio_url}
                onPlay={pauseOtherPlayers}
              />
              <AuditPlayer
                title="3. Звучание MIDI"
                description="Проверьте, подходит ли этот MIDI для обучения."
                src={card.midi_render_audio_url}
                onPlay={pauseOtherPlayers}
              />
              <article className="research-variant dataset-audit-roll">
                <div className="research-variant__title">
                  <strong className="research-variant__heading">Визуализация проверяемого MIDI</strong>
                </div>
                <a href={card.piano_roll_url} target="_blank" rel="noreferrer">
                  <img
                    src={card.piano_roll_url}
                    alt="Визуализация проверяемого MIDI"
                    width="1680"
                    height="480"
                  />
                </a>
                <a className="research-download" href={card.target_midi_url}>Скачать MIDI</a>
              </article>
            </section>

            <section className="research-review dataset-audit-form">
              <div className="research-question">
                <p>ПРОВЕРКА ПАРЫ</p>
                <h2>Что именно можно доверить обучению?</h2>
              </div>
              <ChoiceGroup
                name="same_composition"
                label={card.question.same_composition ?? 'Это одна композиция?'}
                value={form.same_composition}
                options={TRI_STATE_OPTIONS}
                onChange={updateField}
              />
              <ChoiceGroup
                name="piano_clean"
                label={card.question.piano_clean ?? 'В фортепианной версии слышно только пианино?'}
                value={form.piano_clean}
                options={TRI_STATE_OPTIONS}
                onChange={updateField}
              />
              <ChoiceGroup
                name="target_suitable"
                label={card.question.target_suitable ?? 'MIDI пригоден для обучения?'}
                value={form.target_suitable}
                options={TRI_STATE_OPTIONS}
                onChange={updateField}
              />
              <ChoiceGroup
                name="arrangement_type"
                label={card.question.arrangement_type ?? 'Какой это тип аранжировки?'}
                value={form.arrangement_type}
                options={ARRANGEMENT_OPTIONS}
                onChange={updateField}
              />
              <ChoiceGroup
                name="extra_instruments"
                label={card.question.extra_instruments ?? 'Есть дополнительные инструменты?'}
                value={form.extra_instruments}
                options={TRI_STATE_OPTIONS}
                onChange={updateField}
              />
              <label className="dataset-audit-comment">
                <span>Комментарий, если нужен</span>
                <textarea
                  value={form.comment}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))}
                  maxLength={2000}
                  rows={3}
                  placeholder="Например: на фоне слышен саксофон…"
                />
              </label>
              <div className="dataset-audit-actions">
                <button
                  type="button"
                  onClick={() => void submit(false)}
                  disabled={status === 'submitting' || !isComplete(form)}
                >
                  {status === 'submitting' ? 'Сохраняю…' : 'Сохранить и дальше'}
                </button>
                <button
                  type="button"
                  className="dataset-audit-broken"
                  onClick={() => void submit(true)}
                  disabled={status === 'submitting'}
                >
                  Файлы не открываются
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
