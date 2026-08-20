import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { ApiError } from '../api/client'
import { getAnalyticsBundle, type AnalyticsBundle } from '../api/analytics'
import { moscowDate } from '../analyticsDate'
import { PageHeading, ProductHeader, ProductLoading, StatusBadge } from './ProductFrame'

type State =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: AnalyticsBundle }

const STAGE_LABELS: Record<string, string> = {
  submitted: 'Запущено', ready: 'Готово', failed: 'Не завершилось',
  in_progress: 'В работе', consumed: 'Доставлено / открыто', downloaded: 'Скачано',
}

const QUALITY_LABELS: Record<string, string> = {
  missing_submit_events_24h: 'Нет submit-события, 24 ч',
  ready_without_prepared_at_24h: 'Готово без точного времени, 24 ч',
  jobs_without_account_24h: 'Задачи без аккаунта, 24 ч',
  unknown_payment_channel_24h: 'Платежи без канала, 24 ч',
  paid_unfulfilled_30d: 'Оплачено без доступа, 30 дней',
  payment_status_regressions: 'Расхождения статуса платежей',
  payment_attribution_mismatches: 'Расхождения канала платежей',
  active_expired: 'Истёкший активный доступ',
  renewal_without_binding: 'Автопродление без привязки',
  ready_not_delivered: 'Telegram: готово, но не доставлено',
  rollup_freshness: 'Свежесть дневного среза',
}

const SURFACE_LABELS: Record<string, string> = {
  'workspace.opened': 'Кабинет открыт',
  'project.opened': 'Проект открыт',
  'visualizer.opened': 'MIDI разобран визуализатором',
  'editor.opened': 'Редактор открыт',
  'editor.draft_saved': 'Черновик сохранён',
  'editor.version_published': 'Версия опубликована',
}

const ENGINE_OPTIONS = [
  ['picogen', 'Пиано-кавер'],
  ['piano_transcription', 'Фортепиано'],
  ['sheetsage', 'Мелодия и аккорды'],
  ['music2midi', 'Быстрый MIDI'],
  ['audio_separator', 'Разделение аудио'],
] as const

function rub(kopecks: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
  }).format(kopecks / 100)
}

function pct(value: number | null, total?: number) {
  if (value == null) return 'ещё рано'
  if (total === undefined) return `${Math.round(value * 100)}%`
  return total ? `${Math.round((value / total) * 100)}%` : '—'
}

