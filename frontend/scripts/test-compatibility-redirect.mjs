import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { chromium } from 'playwright'

// Two local origins model the compatibility and canonical hosts. No production calls.
const requests = []
const canonical = createServer((req, res) => {
  requests.push(req.url)
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<!doctype html><title>Canonical redirect fixture</title>')
})
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
await listen(canonical)
const canonicalOrigin = `http://127.0.0.1:${canonical.address().port}`
const compatibility = createServer((req, res) => {
  res.writeHead(307, { Location: canonicalOrigin + req.url })
  res.end()
})
await listen(compatibility)
const compatibilityOrigin = `http://127.0.0.1:${compatibility.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const id = 'bad40964-2f41-4faf-b794-b67bb35d4167'
  const fragment = '#tgWebAppData=' + encodeURIComponent('query_id=synthetic&user={"id":123}&auth_date=123&hash=fixture') + '&tgWebAppVersion=8.0&tgWebAppPlatform=web'
  const cases = [
    `/open/${id}`,
    '/?login=1&next=' + encodeURIComponent(`/open/${id}`),
    '/?login=1&next=' + encodeURIComponent(`/editor/${id}`),
    '/?tgWebAppStartParam=result_' + id,
    '/?file=' + encodeURIComponent('https://storage.example/a.mid?signature=a%2Fb&x=1'),
  ]
  for (const path of cases) {
    const response = await page.goto(compatibilityOrigin + path + fragment)
    assert.equal(response.status(), 200)
    assert.equal(response.request().redirectedFrom().url(), compatibilityOrigin + path)
    assert.equal(page.url(), canonicalOrigin + path + fragment)
    const location = await page.evaluate(() => ({ search: location.search, hash: location.hash, next: new URLSearchParams(location.search).get('next') }))
    assert.equal(location.hash, fragment)
    assert.equal(location.search, new URL(compatibilityOrigin + path).search)
    assert.equal(location.next, new URL(compatibilityOrigin + path).searchParams.get('next'))
    console.log(`PASS ${path.split('?')[0]}: fragment and query preserved`)
  }
  assert(requests.every(url => !url.includes('tgWebAppData')))
  console.log('PASS Telegram fragment never sent to HTTP server; 5 redirect cases passed')
} finally {
  if (browser) {
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))])
  }
  canonical.closeAllConnections()
  compatibility.closeAllConnections()
  await Promise.all([new Promise(resolve => canonical.close(resolve)), new Promise(resolve => compatibility.close(resolve))])
}

// Playwright shutdown may retain handles; all assertions and server cleanup completed.
process.exit(0)
