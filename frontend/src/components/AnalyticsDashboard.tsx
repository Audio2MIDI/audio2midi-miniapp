import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { ApiError } from '../api/client'
import { getAnalyticsBundle, updateOutreachStatus, type AnalyticsBundle } from '../api/analytics'
import { moscowDate } from '../analyticsDate'
import { PageHeading, ProductHeader, ProductLoading, StatusBadge } from './ProductFrame'

type State = { kind: 'loading' } | { kind: 'denied' } | { kind: 'error'; message: string } | { kind: 'ready'; data: AnalyticsBundle }

const LABELS: Record<string, string> = {
  registered: 'Новые аккаунты', processing_submitted: 'Отправили обработку', result_available: 'Получили результат',
  paywall_shown: 'Увидели оплату', checkout_started: 'Начали оплату', payment_succeeded: 'Оплатили', access_granted: 'Получили доступ',
  unknown_payment_channel_24h: 'Платежи без канала, 24 ч', paid_unfulfilled_30d: 'Оплачено без выдачи доступа', active_expired: 'Активная, но истёкшая подписка',
  renewal_without_binding: 'Автопродление без привязки', jobs_without_account_24h: 'Задачи без аккаунта, 24 ч', ready_not_delivered: 'Готово, но не доставлено', rollup_freshness: 'Свежесть агрегатов',
  payment_status_regressions: 'Оплаты с ослабленным текущим статусом',
  'workspace.opened': 'Открыли кабинет', 'project.opened': 'Открыли композицию', 'visualizer.opened': 'Открыли визуализатор',
  'editor.opened': 'Открыли редактор', 'editor.draft_saved': 'Сохранили черновик', 'editor.version_published': 'Опубликовали версию',
}

function rub(kopecks: number) { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100) }
function pct(value: number, total: number) { return total ? `${Math.round((value / total) * 100)}%` : '—' }

