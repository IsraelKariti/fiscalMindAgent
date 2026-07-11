// WCAG 2.1 AA audit of the static export in ./out — run `npm run build` first, then
// `node scripts/axe-audit.mjs`. Exits non-zero if any violation is found.
import { createRequire } from 'node:module'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LANDING = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(LANDING, 'package.json'))
const { chromium } = require('playwright')
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8')

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
}

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  let file = path.join(LANDING, 'out', p)
  try {
    let body
    try {
      body = await readFile(file)
    } catch {
      body = await readFile(file + '.html')
      file += '.html'
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(8123, r))

const browser = await chromium.launch()
let failures = 0

async function runAxe(page, label) {
  await page.addScriptTag({ content: axeSource })
  const results = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    }),
  )
  if (results.violations.length === 0) {
    console.log(`✓ axe clean: ${label}`)
    return
  }
  failures += results.violations.length
  console.log(`✗ ${label} — ${results.violations.length} violation types`)
  for (const v of results.violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`)
    for (const n of v.nodes.slice(0, 3)) {
      console.log(`    - ${n.target.join(' ')} :: ${n.html.slice(0, 120)}`)
      if (n.any[0]?.message) console.log(`      → ${n.any[0].message}`)
    }
    if (v.nodes.length > 3) console.log(`    … and ${v.nodes.length - 3} more nodes`)
  }
}

// --- Desktop: both routes, plus interactive states on the homepage ---
for (const route of ['/', '/accessibility']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://localhost:8123${route}`, { waitUntil: 'networkidle' })
  await runAxe(page, `${route} (desktop, initial)`)

  if (route === '/') {
    // FAQ: audit with the first answer expanded
    await page.click('#faq h3 >> nth=0 >> button')
    await runAxe(page, '/ (FAQ expanded)')
    // Testimonials: audit each carousel page
    const dots = page.locator('#testimonials [aria-label^="עמוד המלצות"]')
    const n = await dots.count()
    for (let i = 1; i < n; i++) {
      await dots.nth(i).click()
      await page.waitForTimeout(600)
      await runAxe(page, `/ (testimonials page ${i + 1})`)
    }
  }
  await page.close()
}

// --- Mobile: menu closed and open ---
{
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } })
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' })
  await runAxe(page, '/ (mobile 375px, menu closed)')
  await page.click('[aria-controls="mobile-menu"]')
  await runAxe(page, '/ (mobile, menu open)')

  // WCAG 1.4.10 reflow: no horizontal scrolling at 320px-equivalent width
  await page.setViewportSize({ width: 320, height: 800 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0) {
    failures++
    console.log(`✗ reflow: page overflows horizontally by ${overflow}px at 320px width (WCAG 1.4.10)`)
  } else {
    console.log('✓ reflow: no horizontal scroll at 320px width')
  }
  await page.close()
}

// --- Keyboard: every tab stop must be visible and show a focus indicator ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' })
  const stops = []
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        desc: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"`,
        hasOutline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        visible: rect.width > 0 && rect.height > 0,
      }
    })
    if (!info) break
    if (stops.some((s) => s.desc === info.desc)) break // wrapped around
    stops.push(info)
    if (!info.hasOutline) {
      failures++
      console.log(`✗ focus not visible on tab stop ${i + 1}: ${info.desc}`)
    }
    if (!info.visible) {
      failures++
      console.log(`✗ keyboard focus landed on invisible element: ${info.desc}`)
    }
  }
  console.log(`✓ keyboard: traversed ${stops.length} tab stops (first: ${stops[0]?.desc})`)
  await page.close()
}

await browser.close()
server.close()
console.log(failures === 0 ? '\nAll accessibility checks passed.' : `\n${failures} accessibility failure(s).`)
process.exit(failures === 0 ? 0 : 1)
