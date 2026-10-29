import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { safeAuthReturnPath, parseTelegramStartParam, telegramStartParamForReturnPath } from './routing'

const id = 'bad40964-2f41-4faf-b794-b67bb35d4167'
describe('compatibility canonical redirect contract', () => {
  it('redirects only compatibility HTTPS to a fixed canonical host with exact request URI', () => {
    const config = readFileSync(new URL('../../deploy/nginx/app.audio2midi.ru.conf', import.meta.url), 'utf8')
    expect(config).toContain('if ($host = miniapp.audio2midi.ru) {\n        return 307 https://app.audio2midi.ru$request_uri;')
  })
  it.each([`/open/${id}`, '/open/legacy-42', `/editor/${id}`, `/tracks/${id}`, '/new?resume=' + id])('retains login and Telegram return for %s', (path) => {
    const query = '?login=1&next=' + encodeURIComponent(path)
    const location = new URL('https://app.audio2midi.ru/' + query)
    expect(safeAuthReturnPath(location.searchParams.get('next'))).toBe(path)
    expect(parseTelegramStartParam(telegramStartParamForReturnPath(path)).returnPath).toBe(path)
  })
  it('does not reencode signed file URLs or Telegram query data', () => {
    const requestUri = '/?file=' + encodeURIComponent('https://storage.example/a.mid?signature=a%2Fb&x=1') + '&tgWebAppStartParam=result_' + id
    const location = new URL('https://app.audio2midi.ru' + requestUri)
    expect(location.pathname + location.search).toBe(requestUri)
    expect(location.hash).toBe('') // permits browser fragment inheritance; not a webview integration test
  })
})
