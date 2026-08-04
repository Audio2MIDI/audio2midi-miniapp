import type { ReactNode } from 'react'

interface ProductHeaderProps {
  backHref?: string
  backLabel?: string
  actions?: ReactNode
}

export function ProductHeader({
  backHref,
  backLabel,
  actions,
}: ProductHeaderProps) {
  return (
    <header className="product-header">
      <a className="product-brand" href={backHref ?? 'https://audio2midi.ru'}>
        Audio2MIDI
      </a>
      <nav className="product-header__actions" aria-label="Основная навигация">
        {backHref && backLabel && (
          <a className="text-action" href={backHref}>{backLabel}</a>
        )}
        {actions}
      </nav>
    </header>
  )
}

interface PageHeadingProps {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}

export function PageHeading({ eyebrow, title, description, action }: PageHeadingProps) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-heading__description">{description}</p>}
      </div>
      {action && <div className="page-heading__action">{action}</div>}
    </section>
  )
}

export function ProductLoading({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <main className="product-shell product-shell--centered" aria-busy="true">
      <div className="product-loading" aria-live="polite" role="status">
        <span className="product-loading__mark" aria-hidden="true">♪</span>
        <span>{label}</span>
      </div>
    </main>
  )
}

export function StatusBadge({ status, children }: { status: string; children: ReactNode }) {
  const active = ['queued', 'leased', 'running', 'processing', 'uploading'].includes(status)
  return (
    <span className={`status-badge status-badge--${status}`}>
      {active && <i aria-hidden="true" />}
      {children}
    </span>
  )
}
