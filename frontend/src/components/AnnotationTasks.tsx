import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { authenticateWithTelegram } from '../api/account'
import {
  claimAnnotationInvitation,
  getAnnotationMe,
  getNextAnnotationAssignment,
  heartbeatAnnotationAssignment,
  listAnnotationCampaigns,
  openAnnotationEditor,
  saveAnnotationDraft,
  submitAnnotationAssignment,
  uploadAnnotationArtifact,
} from '../api/annotation'
import type {
  AnnotationAssignment,
  AnnotationCampaign,
  AnnotationProgress,
  AnnotationWorker,
} from '../api/annotation'

interface Props {
  initData: string | null
  inviteCode: string | null
  colorScheme: 'light' | 'dark'
}

const DEFECTS = [
  ['missing_melody', 'Потеряна мелодия'],
  ['wrong_harmony', 'Неверная гармония'],
  ['missing_bass', 'Потерян бас'],
  ['looping', 'Зацикливание'],
  ['hammering', 'Повторные удары аккордов'],
  ['wrong_tempo', 'Неверный темп'],
  ['too_dense', 'Слишком плотно'],
  ['too_sparse', 'Слишком пусто'],
  ['jumps', 'Неудобные скачки'],
  ['flat_velocity', 'Плоская динамика'],
  ['render_problem', 'Проблема рендера'],
] as const

const SOURCE_QUESTIONS = [
  ['same_composition', 'Это одна и та же композиция?'],
  ['full_arrangement', 'Это полный фортепианный кавер, а не только аккомпанемент?'],
  ['piano_clean', 'В целевом аудио звучит только фортепиано?'],
  ['target_suitable', 'Целевое аудио пригодно для обучения?'],
  ['midi_matches_target_audio', 'MIDI-рендер соответствует целевому аудио?'],
] as const

type Answer = Record<string, unknown>
type LoadStatus = 'loading' | 'ready' | 'saving' | 'complete' | 'error'

function money(minor: number, currency: string) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function AudioCard({
  title,
  src,
  onPlay,
  kind = 'variant',
}: {
  title: string
  src?: string
  onPlay: (element: HTMLAudioElement) => void
  kind?: 'source' | 'variant'
}) {
  if (!src) return null
  return (
    <article className={`annotation-media-card annotation-media-card--${kind}`}>
      <strong>{title}</strong>
      <audio controls preload="metadata" src={src} onPlay={(event) => onPlay(event.currentTarget)} />
    </article>
  )
}

function PianoRoll({ title, src }: { title: string; src?: string }) {
  if (!src) return null
  return (
    <a className="annotation-roll" href={src} target="_blank" rel="noreferrer">
      <span>{title}</span>
      <img src={src} alt={title} width="1680" height="480" />
    </a>
  )
}

