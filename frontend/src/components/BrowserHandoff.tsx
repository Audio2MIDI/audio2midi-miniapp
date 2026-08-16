import { useEffect, useRef, useState } from 'react'

import { consumeBrowserHandoff } from '../api/account'
import { ProductLoading } from './ProductFrame'

export default function BrowserHandoff({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  const token = useRef(new URLSearchParams(window.location.hash.slice(1)).get('token'))
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    window.history.replaceState({}, '', '/handoff')
  }, [])

  useEffect(() => {
    let cancelled = false
    async function exchange() {
      if (!token.current) {
        setError('Ссылка неполная или уже использована.')
        return
      }
      setError('')
      try {
        const result = await consumeBrowserHandoff(token.current)
        if (!cancelled) window.location.replace(result.target)
      } catch {
        if (!cancelled) setError('Ссылка истекла или уже была использована.')
      }
    }
    void exchange()
    return () => { cancelled = true }
  }, [attempt])

  if (!error) return <ProductLoading label="Открываем редактор…" />
  return (
    <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
      <section className="studio-message">
        <p className="eyebrow">Безопасный вход</p>
        <h1>Не удалось открыть редактор</h1>
        <p>{error}</p>
        <div className="workspace-actions">
          <button className="primary-action" onClick={() => setAttempt((value) => value + 1)} type="button">Повторить</button>
          <a className="secondary-action" href="/?login=1">Войти другим способом</a>
        </div>
      </section>
    </main>
  )
}
