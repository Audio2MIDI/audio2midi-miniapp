import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getNextResearchComparison,
  getResearchResults,
  listResearchExperiments,
  listResearchTracks,
  researchExperimentCardCount,
  researchExperimentKind,
  submitResearchVote,
} from '../api/research'
import type {
  ResearchComparison,
  ResearchExperiment,
  ResearchProgress,
  ResearchResults,
  ResearchSample,
  ResearchTrack,
  ResearchVote,
} from '../api/research'
import { isSourceIdentityQuestion, withWrongSongTag } from './researchVote'

const TAGS: Array<{ id: string; label: string }> = [
  { id: 'loop', label: 'зацикливание' },
  { id: 'chord_pounding', label: 'долбёжка аккордами' },
  { id: 'rapid_notes', label: 'дребезг / частые ноты' },
  { id: 'wrong_tempo', label: 'неверный темп' },
  { id: 'melody_lost', label: 'потеряна мелодия' },
  { id: 'harmony_drift', label: 'уехала гармония' },
  { id: 'bass_missing', label: 'нет баса' },
  { id: 'too_dense', label: 'слишком плотно' },
  { id: 'too_sparse', label: 'слишком пусто' },
  { id: 'flat_dynamics', label: 'плоская динамика' },
  { id: 'unplayable', label: 'неиграбельно' },
  { id: 'no_breathing', label: 'нет музыкального дыхания' },
  { id: 'broken_structure', label: 'сломана структура' },
  { id: 'mismatched_song', label: 'это другая песня' },
  { id: 'render_problem', label: 'проблема только в рендере' },
  { id: 'wrong_rhythm', label: 'неверный ритм' },
  { id: 'wrong_bars', label: 'неправильные такты' },
  { id: 'bad_durations', label: 'плохие длительности' },
  { id: 'extra_rests', label: 'лишние паузы' },
  { id: 'bad_hand_split', label: 'плохое разделение рук' },
  { id: 'unreadable_polyphony', label: 'нечитаемая полифония' },
  { id: 'wrong_key_signature', label: 'неверные знаки' },
  { id: 'cropped_notation', label: 'обрезана партитура' },
  { id: 'bad_layout', label: 'плохая вёрстка' },
]

const RATINGS: Array<{ id: string; label: string }> = [
  { id: 'similarity', label: 'Сходство с оригиналом' },
  { id: 'readability', label: 'Читаемость нот' },
  { id: 'playability', label: 'Играбельность' },
  { id: 'layout_quality', label: 'Качество вёрстки' },
]

type View = 'compare' | 'results'
type ResearchMode = 'legacy' | 'calibration'
type CalibrationBlock = 'model' | 'corruption' | 'difficulty'
type LoadState = 'loading' | 'ready' | 'submitting' | 'error'
type VariantSide = 'left' | 'right'
type VariantRatings = Record<VariantSide, Record<string, number>>

function emptyRatings(): VariantRatings {
  return { left: {}, right: {} }
}

function sessionId(): string {
  const storageKey = 'audio2midi-research-session'
  const existing = window.localStorage.getItem(storageKey)
  if (existing) return existing
  const created = window.crypto.randomUUID()
  window.localStorage.setItem(storageKey, created)
  return created
}

