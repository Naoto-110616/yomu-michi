/**
 * Atlas のアニメーションと主要ロジックの回帰テスト。
 *
 * 物理アニメーションの性質は「見た目」なので、フレームのスナップショットを
 * 比較して数値的に判定する:
 *   - 沈静化   = 連続する2フレームが完全一致する
 *   - 動いている = 2フレームが異なる
 *
 * Supabase と NDL はルートインターセプトでモックする。実物に依存すると
 * テストが不安定になる上、「オーバーレイ到着でグラフが再構築される」という
 * 一番壊れやすい瞬間を確実に再現できないため。
 */
import { expect, test, type Page } from '@playwright/test'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

/* ── 静的サーバ（ビルド済み out/ を配信） ───────────── */

const ROOT = path.resolve(__dirname, '../../out')
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain',
}

let server: http.Server
let baseURL = ''

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent((req.url ?? '/').split('?')[0]))
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html')
    if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' })
    fs.createReadStream(p).pipe(res)
  })
  await new Promise<void>((r) => server.listen(0, () => r()))
  baseURL = `http://localhost:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise((r) => server.close(r))
})

/* ── モックとヘルパー ─────────────────────────── */

/** 本番と同じ「オーバーレイ到着 → グラフ再構築」を必ず起こす */
async function mockSupabase(page: Page) {
  // 未指定のエンドポイントは空配列（Playwright は後に登録した route が優先）
  await page.route('**/*.supabase.co/rest/v1/**', (r) => r.fulfill({ json: [] }))
  await page.route('**/*.supabase.co/rest/v1/concept_link_strength**', (r) =>
    r.fulfill({ json: [
      { concept_key: 'cat:phil', book_key: '夜と霧', supporters: 2, strength: 4.5 },
      { concept_key: 'cat:phil', book_key: '史上最強の哲学入門', supporters: 1, strength: 3 },
    ] }))
  await page.route('**/*.supabase.co/rest/v1/book_link_strength**', (r) =>
    r.fulfill({ json: [
      { from_key: '銃・病原菌・鉄', to_key: 'サピエンス全史上', rel: 'pre', supporters: 1, strength: 5 },
    ] }))
  await page.route('**/*.supabase.co/rest/v1/concepts**', (r) =>
    r.fulfill({ json: [
      { key: 'cat:phil', label: '哲学・思想', description: '大枠', official: true },
    ] }))
  await page.route('**/*.supabase.co/rest/v1/books**', (r) =>
    r.fulfill({ json: [
      { key: 'isbn:9784622039709', title: '夜と霧 新版', author: 'フランクル', year: 2002, cat: 'mind', isbn: '9784622039709' },
    ] }))
  await page.route('**/*.supabase.co/auth/**', (r) => r.fulfill({ json: {} }))
}

const frame = (page: Page) => page.evaluate(() => document.querySelector('canvas')!.toDataURL())

/** 連続2フレームが一致するまで待つ = 完全に沈静化した */
async function waitForStill(page: Page, timeoutMs = 25_000): Promise<boolean> {
  const t0 = Date.now()
  let prev = await frame(page)
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(450)
    const cur = await frame(page)
    if (cur === prev) return true
    prev = cur
  }
  return false
}

function collectErrors(page: Page): string[] {
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('[atlas]')) errs.push(m.text())
  })
  return errs
}

/* ── テスト本体 ───────────────────────────────── */

test('初期表示後、物理が有限時間で完全に沈静化する（震え禁止）', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500) // 初期レイアウトの馴染み
  expect(await waitForStill(page)).toBe(true)
  expect(errs).toEqual([])
})

test('回帰: オーバーレイでグラフが再構築された後もドラッグが効き、ループが死なない', async ({ page }) => {
  // 2026-08 に実際に起きた停止バグの再現条件そのもの。
  // 旧実装は描画ループが古い Simulation を閉じ込め、さらにループ内例外で
  // rAF が宙に浮いて完全停止した。このテストがある限り同じ壊れ方はできない。
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  expect(await waitForStill(page)).toBe(true)

  // ノードのある座標を掴む（概念ノードは大きいので当てやすい）
  await page.mouse.move(620, 440)
  await page.mouse.down()
  await page.mouse.move(626, 446) // 閾値を超えてドラッグ開始
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(626 + i * 6, 446 - i * 2)
    await page.waitForTimeout(16)
  }
  const d1 = await frame(page)
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(746 - i * 4, 406 + i * 3)
    await page.waitForTimeout(16)
  }
  const d2 = await frame(page)
  expect(d1).not.toBe(d2) // ドラッグ中は動いている

  await page.mouse.up()
  expect(await waitForStill(page)).toBe(true) // 余韻のあと再び止まる
  expect(errs).toEqual([])
})

test('絞り込みパネルの開閉でキャンバスが追従し、地図が壊れない', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  const h0 = await page.evaluate(() => document.querySelector('canvas')!.clientHeight)
  await page.getByRole('button', { name: /絞り込み/ }).click()
  await page.waitForTimeout(700) // 開閉アニメーション + ResizeObserver
  const h1 = await page.evaluate(() => document.querySelector('canvas')!.clientHeight)
  expect(h1).toBeLessThan(h0) // パネルの分だけ縮む = 引き伸ばされていない

  // 内部解像度が表示サイズに追従している（崩れの正体はこのズレだった）
  const sync = await page.evaluate(() => {
    const cv = document.querySelector('canvas')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    return Math.abs(cv.width - cv.clientWidth * dpr) <= 2 && Math.abs(cv.height - cv.clientHeight * dpr) <= 2
  })
  expect(sync).toBe(true)

  await page.getByRole('button', { name: /絞り込み/ }).click()
  await page.waitForTimeout(700)
  const h2 = await page.evaluate(() => document.querySelector('canvas')!.clientHeight)
  expect(h2).toBe(h0) // 閉じれば元どおり
  expect(errs).toEqual([])
})

test('世界の本の検索（NDLモック）が結果を表示する', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.route('**/api/ndl**', (r) =>
    r.fulfill({ json: { items: [
      { title: '夜と霧 新版', author: 'V.E.フランクル', publisher: 'みすず書房', year: 2002, isbn: '9784622039709' },
      { title: 'それでも人生にイエスと言う', author: 'V.E.フランクル', publisher: '春秋社', year: 1993, isbn: '9784393363607' },
    ] } }))
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: /絞り込み/ }).click()
  await page.getByPlaceholder(/世界の本を探す/).fill('フランクル')
  await page.getByRole('button', { name: '検索', exact: true }).click()
  await expect(page.getByText('夜と霧 新版')).toBeVisible()
  await expect(page.getByText('それでも人生にイエスと言う')).toBeVisible()
  expect(errs).toEqual([])
})