function Choice({
  name,
  value,
  label,
  options,
  onChange,
}: {
  name: string
  value: unknown
  label: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="annotation-question">
      <legend>{label}</legend>
      <div className="annotation-choice-grid">
        {options.map(([option, text]) => (
          <label key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function AnnotationTasks({ initData, inviteCode, colorScheme }: Props) {
  const [worker, setWorker] = useState<AnnotationWorker | null>(null)
  const [campaigns, setCampaigns] = useState<AnnotationCampaign[]>([])
  const [campaignId, setCampaignId] = useState('')
  const [assignment, setAssignment] = useState<AnnotationAssignment | null>(null)
  const [progress, setProgress] = useState<AnnotationProgress | null>(null)
  const [answer, setAnswer] = useState<Answer>({ tags: [], comment: '' })
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState('')
  const [uploadedName, setUploadedName] = useState('')
  const [editorUrl, setEditorUrl] = useState('')
  const activeAudio = useRef<HTMLAudioElement | null>(null)
  const startedAt = useRef(0)
  const assignmentRef = useRef<AnnotationAssignment | null>(null)
  const draftRevisionRef = useRef(0)
  const lastSavedDraftRef = useRef('')

  const activeCampaign = useMemo(
    () => campaigns.find((item) => item.id === campaignId) ?? null,
    [campaignId, campaigns],
  )

  const pauseOther = useCallback((element: HTMLAudioElement) => {
    if (activeAudio.current && activeAudio.current !== element) activeAudio.current.pause()
    activeAudio.current = element
  }, [])

  const loadCampaigns = useCallback(async () => {
    const payload = await listAnnotationCampaigns()
    setCampaigns(payload.campaigns)
    setProgress(payload.progress)
    const first = payload.campaigns.find((item) => item.completed_items < item.assigned_items)
      ?? payload.campaigns[0]
    setCampaignId((current) => current || first?.id || '')
    return first?.id ?? ''
  }, [])

  const loadNext = useCallback(async (id: string) => {
    if (!id) {
      setStatus('complete')
      return
    }
    setStatus('loading')
    setError('')
    const next = await getNextAnnotationAssignment(id)
    setAssignment(next)
    const initialAnswer = next?.draft ?? { tags: [], comment: '' }
    setAnswer(initialAnswer)
    assignmentRef.current = next
    draftRevisionRef.current = next?.draft_revision ?? 0
    lastSavedDraftRef.current = JSON.stringify(initialAnswer)
    setUploadedName('')
    setEditorUrl(next?.payload.editor?.url ?? '')
    startedAt.current = performance.now()
    setStatus(next ? 'ready' : 'complete')
  }, [])

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        if (initData) await authenticateWithTelegram(initData)
        const current = inviteCode
          ? await claimAnnotationInvitation(inviteCode)
          : await getAnnotationMe()
        if (cancelled) return
        setWorker(current)
        const firstId = await loadCampaigns()
        if (!cancelled) await loadNext(firstId)
      } catch (reason) {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : 'Не удалось открыть задания')
        setStatus('error')
      }
    }
    void start()
    return () => { cancelled = true }
  }, [initData, inviteCode, loadCampaigns, loadNext])

  useEffect(() => {
    if (!assignment || status !== 'ready') return
    const timer = window.setInterval(() => {
      void heartbeatAnnotationAssignment(assignment).catch(() => undefined)
    }, 120_000)
    return () => window.clearInterval(timer)
  }, [assignment, status])

  useEffect(() => {
    const current = assignmentRef.current
    if (!current || status !== 'ready') return
    const serialized = JSON.stringify(answer)
    if (serialized === lastSavedDraftRef.current) return
    const timer = window.setTimeout(() => {
      const active = assignmentRef.current
      if (!active) return
      void saveAnnotationDraft(
        { ...active, draft_revision: draftRevisionRef.current },
        answer,
      ).then((saved) => {
        draftRevisionRef.current = saved.draft_revision
        lastSavedDraftRef.current = serialized
        setAssignment((value) => value ? {
          ...value,
          draft_revision: saved.draft_revision,
          draft: answer,
        } : value)
      }).catch(() => undefined)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [answer, status])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(answer) === lastSavedDraftRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [answer])

  function setField(key: string, value: unknown) {
    setAnswer((current) => ({ ...current, [key]: value }))
  }

  function toggleTag(tag: string) {
    setAnswer((current) => {
      const tags = new Set(Array.isArray(current.tags) ? current.tags as string[] : [])
      if (tags.has(tag)) tags.delete(tag)
      else tags.add(tag)
      return { ...current, tags: [...tags] }
    })
  }

  function isComplete() {
    if (!assignment) return false
    if (assignment.task_kind === 'source_identity') {
      return SOURCE_QUESTIONS.every(([key]) => typeof answer[key] === 'string')
    }
    if (assignment.task_kind === 'pairwise_preference') return typeof answer.choice === 'string'
    if (assignment.task_kind === 'notation_review') return typeof answer.verdict === 'string'
    return typeof answer.status === 'string'
  }

  async function saveDraft() {
    if (!assignment) return
    setStatus('saving')
    try {
      const saved = await saveAnnotationDraft(assignment, answer)
      draftRevisionRef.current = saved.draft_revision
      lastSavedDraftRef.current = JSON.stringify(answer)
      setAssignment({ ...assignment, draft_revision: saved.draft_revision, draft: answer })
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить черновик')
      setStatus('ready')
    }
  }

  async function openEditor() {
    if (!assignment) return
    setError('')
    try {
      const editor = await openAnnotationEditor(assignment)
      setEditorUrl(editor.url)
      window.location.assign(editor.url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть редактор')
    }
  }

  async function submit(filesBroken = false) {
    if (!assignment || status === 'saving') return
    let payload = answer
    if (filesBroken) {
      payload = assignment.task_kind === 'source_identity'
        ? Object.fromEntries([
            ...SOURCE_QUESTIONS.map(([key]) => [key, 'files_broken']),
            ['tags', []], ['comment', answer.comment ?? ''],
          ])
        : assignment.task_kind === 'pairwise_preference'
          ? { choice: 'files_broken', tags: [], comment: answer.comment ?? '' }
          : assignment.task_kind === 'notation_review'
            ? { verdict: 'files_broken', tags: [], comment: answer.comment ?? '' }
            : { status: 'files_broken', tags: [], comment: answer.comment ?? '' }
    } else if (!isComplete()) {
      setError('Ответьте на обязательный вопрос или отметьте, что файлы сломаны.')
      return
    }
    setStatus('saving')
    setError('')
    try {
      await submitAnnotationAssignment(
        assignment,
        payload,
        Math.max(0, Math.round(performance.now() - startedAt.current)),
      )
      activeAudio.current?.pause()
      const firstId = await loadCampaigns()
      await loadNext(campaignId || firstId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить ответ')
      setStatus('ready')
    }
  }

  async function uploadEdit(file: File) {
    if (!assignment) return
    setStatus('saving')
    setError('')
    try {
      await uploadAnnotationArtifact(assignment, file)
      setUploadedName(file.name)
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить результат')
      setStatus('ready')
    }
  }

  const assets = assignment?.assets ?? {}
  const completed = activeCampaign?.completed_items ?? progress?.completed ?? 0
  const total = activeCampaign?.assigned_items ?? 0
  const percent = total > 0 ? Math.round(completed / total * 100) : 0

  return (
    <main className="annotation-shell" data-theme={colorScheme}>
      <header className="annotation-topbar">
        <a href="https://audio2midi.ru">Audio2MIDI</a>
        <span>{worker ? `Исполнитель ${worker.public_code.slice(-6)}` : 'Закрытая разметка'}</span>
      </header>
      <section className="annotation-heading">
        <p>НАЗНАЧЕННЫЕ ЗАДАНИЯ</p>
        <h1>{activeCampaign?.title ?? 'Проверка данных'}</h1>
        <div className="annotation-progress-meta">
          <span>{completed} из {total}</span>
          <span>{progress ? money(progress.accrued_minor_units, progress.currency) : '—'} начислено</span>
        </div>
        <div className="annotation-progress"><span style={{ width: `${percent}%` }} /></div>
      </section>

      {error && <div className="annotation-error" role="alert">{error}</div>}
      {status === 'loading' && <div className="annotation-state">Готовлю следующее задание…</div>}
      {status === 'complete' && (
        <div className="annotation-state"><strong>Задания закончились</strong><br />Ответы сохранены.</div>
      )}

      {assignment && status !== 'loading' && status !== 'complete' && (
        <>
          <section className="annotation-instructions">
            <strong>{assignment.instructions.title ?? 'Слушайте внимательно'}</strong>
            <p>{assignment.instructions.body ?? 'Сравнивайте только то, что слышите. Если файл неверный или не открывается, сообщите об этом.'}</p>
          </section>

          <section className="annotation-media">
            <AudioCard title="Исходная песня · ориентир" src={assets.source_audio?.url} onPlay={pauseOther} kind="source" />
            <AudioCard title="Целевое фортепиано" src={assets.target_piano_audio?.url ?? assets.target_audio?.url} onPlay={pauseOther} />
            <AudioCard title="MIDI-рендер" src={assets.midi_render_audio?.url} onPlay={pauseOther} />
            <AudioCard title="Вариант A" src={assets.left_audio?.url} onPlay={pauseOther} />
            <AudioCard title="Вариант B" src={assets.right_audio?.url} onPlay={pauseOther} />
            <PianoRoll title="MIDI: вариант A" src={assets.left_piano_roll?.url} />
            <PianoRoll title="MIDI: вариант B" src={assets.right_piano_roll?.url} />
            <PianoRoll title="Проверяемый MIDI" src={assets.piano_roll?.url} />
          </section>

          <section className="annotation-form">
            {assignment.task_kind === 'source_identity' && SOURCE_QUESTIONS.map(([key, fallback]) => (
              <Choice
                key={key}
                name={`${assignment.id}-${key}`}
                value={answer[key]}
                label={assignment.payload.question?.labels?.[key] ?? fallback}
                options={[["yes", "Да"], ["no", "Нет"], ["unsure", "Не уверен"]]}
                onChange={(value) => setField(key, value)}
              />
            ))}
            {assignment.task_kind === 'pairwise_preference' && (
              <Choice
                name={`${assignment.id}-choice`}
                value={answer.choice}
                label={assignment.payload.question?.prompt ?? 'Какой фортепианный кавер лучше соответствует песне и звучит как законченная аранжировка?'}
                options={[["left", "Вариант A"], ["right", "Вариант B"], ["tie", "Равны"], ["both_bad", "Оба плохие"]]}
                onChange={(value) => setField('choice', value)}
              />
            )}
            {assignment.task_kind === 'notation_review' && (
              <Choice
                name={`${assignment.id}-verdict`}
                value={answer.verdict}
                label="Какой итог проверки партитуры?"
                options={[["good", "Готово"], ["needs_edits", "Нужны правки"], ["unusable", "Непригодно"]]}
                onChange={(value) => setField('verdict', value)}
              />
            )}
            {assignment.task_kind === 'notation_edit' && (
              <div className="annotation-editor-box">
                <strong>Исправление выполняется с компьютера</strong>
                <p>Исходный MIDI останется неизменным. Результат будет сохранён отдельной версией.</p>
                {editorUrl
                  ? <a href={editorUrl}>Открыть в редакторе</a>
                  : <button type="button" className="secondary" onClick={() => void openEditor()}>
                      Создать копию и открыть в редакторе
                    </button>}
                <label className="annotation-upload">
                  <span>{uploadedName ? `Загружено: ${uploadedName}` : 'Загрузить MIDI или MusicXML'}</span>
                  <input
                    type="file"
                    accept=".mid,.midi,.musicxml,.xml,.mxl,audio/midi,application/xml"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadEdit(file)
                    }}
                  />
                </label>
                <Choice
                  name={`${assignment.id}-status`}
                  value={answer.status}
                  label="Статус работы"
                  options={[["draft_ready", "Черновик готов"], ["submitted", "Отправить на проверку"]]}
                  onChange={(value) => setField('status', value)}
                />
              </div>
            )}

            <fieldset className="annotation-question">
              <legend>Что не так? Можно выбрать несколько причин</legend>
              <div className="annotation-tags">
                {DEFECTS.map(([tag, label]) => (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={Array.isArray(answer.tags) && answer.tags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="annotation-comment">
              <span>Комментарий, если нужен</span>
              <textarea
                value={typeof answer.comment === 'string' ? answer.comment : ''}
                maxLength={2000}
                onChange={(event) => setField('comment', event.target.value)}
              />
            </label>
            <div className="annotation-actions">
              <button type="button" onClick={() => void submit(false)} disabled={status === 'saving'}>Сохранить ответ</button>
              <button type="button" className="secondary" onClick={() => void saveDraft()} disabled={status === 'saving'}>Сохранить черновик</button>
              <button type="button" className="broken" onClick={() => void submit(true)} disabled={status === 'saving'}>Файлы сломаны</button>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