function ResearchPlayer({
  sample,
  onPlay,
  onOpenPianoRoll,
  onOpenPdf,
  title,
  hideDownloads = false,
}: {
  sample: ResearchSample
  onPlay: (element: HTMLAudioElement) => void
  onOpenPianoRoll: (sample: ResearchSample) => void
  onOpenPdf: (sample: ResearchSample) => void
  title?: string
  hideDownloads?: boolean
}) {
  return (
    <article className="research-variant">
      <div className="research-variant__title">
        {title ? <strong>{title}</strong> : <><span>Вариант</span><strong>{sample.label}</strong></>}
      </div>
      <audio
        controls
        preload="metadata"
        src={sample.audio_url}
        onPlay={(event) => onPlay(event.currentTarget)}
      />
      {sample.piano_roll_url && (
        <div className="research-pianoroll">
          <div className="research-pianoroll__header">
            <span>Piano roll</span>
            <button type="button" onClick={() => onOpenPianoRoll(sample)}>
              Увеличить ↗
            </button>
          </div>
          <button
            className="research-pianoroll__preview"
            type="button"
            onClick={() => onOpenPianoRoll(sample)}
            aria-label={`Увеличить piano roll варианта ${sample.label}`}
          >
            <img src={sample.piano_roll_url} alt={`Piano roll ${sample.label}`} />
          </button>
        </div>
      )}
      {!hideDownloads && (
        <div className="research-downloads">
          <a className="research-download" href={sample.midi_url}>MIDI</a>
          {sample.musicxml_url && (
            <a className="research-download" href={sample.musicxml_url}>MusicXML</a>
          )}
          {sample.pdf_url && (
            <button type="button" onClick={() => onOpenPdf(sample)}>
              Открыть PDF ↗
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function ResultsView({ results }: { results: ResearchResults }) {
  const rows = Object.entries(results.conditions)
    .sort(([, left], [, right]) => right.wins - left.wins)
  const errorsByTrack = results.calibration?.errors_by_track ?? {}
  const errorsByPathology = results.calibration?.errors_by_pathology ?? {}

  return (
    <section className="research-results">
      <div className="research-results__summary">
        <div><strong>{results.vote_count}</strong><span>оценок</span></div>
        <div><strong>{results.reviewer_count}</strong><span>рецензентов</span></div>
        <div><strong>{rows.length}</strong><span>условий</span></div>
      </div>

      {results.calibration && results.calibration.card_vote_count > 0 && (
        <div className="research-tag-summary">
          <p>Калибровка метрик</p>
          <div>
            <span>Карточек · {results.calibration.card_vote_count}</span>
            <span>
              Повторы · {results.calibration.repeat_consistency === null
                ? 'недостаточно данных'
                : `${Math.round(results.calibration.repeat_consistency * 100)}%`}
            </span>
            <span>
              Искажения · {results.calibration.controlled_corruption_accuracy === null
                ? 'недостаточно данных'
                : `${Math.round(results.calibration.controlled_corruption_accuracy * 100)}%`}
            </span>
          </div>
          {Object.keys(results.calibration.metric_agreement).length > 0 && (
            <div className="research-table-wrap">
              <table>
                <thead>
                  <tr><th>Метрика</th><th>Пар</th><th>Совпадение с выбором</th></tr>
                </thead>
                <tbody>
                  {Object.entries(results.calibration.metric_agreement).map(([name, value]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{value.comparisons}</td>
                      <td>{Math.round(value.accuracy * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(Object.keys(errorsByTrack).length > 0
            || Object.keys(errorsByPathology).length > 0) && (
            <div className="research-table-wrap">
              <table>
                <thead>
                  <tr><th>Срез ошибок</th><th>Ошибок</th><th>Проверок</th></tr>
                </thead>
                <tbody>
                  {Object.entries(errorsByPathology)
                    .map(([name, value]) => (
                      <tr key={`pathology-${name}`}>
                        <td>{TAGS.find((item) => item.id === name)?.label ?? name}</td>
                        <td>{value.errors}</td>
                        <td>{value.comparisons}</td>
                      </tr>
                    ))}
                  {Object.entries(errorsByTrack).map(([name, value]) => (
                    <tr key={`track-${name}`}>
                      <td>Композиция · {name}</td>
                      <td>{value.errors}</td>
                      <td>{value.comparisons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="research-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Условие</th>
              <th>Победы</th>
              <th>Поражения</th>
              <th>Ничьи</th>
              <th>Оба плохие</th>
              <th>Читаемость</th>
              <th>Вёрстка</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([condition, value]) => (
              <tr key={condition}>
                <td>{condition.replaceAll('_', ' ')}</td>
                <td>{value.wins}</td>
                <td>{value.losses}</td>
                <td>{value.ties}</td>
                <td>{value.both_bad}</td>
                <td>{value.ratings?.readability?.toFixed(2) ?? '—'}</td>
                <td>{value.ratings?.layout_quality?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(results.tags).length > 0 && (
        <div className="research-tag-summary">
          <p>Частые артефакты</p>
          <div>
            {Object.entries(results.tags).map(([tag, count]) => (
              <span key={tag}>{TAGS.find((item) => item.id === tag)?.label ?? tag} · {count}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default function ResearchLab() {
  const [experiments, setExperiments] = useState<ResearchExperiment[]>([])
  const [experimentId, setExperimentId] = useState('')
  const [tracks, setTracks] = useState<ResearchTrack[]>([])
  const [trackId, setTrackId] = useState('')
  const [comparison, setComparison] = useState<ResearchComparison | null>(null)
  const [progress, setProgress] = useState<ResearchProgress>({ completed: 0, total: 0 })
  const [experimentProgress, setExperimentProgress] = useState<ResearchProgress>({
    completed: 0,
    total: 0,
  })
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [ratings, setRatings] = useState<VariantRatings>(emptyRatings)
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('compare')
  const [mode, setMode] = useState<ResearchMode>('legacy')
  const [calibrationBlock, setCalibrationBlock] = useState<CalibrationBlock>('model')
  const [results, setResults] = useState<ResearchResults | null>(null)
  const [expandedPianoRoll, setExpandedPianoRoll] = useState<ResearchSample | null>(null)
  const [expandedPdf, setExpandedPdf] = useState<ResearchSample | null>(null)
  const [voteSaved, setVoteSaved] = useState(false)
  const startedAt = useRef(0)
  const activeAudio = useRef<HTMLAudioElement | null>(null)

  const activeExperiment = useMemo(
    () => experiments.find((item) => item.id === experimentId) ?? null,
    [experimentId, experiments],
  )
  const activeTrackIndex = useMemo(
    () => tracks.findIndex((item) => item.id === trackId),
    [trackId, tracks],
  )
  const calibrationOnly = activeExperiment
    ? researchExperimentCardCount(activeExperiment) > 0
    : false
  const sourceIdentityAudit = isSourceIdentityQuestion(comparison?.question?.kind)
    || (activeExperiment
      ? researchExperimentKind(activeExperiment) === 'source_identity_audit'
      : false)

  const loadNext = useCallback(async (
    id: string,
    selectedTrackId: string,
    selectedMode: ResearchMode,
    selectedBlock: CalibrationBlock,
  ) => {
    setState('loading')
    setError('')
    try {
      const payload = await getNextResearchComparison(
        id,
        selectedMode === 'legacy' ? selectedTrackId : undefined,
        selectedMode,
        selectedMode === 'calibration' ? selectedBlock : undefined,
      )
      setComparison(payload.comparison)
      setProgress(payload.progress)
      setExperimentProgress(payload.experiment_progress)
      setSelectedTags([])
      setComment('')
      setRatings(emptyRatings())
      startedAt.current = performance.now()
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить сравнение')
      setState('error')
    }
  }, [])

  const refreshTracks = useCallback(async (id: string) => {
    const items = await listResearchTracks(id)
    setTracks(items)
    return items
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const items = await listResearchExperiments()
        setExperiments(items)
        const first = items[0]
        if (!first) {
          setError('Активных экспериментов пока нет')
          setState('error')
          return
        }
        setExperimentId(first.id)
        const firstMode: ResearchMode = researchExperimentCardCount(first) > 0
          ? 'calibration'
          : 'legacy'
        setMode(firstMode)
        const trackItems = await refreshTracks(first.id)
        const firstTrack = trackItems.find((item) => item.completed < item.total)
          ?? trackItems[0]
        if (!firstTrack) {
          setError('В эксперименте пока нет композиций')
          setState('error')
          return
        }
        setTrackId(firstTrack.id)
        await loadNext(first.id, firstTrack.id, firstMode, 'model')
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть лабораторию')
        setState('error')
      }
    }
    void load()
  }, [loadNext, refreshTracks])

  const pauseOtherPlayers = useCallback((element: HTMLAudioElement) => {
    if (activeAudio.current && activeAudio.current !== element) {
      activeAudio.current.pause()
    }
    activeAudio.current = element
  }, [])

  const vote = useCallback(async (
    choice: ResearchVote['choice'],
    tagOverride?: string[],
  ) => {
    if (!comparison || state === 'submitting') return
    setState('submitting')
    setError('')
    setVoteSaved(false)
    try {
      await submitResearchVote({
        experiment_id: comparison.experiment_id,
        session_id: sessionId(),
        card_id: comparison.card_id,
        left_sample_id: comparison.left.id,
        right_sample_id: comparison.right.id,
        choice,
        tags: tagOverride ?? selectedTags,
        ratings,
        comment,
        response_ms: Math.max(0, Math.round(performance.now() - startedAt.current)),
      })
      setVoteSaved(true)
      activeAudio.current?.pause()
      if (mode === 'legacy') await refreshTracks(comparison.experiment_id)
      await loadNext(
        comparison.experiment_id,
        comparison.track.id,
        mode,
        calibrationBlock,
      )
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : 'Не удалось сохранить оценку')
      setState('ready')
    }
  }, [
    calibrationBlock,
    comment,
    comparison,
    loadNext,
    mode,
    ratings,
    refreshTracks,
    selectedTags,
    state,
  ])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        view !== 'compare'
        || !comparison
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
      ) return
      const actions: Record<string, ResearchVote['choice']> = {
        a: 'left',
        b: 'right',
        t: 'tie',
        x: 'both_bad',
      }
      const action = actions[event.key.toLowerCase()]
      if (action) void vote(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [comparison, view, vote])

  useEffect(() => {
    if (!expandedPianoRoll && !expandedPdf) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExpandedPianoRoll(null)
        setExpandedPdf(null)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [expandedPdf, expandedPianoRoll])

  async function selectTrack(nextTrackId: string) {
    if (!experimentId || nextTrackId === trackId) return
    activeAudio.current?.pause()
    setTrackId(nextTrackId)
    setView('compare')
    await loadNext(experimentId, nextTrackId, mode, calibrationBlock)
  }

  async function selectExperiment(nextExperimentId: string) {
    if (!nextExperimentId || nextExperimentId === experimentId) return
    const nextExperiment = experiments.find((item) => item.id === nextExperimentId)
    if (!nextExperiment) return
    activeAudio.current?.pause()
    setExperimentId(nextExperimentId)
    setView('compare')
    const nextMode: ResearchMode = researchExperimentCardCount(nextExperiment) > 0
      ? 'calibration'
      : 'legacy'
    setMode(nextMode)
    setCalibrationBlock('model')
    const trackItems = await refreshTracks(nextExperimentId)
    const firstTrack = trackItems.find((item) => item.completed < item.total)
      ?? trackItems[0]
    if (!firstTrack) {
      setComparison(null)
      setError('В эксперименте пока нет композиций')
      setState('error')
      return
    }
    setTrackId(firstTrack.id)
    await loadNext(nextExperimentId, firstTrack.id, nextMode, 'model')
  }

  async function moveTrack(offset: number) {
    const nextTrack = tracks[activeTrackIndex + offset]
    if (nextTrack) await selectTrack(nextTrack.id)
  }

  async function showResults() {
    if (!experimentId) return
    setState('loading')
    setError('')
    try {
      setResults(await getResearchResults(experimentId))
      setView('results')
      setState('ready')
    } catch (resultsError) {
      setError(resultsError instanceof Error ? resultsError.message : 'Не удалось загрузить результаты')
      setState('error')
    }
  }

  async function switchMode(nextMode: ResearchMode) {
    if (!experimentId || nextMode === mode) return
    if (calibrationOnly && nextMode === 'legacy') return
    activeAudio.current?.pause()
    setMode(nextMode)
    setView('compare')
    await loadNext(experimentId, trackId, nextMode, calibrationBlock)
  }

  async function switchCalibrationBlock(nextBlock: CalibrationBlock) {
    if (!experimentId || nextBlock === calibrationBlock) return
    activeAudio.current?.pause()
    setCalibrationBlock(nextBlock)
    await loadNext(experimentId, trackId, 'calibration', nextBlock)
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    ))
  }

  const percent = experimentProgress.total > 0
    ? Math.round((experimentProgress.completed / experimentProgress.total) * 100)
    : 0

  return (
    <main className="research-shell">
      <div className="research-container">
        <header className="research-header">
          <a href="https://audio2midi.ru" className="research-brand">Audio2MIDI</a>
          <div className="research-header__actions">
            {!calibrationOnly && (
              <button
                className={view === 'compare' && mode === 'legacy' ? 'is-active' : ''}
                onClick={() => void switchMode('legacy')}
              >
                Blind A/B
              </button>
            )}
            <button
              className={view === 'compare' && mode === 'calibration' ? 'is-active' : ''}
              onClick={() => void switchMode('calibration')}
            >
              {sourceIdentityAudit ? 'Проверка исходников' : 'Калибровка метрик'}
            </button>
            {!sourceIdentityAudit && (
              <button
                className={view === 'results' ? 'is-active' : ''}
                onClick={() => void showResults()}
              >
                Результаты
              </button>
            )}
          </div>
        </header>

        <section className="research-intro">
          <p>INTERNAL LISTENING LAB</p>
          <h1>
            {sourceIdentityAudit
              ? <>Проверяем данные,<br />а не модель.</>
              : <>Слушаем модель,<br />а не её название.</>}
          </h1>
          <div className="research-intro__meta">
            <span>{activeExperiment?.title ?? 'Загрузка эксперимента'}</span>
            <span>
              {experimentProgress.completed} / {experimentProgress.total} сравнений
            </span>
          </div>
          <div className="research-progress">
            <span style={{ width: `${percent}%` }} />
          </div>
        </section>

        {error && <div className="research-error">{error}</div>}

        {view === 'results' && results && <ResultsView results={results} />}

        {view === 'compare' && experiments.length > 1 && (
          <section className="research-track-nav">
            <div className="research-track-picker">
              <label htmlFor="research-experiment">Набор сравнений</label>
              <select
                id="research-experiment"
                value={experimentId}
                onChange={(event) => void selectExperiment(event.target.value)}
                disabled={state === 'submitting'}
              >
                {experiments.map((experiment) => (
                  <option value={experiment.id} key={experiment.id}>
                    {experiment.title}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {view === 'compare' && mode === 'calibration' && !sourceIdentityAudit && (
          <section className="research-track-nav">
            <div className="research-track-picker">
              <label htmlFor="research-block">Блок карточек</label>
              <select
                id="research-block"
                value={calibrationBlock}
                onChange={(event) => void switchCalibrationBlock(
                  event.target.value as CalibrationBlock,
                )}
                disabled={state === 'submitting'}
              >
                <option value="model">Реальные пары моделей</option>
                <option value="corruption">Контролируемые искажения</option>
                <option value="difficulty">Сложность и сохранение материала</option>
              </select>
            </div>
          </section>
        )}

        {view === 'compare' && mode === 'legacy' && tracks.length > 0 && (
          <section className="research-track-nav">
            <div className="research-track-picker">
              <label htmlFor="research-track">Композиция</label>
              <select
                id="research-track"
                value={trackId}
                onChange={(event) => void selectTrack(event.target.value)}
                disabled={state === 'submitting'}
              >
                {tracks.map((track, index) => (
                  <option value={track.id} key={track.id}>
                    {index + 1}. {track.title} · {track.completed}/{track.total}
                  </option>
                ))}
              </select>
            </div>
            <div className="research-track-nav__status">
              <span>
                {progress.total > 0
                  ? `${progress.completed} из ${progress.total} пар оценено`
                  : 'Загрузка прогресса'}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => void moveTrack(-1)}
                  disabled={activeTrackIndex <= 0 || state === 'submitting'}
                  aria-label="Предыдущая композиция"
                >
                  ← Предыдущая
                </button>
                <button
                  type="button"
                  onClick={() => void moveTrack(1)}
                  disabled={
                    activeTrackIndex < 0
                    || activeTrackIndex >= tracks.length - 1
                    || state === 'submitting'
                  }
                >
                  Следующая композиция →
                </button>
              </div>
            </div>
          </section>
        )}

        {view === 'compare' && state === 'loading' && (
          <div className="research-loading">Готовлю следующую слепую пару…</div>
        )}

        {view === 'compare' && state !== 'loading' && !comparison && !error && (
          <section className="research-complete">
            <span>✓</span>
            <h2>
              {mode === 'calibration'
                ? 'Этот блок калибровки полностью оценён'
                : 'Эта композиция полностью оценена'}
            </h2>
            <p>
              {mode === 'calibration'
                ? 'Можно выбрать другой блок выше или открыть общие результаты эксперимента.'
                : 'Можно перейти к следующей композиции или открыть общие результаты эксперимента.'}
            </p>
            <div className="research-complete__actions">
              {mode === 'legacy'
                && activeTrackIndex >= 0
                && activeTrackIndex < tracks.length - 1 && (
                <button onClick={() => void moveTrack(1)}>Следующая композиция →</button>
              )}
              <button onClick={() => void showResults()}>Открыть результаты</button>
            </div>
          </section>
        )}

        {view === 'compare' && comparison && (
          <>
            <section className="research-source">
              <div>
                <p>{sourceIdentityAudit ? 'ПРЕДПОЛАГАЕМЫЙ ОРИГИНАЛ' : 'ОРИГИНАЛ'}</p>
                <h2>{comparison.track.title}</h2>
                <span>{comparison.track.artist}</span>
              </div>
              <audio
                controls
                preload="metadata"
                src={comparison.track.source_audio_url}
                onPlay={(event) => pauseOtherPlayers(event.currentTarget)}
              />
            </section>

            <section className={`research-variants${sourceIdentityAudit ? ' research-variants--single' : ''}`}>
              <ResearchPlayer
                sample={comparison.left}
                onPlay={pauseOtherPlayers}
                onOpenPianoRoll={setExpandedPianoRoll}
                onOpenPdf={setExpandedPdf}
                title={sourceIdentityAudit ? 'Человеческая фортепианная версия' : undefined}
                hideDownloads={sourceIdentityAudit}
              />
              {!sourceIdentityAudit && (
                <ResearchPlayer
                  sample={comparison.right}
                  onPlay={pauseOtherPlayers}
                  onOpenPianoRoll={setExpandedPianoRoll}
                  onOpenPdf={setExpandedPdf}
                />
              )}
            </section>

            <section className="research-review">
              <div className="research-question">
                <p>
                  {sourceIdentityAudit
                    ? 'ПРОВЕРКА ПАРЫ'
                    : mode === 'calibration' ? 'КАЛИБРОВКА МЕТРИК' : 'ОБЩЕЕ ПРЕДПОЧТЕНИЕ'}
                </p>
                <h2>
                  {comparison.question?.prompt
                    ?? (sourceIdentityAudit
                      ? 'Это фортепианная версия той же композиции, что и оригинал выше?'
                      : 'Какой вариант лучше работает как фортепианный кавер?')}
                </h2>
              </div>
              <div className="research-votes">
                <button onClick={() => void vote('left')} disabled={state === 'submitting'}>
                  <kbd>A</kbd> {comparison.question?.labels?.left
                    ?? (sourceIdentityAudit ? 'Да, это одна песня' : 'Вариант A')}
                </button>
                <button onClick={() => void vote('tie')} disabled={state === 'submitting'}>
                  <kbd>T</kbd> {comparison.question?.labels?.tie
                    ?? (sourceIdentityAudit ? 'Не уверен' : 'Примерно равны')}
                </button>
                <button onClick={() => void vote('right')} disabled={state === 'submitting'}>
                  <kbd>B</kbd> {comparison.question?.labels?.right
                    ?? (sourceIdentityAudit ? 'Нет, это другая песня' : 'Вариант B')}
                </button>
                <button
                  className="research-vote--bad"
                  onClick={() => void vote('both_bad')}
                  disabled={state === 'submitting'}
                >
                  <kbd>X</kbd> {comparison.question?.labels?.both_bad
                    ?? (sourceIdentityAudit ? 'Файлы сломаны' : 'Оба плохие')}
                </button>
              </div>

              {voteSaved && (
                <p className="research-vote-saved" role="status">
                  ✓ Последняя оценка сохранена
                </p>
              )}

              {!sourceIdentityAudit && (
                <button
                  type="button"
                  className="research-wrong-song"
                  onClick={() => void vote(
                    'both_bad',
                    withWrongSongTag(selectedTags),
                  )}
                  disabled={state === 'submitting'}
                >
                  ⚠ Это другая песня — сохранить и дальше
                </button>
              )}

              <details className="research-details">
                <summary>Что именно не так?</summary>
                {!sourceIdentityAudit && <div className="research-ratings">
                  {(['left', 'right'] as const).map((side) => (
                    <fieldset key={side}>
                      <legend>Вариант {side === 'left' ? 'A' : 'B'}</legend>
                      {RATINGS.map((rating) => (
                        <label key={rating.id}>
                          <span>{rating.label}</span>
                          <select
                            value={ratings[side][rating.id] ?? ''}
                            onChange={(event) => {
                              const value = Number(event.target.value)
                              setRatings((current) => {
                                const nextSide = { ...current[side] }
                                if (value) nextSide[rating.id] = value
                                else delete nextSide[rating.id]
                                return { ...current, [side]: nextSide }
                              })
                            }}
                          >
                            <option value="">Не оценено</option>
                            {[1, 2, 3, 4, 5].map((value) => (
                              <option value={value} key={value}>{value} / 5</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>}
                {!sourceIdentityAudit && <div className="research-tags">
                  {TAGS.map((tag) => (
                    <button
                      className={selectedTags.includes(tag.id) ? 'is-selected' : ''}
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>}
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Необязательный комментарий"
                />
              </details>
            </section>
          </>
        )}
      </div>
      {expandedPianoRoll?.piano_roll_url && (
        <div
          className="research-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Piano roll варианта ${expandedPianoRoll.label}`}
          onClick={() => setExpandedPianoRoll(null)}
        >
          <div
            className="research-lightbox__content"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <span>Piano roll · вариант {expandedPianoRoll.label}</span>
              <button
                type="button"
                onClick={() => setExpandedPianoRoll(null)}
                aria-label="Закрыть piano roll"
              >
                Закрыть ×
              </button>
            </div>
            <img
              src={expandedPianoRoll.piano_roll_url}
              alt={`Piano roll варианта ${expandedPianoRoll.label}`}
            />
          </div>
        </div>
      )}
      {expandedPdf?.pdf_url && (
        <div
          className="research-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`PDF варианта ${expandedPdf.label}`}
          onClick={() => setExpandedPdf(null)}
        >
          <div
            className="research-lightbox__content research-lightbox__content--pdf"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <span>Партитура · вариант {expandedPdf.label}</span>
              <button type="button" onClick={() => setExpandedPdf(null)}>
                Закрыть ×
              </button>
            </div>
            <iframe
              src={`${expandedPdf.pdf_url}#view=FitH`}
              title={`Партитура варианта ${expandedPdf.label}`}
            />
          </div>
        </div>
      )}
    </main>
  )
}
