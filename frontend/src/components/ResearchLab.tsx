import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getNextResearchComparison,
  getResearchResults,
  listResearchExperiments,
  submitResearchVote,
} from '../api/research'
import type {
  ResearchComparison,
  ResearchExperiment,
  ResearchProgress,
  ResearchResults,
  ResearchSample,
  ResearchVote,
} from '../api/research'

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
  { id: 'render_problem', label: 'проблема только в рендере' },
]

type View = 'compare' | 'results'
type LoadState = 'loading' | 'ready' | 'submitting' | 'error'

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
}: {
  sample: ResearchSample
  onPlay: (element: HTMLAudioElement) => void
}) {
  return (
    <article className="research-variant">
      <div className="research-variant__title">
        <span>Вариант</span>
        <strong>{sample.label}</strong>
      </div>
      <audio
        controls
        preload="metadata"
        src={sample.audio_url}
        onPlay={(event) => onPlay(event.currentTarget)}
      />
      {sample.piano_roll_url && (
        <details className="research-pianoroll">
          <summary>Показать piano roll</summary>
          <img src={sample.piano_roll_url} alt={`Piano roll ${sample.label}`} loading="lazy" />
        </details>
      )}
      <a className="research-download" href={sample.midi_url}>
        Скачать MIDI
      </a>
    </article>
  )
}

function ResultsView({ results }: { results: ResearchResults }) {
  const rows = Object.entries(results.conditions)
    .sort(([, left], [, right]) => right.wins - left.wins)

  return (
    <section className="research-results">
      <div className="research-results__summary">
        <div><strong>{results.vote_count}</strong><span>оценок</span></div>
        <div><strong>{results.reviewer_count}</strong><span>рецензентов</span></div>
        <div><strong>{rows.length}</strong><span>условий</span></div>
      </div>

      <div className="research-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Условие</th>
              <th>Победы</th>
              <th>Поражения</th>
              <th>Ничьи</th>
              <th>Оба плохие</th>
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
  const [comparison, setComparison] = useState<ResearchComparison | null>(null)
  const [progress, setProgress] = useState<ResearchProgress>({ completed: 0, total: 0 })
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('compare')
  const [results, setResults] = useState<ResearchResults | null>(null)
  const startedAt = useRef(0)
  const activeAudio = useRef<HTMLAudioElement | null>(null)

  const activeExperiment = useMemo(
    () => experiments.find((item) => item.id === experimentId) ?? null,
    [experimentId, experiments],
  )

  const loadNext = useCallback(async (id: string) => {
    setState('loading')
    setError('')
    try {
      const payload = await getNextResearchComparison(id)
      setComparison(payload.comparison)
      setProgress(payload.progress)
      setSelectedTags([])
      setComment('')
      startedAt.current = performance.now()
      setState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить сравнение')
      setState('error')
    }
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
        await loadNext(first.id)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть лабораторию')
        setState('error')
      }
    }
    void load()
  }, [loadNext])

  const pauseOtherPlayers = useCallback((element: HTMLAudioElement) => {
    if (activeAudio.current && activeAudio.current !== element) {
      activeAudio.current.pause()
    }
    activeAudio.current = element
  }, [])

  const vote = useCallback(async (choice: ResearchVote['choice']) => {
    if (!comparison || state === 'submitting') return
    setState('submitting')
    setError('')
    try {
      await submitResearchVote({
        experiment_id: comparison.experiment_id,
        session_id: sessionId(),
        left_sample_id: comparison.left.id,
        right_sample_id: comparison.right.id,
        choice,
        tags: selectedTags,
        ratings: {},
        comment,
        response_ms: Math.max(0, Math.round(performance.now() - startedAt.current)),
      })
      activeAudio.current?.pause()
      await loadNext(comparison.experiment_id)
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : 'Не удалось сохранить оценку')
      setState('ready')
    }
  }, [comment, comparison, loadNext, selectedTags, state])

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

  async function showCompare() {
    setView('compare')
    if (experimentId) await loadNext(experimentId)
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    ))
  }

  const percent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0

  return (
    <main className="research-shell">
      <div className="research-container">
        <header className="research-header">
          <a href="https://audio2midi.ru" className="research-brand">Audio2MIDI</a>
          <div className="research-header__actions">
            <button
              className={view === 'compare' ? 'is-active' : ''}
              onClick={() => void showCompare()}
            >
              Blind A/B
            </button>
            <button
              className={view === 'results' ? 'is-active' : ''}
              onClick={() => void showResults()}
            >
              Результаты
            </button>
          </div>
        </header>

        <section className="research-intro">
          <p>INTERNAL LISTENING LAB</p>
          <h1>Слушаем модель,<br />а не её название.</h1>
          <div className="research-intro__meta">
            <span>{activeExperiment?.title ?? 'Загрузка эксперимента'}</span>
            <span>{progress.completed} / {progress.total} сравнений</span>
          </div>
          <div className="research-progress">
            <span style={{ width: `${percent}%` }} />
          </div>
        </section>

        {error && <div className="research-error">{error}</div>}

        {view === 'results' && results && <ResultsView results={results} />}

        {view === 'compare' && state === 'loading' && (
          <div className="research-loading">Готовлю следующую слепую пару…</div>
        )}

        {view === 'compare' && state !== 'loading' && !comparison && !error && (
          <section className="research-complete">
            <span>✓</span>
            <h2>Все пары этого эксперимента оценены</h2>
            <p>Теперь можно открыть результаты и посмотреть победы, ничьи и частые артефакты.</p>
            <button onClick={() => void showResults()}>Открыть результаты</button>
          </section>
        )}

        {view === 'compare' && comparison && (
          <>
            <section className="research-source">
              <div>
                <p>ОРИГИНАЛ</p>
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

            <section className="research-variants">
              <ResearchPlayer sample={comparison.left} onPlay={pauseOtherPlayers} />
              <ResearchPlayer sample={comparison.right} onPlay={pauseOtherPlayers} />
            </section>

            <section className="research-review">
              <div className="research-question">
                <p>ОБЩЕЕ ПРЕДПОЧТЕНИЕ</p>
                <h2>Какой вариант лучше работает как фортепианный кавер?</h2>
              </div>
              <div className="research-votes">
                <button onClick={() => void vote('left')} disabled={state === 'submitting'}>
                  <kbd>A</kbd> Вариант A
                </button>
                <button onClick={() => void vote('tie')} disabled={state === 'submitting'}>
                  <kbd>T</kbd> Примерно равны
                </button>
                <button onClick={() => void vote('right')} disabled={state === 'submitting'}>
                  <kbd>B</kbd> Вариант B
                </button>
                <button
                  className="research-vote--bad"
                  onClick={() => void vote('both_bad')}
                  disabled={state === 'submitting'}
                >
                  <kbd>X</kbd> Оба плохие
                </button>
              </div>

              <details className="research-details">
                <summary>Что именно не так?</summary>
                <div className="research-tags">
                  {TAGS.map((tag) => (
                    <button
                      className={selectedTags.includes(tag.id) ? 'is-selected' : ''}
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
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
    </main>
  )
}