function duration(seconds: number | null) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} с`
  return `${Math.round(seconds / 60)} мин`
}

function coverage(value: string | null) {
  if (!value) return 'покрытие ещё не началось'
  return `наблюдаем с ${new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow',
  })}`
}

export default function AnalyticsDashboard({ colorScheme }: { colorScheme?: string }) {
  const [from, setFrom] = useState(moscowDate(-6))
  const [to, setTo] = useState(moscowDate())
  const [channel, setChannel] = useState('')
  const [engine, setEngine] = useState('')
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    getAnalyticsBundle({
      from, to, channel: channel || undefined, engine: engine || undefined,
    }).then((data) => {
      if (!cancelled) setState({ kind: 'ready', data })
    }).catch((error) => {
      if (cancelled) return
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setState({ kind: 'denied' })
      } else {
        setState({ kind: 'error', message: 'Не удалось загрузить аналитику. Данные продукта не затронуты.' })
      }
    })
    return () => { cancelled = true }
  }, [channel, engine, from, to])

  const maxFlows = useMemo(
    () => state.kind === 'ready'
      ? Math.max(1, ...state.data.funnel.stages.map((stage) => stage.flows))
      : 1,
    [state],
  )

  if (state.kind === 'loading') return <ProductLoading label="Сверяем продуктовые факты…" />
  if (state.kind === 'denied') {
    return <main className="product-shell product-shell--centered" data-theme={colorScheme}><section className="analytics-message"><p className="eyebrow">Закрытый раздел</p><h1>Нет доступа к аналитике</h1><p>Войдите аккаунтом владельца или аналитика.</p><a className="secondary-action" href="/">Вернуться в кабинет</a></section></main>
  }
  if (state.kind === 'error') {
    return <main className="product-shell product-shell--centered" data-theme={colorScheme}><section className="analytics-message"><h1>Данные временно недоступны</h1><p>{state.message}</p><button className="primary-action" onClick={() => window.location.reload()}>Повторить</button></section></main>
  }

  const { data } = state
  const ready = data.funnel.stages.find((stage) => stage.stage === 'ready')
  const submitted = data.funnel.stages.find((stage) => stage.stage === 'submitted')
  const consumed = data.funnel.stages.find((stage) => stage.stage === 'consumed')
  const hasDataAlert = Object.values(data.dataQuality.statuses).includes('alert')

  return (
    <main className="product-shell" data-theme={colorScheme}>
      <div className="analytics-container">
        <ProductHeader backHref="/" backLabel="Личный кабинет" actions={<span className="analytics-role">{data.role === 'owner' ? 'Владелец' : 'Аналитик'}</span>} />
        <PageHeading eyebrow="Внутренний раздел" title="Ядро продукта" description="Один путь: запуск → готовность → доставка или открытие → скачивание → повторная обработка → оплата." />

        <form className="analytics-filters" onSubmit={(event) => event.preventDefault()}>
          <label>С <input type="date" value={from} max={to} onChange={(event) => { setState({ kind: 'loading' }); setFrom(event.target.value) }} /></label>
          <label>По <input type="date" value={to} min={from} max={moscowDate()} onChange={(event) => { setState({ kind: 'loading' }); setTo(event.target.value) }} /></label>
          <label>Канал <select value={channel} onChange={(event) => { setState({ kind: 'loading' }); setChannel(event.target.value) }}><option value="">Все</option><option value="telegram">Telegram</option><option value="web">Веб</option></select></label>
          <label>Движок <select value={engine} onChange={(event) => { setState({ kind: 'loading' }); setEngine(event.target.value) }}><option value="">Все</option>{ENGINE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </form>

        <div className="analytics-live-heading">
          <div><p className="eyebrow"><span className="analytics-live-dot" />Канонический Postgres</p><h2>Путь пользователя</h2></div>
          <p>Обработки и деньги считаются по рабочим таблицам продукта. Browser-события дополняют только открытия и feedback; backfill не смешивается с live-наблюдениями.</p>
        </div>
        <section className="analytics-kpis" aria-label="Главные продуктовые показатели">
          <div><span>Запуски</span><strong>{submitted?.flows ?? 0}</strong><small>{submitted?.accounts ?? 0} уникальных аккаунтов</small></div>
          <div><span>Готовность</span><strong>{pct(ready?.flows ?? 0, submitted?.flows ?? 0)}</strong><small>{ready?.flows ?? 0} готовых результатов</small></div>
          <div><span>Потребление</span><strong>{pct(consumed?.flows ?? 0, ready?.flows ?? 0)}</strong><small>Telegram доставлен · web открыт</small></div>
          <div><span>Выручка</span><strong>{rub(data.payments.totals.revenue_kopek)}</strong><small>{data.payments.totals.confirmed_payments} подтверждённых оплат</small></div>
        </section>

        <div className="analytics-grid">
          <section className="analytics-section">
            <header><div><p className="eyebrow">Основная воронка</p><h2>Обработки, не события</h2></div><small>flows / аккаунты</small></header>
            <ol className="funnel-list">{data.funnel.stages.map((stage) => <li key={stage.stage}><span>{STAGE_LABELS[stage.stage] ?? stage.stage}</span><i style={{ '--bar': `${Math.max(2, stage.flows / maxFlows * 100)}%` } as CSSProperties} /><strong>{stage.flows}</strong><small>{stage.accounts}</small></li>)}</ol>
            <p className="analytics-footnote">Готово + ошибка + в работе = все запуски выбранной когорты. Скачивание учитывается только по явной кнопке.</p>
          </section>

          <section className="analytics-section analytics-section--quality">
            <header><div><p className="eyebrow">Надёжность данных</p><h2>Контроль контура</h2></div><StatusBadge status={hasDataAlert ? 'failed' : 'ready'}>{hasDataAlert ? 'Нужна проверка' : 'Чисто'}</StatusBadge></header>
            <dl className="quality-list">{Object.entries(data.dataQuality.statuses).map(([key, status]) => <div key={key}><dt>{QUALITY_LABELS[key] ?? key}</dt><dd className={`quality-${status}`}>{key === 'rollup_freshness' ? status === 'ok' ? 'Свежий' : 'Устарел' : data.dataQuality.checks[key] ?? 0}</dd></div>)}</dl>
          </section>
        </div>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Срезы</p><h2>Канал и движок</h2></div><small>Latency только по точным prepared_at</small></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Канал / движок</th><th>Запуски</th><th>Ready rate</th><th>Consumption</th><th>P50</th><th>P95</th><th>Точная выборка</th></tr></thead><tbody>{data.funnel.segments.map((row) => <tr key={`${row.channel}-${row.engine}`}><td>{row.channel} · {row.engine}</td><td>{row.submitted}</td><td>{pct(row.ready_rate)}</td><td>{pct(row.consumption_rate)}</td><td>{duration(row.p50_seconds)}</td><td>{duration(row.p95_seconds)}</td><td>{row.exact_latency_sample}</td></tr>)}</tbody></table></div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Отдельные flows</p><h2>Видео и экспорт редактора</h2></div><small>Не входят в основную воронку</small></header>
          <div className="analytics-flow-strip">{data.funnel.secondary_flows.length ? data.funnel.secondary_flows.map((flow) => <div key={flow.flow_kind}><span>{flow.flow_kind === 'video' ? 'Видео' : 'Экспорт редактора'}</span><strong>{flow.ready} / {flow.submitted}</strong><small>{flow.accounts} аккаунтов · {flow.failed} ошибок</small></div>) : <p className="analytics-empty">В выбранном периоде таких задач нет.</p>}</div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Web-поверхности</p><h2>Открытия и ключевые действия</h2></div><small>Нули до начала покрытия не интерпретируются</small></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Действие</th><th>Аккаунты</th><th>События</th><th>Покрытие</th></tr></thead><tbody>{data.surfaces.surfaces.filter((row) => !row.event_name.startsWith('feedback.')).map((row) => <tr key={row.event_name}><td>{SURFACE_LABELS[row.event_name] ?? row.event_name}</td><td>{row.unique_accounts}</td><td>{row.events}</td><td>{coverage(row.coverage_started_at)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Монетизация</p><h2>Намерение → подтверждённая оплата</h2></div></header>
          <div className="analytics-monetization-line"><div><span>Создано intents</span><strong>{data.payments.totals.created_intents}</strong></div><div><span>Подтверждено</span><strong>{data.payments.totals.confirmed_payments}</strong></div><div><span>Платящие аккаунты</span><strong>{data.payments.totals.paying_accounts}</strong></div><div><span>Оплатили после free</span><strong>{data.payments.totals.accounts_paid_after_free}</strong></div></div>
          <div className="analytics-table-wrap"><table><thead><tr><th>День / канал</th><th>Intents</th><th>Оплаты</th><th>Ошибки</th><th>Выручка</th></tr></thead><tbody>{data.payments.daily.map((row) => <tr key={`${row.day}-${row.channel}`}><td>{new Date(row.day).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' })} · {row.channel}</td><td>{row.created_intents}</td><td>{row.paid}</td><td>{row.failed}</td><td>{rub(row.gross_kopek)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Retention</p><h2>Новая обработка после первого результата</h2></div><small>Незрелые окна отмечены «ещё рано»</small></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Когорта</th><th>Размер</th><th>D1</th><th>D7</th><th>R7</th><th>D30</th><th>R30</th></tr></thead><tbody>{data.retention.cohorts.map((row) => <tr key={row.cohort_date}><td>{new Date(row.cohort_date).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}</td><td>{row.cohort_size}</td><td>{pct(row.d1, row.cohort_size)}</td><td>{pct(row.d7, row.cohort_size)}</td><td>{pct(row.r7, row.cohort_size)}</td><td>{pct(row.d30, row.cohort_size)}</td><td>{pct(row.r30, row.cohort_size)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Качество результата</p><h2>Явная обратная связь</h2></div><small>Ответили: {data.surfaces.feedback.response_rate == null ? '—' : pct(data.surfaces.feedback.response_rate)}</small></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Канал / метод</th><th>Ответы</th><th>Средняя</th><th>Положительные</th><th>Негативные</th></tr></thead><tbody>{data.quality.segments.map((row) => <tr key={`${row.channel}-${row.engine}`}><td>{row.channel} · {row.engine}</td><td>{row.responses}</td><td>{row.average_rating ?? '—'}</td><td>{row.positive}</td><td>{row.negative}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  )
}