export default function AnalyticsDashboard({ colorScheme }: { colorScheme?: string }) {
  const [from, setFrom] = useState(moscowDate(-6))
  const [to, setTo] = useState(moscowDate())
  const [channel, setChannel] = useState('')
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    getAnalyticsBundle({ from, to, channel: channel || undefined }).then((data) => {
      if (!cancelled) setState({ kind: 'ready', data })
    }).catch((error) => {
      if (cancelled) return
      if (error instanceof ApiError && [401, 403].includes(error.status)) setState({ kind: 'denied' })
      else setState({ kind: 'error', message: 'Не удалось загрузить аналитику. Данные продукта не затронуты.' })
    })
    return () => { cancelled = true }
  }, [from, to, channel])

  const maxRevenue = useMemo(() => state.kind === 'ready' ? Math.max(1, ...state.data.payments.daily.map((row) => row.gross_kopek)) : 1, [state])
  if (state.kind === 'loading') return <ProductLoading label="Собираем показатели…" />
  if (state.kind === 'denied') return <main className="product-shell product-shell--centered" data-theme={colorScheme}><section className="analytics-message"><p className="eyebrow">Закрытый раздел</p><h1>Нет доступа к аналитике</h1><p>Войдите аккаунтом, которому выдана роль владельца или аналитика.</p><a className="secondary-action" href="/">Вернуться в кабинет</a></section></main>
  if (state.kind === 'error') return <main className="product-shell product-shell--centered" data-theme={colorScheme}><section className="analytics-message"><h1>Данные временно недоступны</h1><p>{state.message}</p><button className="primary-action" onClick={() => window.location.reload()}>Повторить</button></section></main>

  const { data } = state
  const firstStage = data.funnel.stages[0]?.count ?? 0
  return (
    <main className="product-shell" data-theme={colorScheme}>
      <div className="analytics-container">
        <ProductHeader backHref="/" backLabel="Личный кабинет" actions={<span className="analytics-role">{data.role === 'owner' ? 'Владелец' : 'Аналитик'}</span>} />
        <PageHeading eyebrow="Внутренний раздел" title="Продукт в цифрах" description="Оплаты, использование кабинета и Telegram, удержание и качество — в одной системе счёта." />
        <form className="analytics-filters" onSubmit={(event) => event.preventDefault()}>
          <label>С <input type="date" value={from} max={to} onChange={(event) => { setState({ kind: 'loading' }); setFrom(event.target.value) }} /></label>
          <label>По <input type="date" value={to} min={from} max={moscowDate()} onChange={(event) => { setState({ kind: 'loading' }); setTo(event.target.value) }} /></label>
          <label>Канал <select value={channel} onChange={(event) => { setState({ kind: 'loading' }); setChannel(event.target.value) }}><option value="">Все</option><option value="telegram">Telegram</option><option value="web">Веб</option><option value="recurring">Автопродление</option><option value="admin">Вручную</option></select></label>
        </form>

        <section className="analytics-kpis" aria-label="Главные показатели">
          <div><span>Активные пользователи</span><strong>{data.overview.totals.active_accounts}</strong><small>получили готовый результат</small></div>
          <div><span>Готовые результаты</span><strong>{data.overview.totals.results_available}</strong><small>из {data.overview.totals.processing_submitted} запусков</small></div>
          <div><span>Выручка</span><strong>{rub(data.overview.totals.revenue_kopek)}</strong><small>{data.overview.totals.confirmed_payments} подтверждённых оплат</small></div>
          <div><span>Платящие аккаунты</span><strong>{data.overview.totals.paying_accounts}</strong><small>{data.overview.totals.active_paid_accounts} с активным доступом</small></div>
        </section>

        <div className="analytics-grid">
          <section className="analytics-section">
            <header><div><p className="eyebrow">Воронка</p><h2>От знакомства до доступа</h2></div></header>
            <ol className="funnel-list">{data.funnel.stages.map((stage) => <li key={stage.stage}><span>{LABELS[stage.stage] ?? stage.stage}</span><i style={{ '--bar': `${Math.max(2, firstStage ? stage.count / firstStage * 100 : 0)}%` } as CSSProperties} /><strong>{stage.count}</strong><small>{pct(stage.count, firstStage)}</small></li>)}</ol>
          </section>
          <section className="analytics-section analytics-section--quality">
            <header><div><p className="eyebrow">Контроль</p><h2>Качество данных</h2></div><StatusBadge status={Object.values(data.dataQuality.statuses).includes('alert') ? 'failed' : 'ready'}>{Object.values(data.dataQuality.statuses).includes('alert') ? 'Нужна проверка' : 'Всё чисто'}</StatusBadge></header>
            <dl className="quality-list">{Object.entries(data.dataQuality.statuses).map(([key, status]) => <div key={key}><dt>{LABELS[key] ?? key}</dt><dd className={`quality-${status}`}>{key === 'rollup_freshness' ? status === 'ok' ? 'Свежие' : 'Устарели' : data.dataQuality.checks[key] ?? 0}</dd></div>)}</dl>
          </section>
        </div>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Поверхности</p><h2>Кабинет, визуализатор и редактор</h2></div><small>Ответили на вопрос: {data.surfaces.feedback.response_rate == null ? '—' : `${Math.round(data.surfaces.feedback.response_rate * 100)}%`}</small></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Действие</th><th>Аккаунты</th><th>События</th><th>Активные дни</th></tr></thead><tbody>{data.surfaces.surfaces.filter((row) => !row.event_name.startsWith('feedback.')).map((row) => <tr key={row.event_name}><td>{LABELS[row.event_name] ?? row.event_name}</td><td>{row.unique_accounts}</td><td>{row.events}</td><td>{row.active_days}</td></tr>)}</tbody></table></div>
          <ol className="surface-funnel" aria-label="Воронка веб-продукта">
            {Object.entries(data.surfaces.funnel).map(([stage, count]) => <li key={stage}><span>{stage}</span><strong>{count}</strong></li>)}
          </ol>
        </section>

        {data.role === 'owner' && data.outreach && <section className="analytics-section">
          <header><div><p className="eyebrow">Исследования</p><h2>Кандидаты на личный вопрос</h2></div><small>Сообщения не отправляются автоматически</small></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Telegram</th><th>Когорта</th><th>Баллы</th><th>Статус</th><th /></tr></thead><tbody>{data.outreach.items.map((item) => <tr key={item.id}><td>{item.telegram_username ? `@${item.telegram_username}` : '—'}</td><td>{item.cohort}</td><td>{item.score}</td><td>{item.status}</td><td>{item.status === 'candidate' && <button className="text-action" type="button" onClick={() => void updateOutreachStatus(item.id, 'approved').then(() => window.location.reload())}>Одобрить</button>}</td></tr>)}</tbody></table></div>
          <p className="outreach-template"><strong>Шаблон после финального согласования:</strong> {data.outreach.message_template}</p>
        </section>}

        <section className="analytics-section">
          <header><div><p className="eyebrow">Reels Studio</p><h2>Автоматическая генерация и ручная оценка</h2></div></header>
          <div className="analytics-kpis analytics-kpis--compact">
            <div><span>Генерации</span><strong>{data.reels.totals.generations}</strong><small>{data.reels.totals.generation_pass} прошли QA</small></div>
            <div><span>Готовые рендеры</span><strong>{data.reels.totals.ready_renders}</strong><small>{data.reels.totals.selected_renders} выбраны</small></div>
            <div><span>Ошибки инфраструктуры</span><strong>{data.reels.totals.infra_failures}</strong><small>не творческая отбраковка</small></div>
            <div><span>Публикации</span><strong>{data.reels.totals.published}</strong><small>{data.reels.totals.views} просмотров</small></div>
          </div>
          <div className="verdict-line">{data.reels.totals.human_verdicts.length ? data.reels.totals.human_verdicts.map((item) => <span key={item.verdict}><strong>{item.count}</strong> {item.verdict}</span>) : <span>Ручных оценок пока нет.</span>}</div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Деньги</p><h2>Оплаты по дням и каналам</h2></div></header>
          <div className="revenue-bars">{data.payments.daily.length ? data.payments.daily.map((row) => <div className="revenue-row" key={`${row.day}-${row.channel}`}><time>{new Date(row.day).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</time><span>{row.channel}</span><i><b style={{ width: `${Math.max(2, row.gross_kopek / maxRevenue * 100)}%` }} /></i><strong>{rub(row.gross_kopek)}</strong><small>{row.paid} оплат · {row.failed} ошибок</small></div>) : <p className="analytics-empty">За выбранный период подтверждённых операций нет.</p>}</div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Удержание</p><h2>Возвращаются после результата</h2></div></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Когорта</th><th>Размер</th><th>D1</th><th>D7</th><th>За 7 дней</th><th>D30</th><th>За 30 дней</th></tr></thead><tbody>{data.retention.cohorts.map((row) => <tr key={row.cohort_date}><td>{new Date(row.cohort_date).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}</td><td>{row.cohort_size}</td><td>{pct(row.d1, row.cohort_size)}</td><td>{pct(row.d7, row.cohort_size)}</td><td>{pct(row.r7, row.cohort_size)}</td><td>{pct(row.d30, row.cohort_size)}</td><td>{pct(row.r30, row.cohort_size)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="analytics-section">
          <header><div><p className="eyebrow">Обратная связь</p><h2>Качество по методам</h2></div></header>
          <div className="analytics-table-wrap"><table><thead><tr><th>Канал</th><th>Метод</th><th>Ответы</th><th>Средняя</th><th>Положительные</th><th>Негативные</th></tr></thead><tbody>{data.quality.segments.map((row) => <tr key={`${row.channel}-${row.engine}`}><td>{row.channel}</td><td>{row.engine}</td><td>{row.responses}</td><td>{row.average_rating ?? '—'}</td><td>{row.positive}</td><td>{row.negative}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  )
}
