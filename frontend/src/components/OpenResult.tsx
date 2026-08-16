import { useEffect, useState } from 'react'

import { authenticateWithTelegram, materializeEditorProject } from '../api/account'
import { ApiError } from '../api/client'
import { trackProductEvent } from '../api/analytics'
import { ProductLoading } from './ProductFrame'

interface OpenResultProps {
  itemId: string
  initData: string | null
  colorScheme: 'light' | 'dark'
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Не удалось открыть результат. Попробуйте ещё раз.'
  if (error.status === 401) return 'Откройте эту кнопку внутри Telegram или войдите на сайте.'
  if (error.status === 403) return 'Редактор пока недоступен для этого аккаунта.'
  if (error.status === 404) return 'Результат не найден или пока недоступен.'
  if (error.status === 422) return 'MIDI этого результата повреждён или недоступен.'
  return 'Не удалось открыть результат. Попробуйте ещё раз.'
}

export default function OpenResult({ itemId, initData, colorScheme }: OpenResultProps) {
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function open() {
      setError('')
      try {
        let materialized
        try {
          materialized = await materializeEditorProject(itemId)
        } catch (loadError) {
          if (!(loadError instanceof ApiError) || loadError.status !== 401 || !initData) throw loadError
          const authentication = await authenticateWithTelegram(initData)
          if ('merge_required' in authentication && authentication.merge_required) {
            throw new ApiError('Сначала объедините аккаунты в профиле.', 409)
          }
          materialized = await materializeEditorProject(itemId)
        }
        if (cancelled) return
        void trackProductEvent('result.opened', {
          objectType: 'project',
          objectId: materialized.project_id,
          properties: { surface: 'telegram_result', created: materialized.created },
        })
        window.location.replace(`/tracks/${materialized.project_id}`)
      } catch (openError) {
        if (!cancelled) setError(messageFor(openError))
      }
    }
    void open()
    return () => { cancelled = true }
  }, [attempt, initData, itemId])

  if (!error) return <ProductLoading label="Открываем результат…" />
  return (
    <main className="cabinet-shell cabinet-shell--centered" data-theme={colorScheme}>
      <section className="studio-message">
        <p className="eyebrow">Audio2MIDI</p>
        <h1>Результат не открылся</h1>
        <p>{error}</p>
        <div className="workspace-actions">
          <button className="primary-action" onClick={() => setAttempt((value) => value + 1)} type="button">Повторить</button>
          <a className="secondary-action" href="/">Мои работы</a>
        </div>
      </section>
    </main>
  )
}
