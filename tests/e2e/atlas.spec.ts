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

/* ── 静的サーバ（ビルド済み out/ を配信） ───────── */

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

/* ── モックとヘルパー ─────────────────── */

/** 本番と同じ「オーバーレイ到着 → グラフ再構築」を必ず起こす */
async function mockSupabase(page: Page, opts: { landing?: boolean } = {}) {
  // LP は専用テスト以外では出さない（各テストは地図そのものを見たい）
  if (!opts.landing) {
    await page.addInitScript(() => sessionStorage.setItem('yomu:lp-seen', '1'))
  }
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
  await page.route('**/*.supabase.co/rest/v1/proposal_status**', (r) =>
    r.fulfill({ json: [
      {
        id: '00000000-0000-4000-8000-000000000001', kind: 'alt',
        from_key: '三体', to_key: 'プロジェクト・ヘイル・メアリー上',
        why: 'テスト用のAI提案の理由', confidence: 0.85, evidence: null,
        yes: 0, no: 0, unsure: 0, status: 'proposed',
      },
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

/* ── テスト本体 ─────────────────────── */

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

test('絞り込みパネルはオーバーレイで開き、背面タップで閉じ、検索の解除は地図の上で1タップ', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  const h0 = await page.evaluate(() => document.querySelector('canvas')!.clientHeight)
  await page.getByRole('button', { name: /絞り込み/ }).click()
  await page.waitForTimeout(500)
  const search = page.getByPlaceholder(/タイトル・著者・概念で検索/)
  await expect(search).toBeVisible()

  // オーバーレイなので地図はリサイズされない（開閉のたびに地図が動かない）
  const h1 = await page.evaluate(() => document.querySelector('canvas')!.clientHeight)
  expect(h1).toBe(h0)

  // 検索してから背面（地図側）をタップ → パネルが閉じる
  await search.fill('夜と霧')
  await page.mouse.click(640, 640)
  await page.waitForTimeout(500)
  await expect(search).toBeHidden()

  // 検索中は地図の上に解除チップが出て、1タップで解除できる
  const chip = page.getByRole('button', { name: /検索「夜と霧」/ })
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toBeHidden()
  expect(errs).toEqual([])
})

test('凡例は右下の開閉式チップで、左下のAI提案と重ならない', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  const chip = page.getByRole('button', { name: /凡例/ })
  await expect(chip).toBeVisible()
  const chipBox = (await chip.boundingBox())!
  const dockBox = (await page.getByRole('button', { name: /AIの提案/ }).boundingBox())!
  expect(chipBox.x).toBeGreaterThan(dockBox.x + dockBox.width) // 右下 vs 左下

  await chip.click()
  await expect(page.getByText('概念（いちばん大きい）')).toBeVisible()
  await page.getByRole('button', { name: '×', exact: true }).click()
  await expect(page.getByText('概念（いちばん大きい）')).toBeHidden()
  expect(errs).toEqual([])
})

test('AI推論ループ: 提案が検証カードに出て、未ログインでは判定できない', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // 提案があるあいだ、左下にチップが出る
  const chip = page.getByRole('button', { name: /AIの提案 1件/ })
  await expect(chip).toBeVisible()
  await chip.click()

  // カード: 対象・理由・自信度・判定不可の案内
  await expect(page.getByText('AIが仮に張った線 — 合っていますか？')).toBeVisible()
  await expect(page.getByText('テスト用のAI提案の理由')).toBeVisible()
  await expect(page.getByText('85%')).toBeVisible()
  await expect(page.getByText('ログインすると判定できます')).toBeVisible()
  await expect(page.getByText('まだ判定がありません')).toBeVisible()
  expect(errs).toEqual([])
})

test('LP: サービス説明・使い方フロー・サインアップ・デモ動線がそろい、CTAで地図に降りる', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page, { landing: true })
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

  // ヒーロー: 目的の説明と3つの動線（はじめる / デモ / ログイン不要）
  await expect(page.getByRole('heading', { name: /知識の地図になる/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'はじめる — 無料' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible()

  // 使い方フロー + 特徴
  await expect(page.getByText('つかいかた — 4ステップ')).toBeVisible()
  await expect(page.getByText('本棚をつなぐ')).toBeVisible()
  await expect(page.getByText('AIが線を張り、あなたは1タップ')).toBeVisible()

  // サインアップ: LP上でログイン / 新規登録が完結する
  await expect(page.getByText('いますぐはじめる')).toBeVisible()
  await page.getByRole('button', { name: '新規登録', exact: true }).click()
  await expect(page.getByPlaceholder('パスワード（8文字以上）')).toBeVisible()
  await expect(page.getByRole('button', { name: 'メールで新規登録' })).toBeVisible()

  // CTA で LP が閉じ、後ろで動いていた実物の地図がそのまま前面になる
  await page.getByRole('button', { name: /地図をさわってみる — ログイン不要/ }).click()
  await expect(page.getByText('つかいかた — 4ステップ')).toBeHidden()
  await expect(page.locator('canvas')).toBeVisible()

  // ゲストのヘッダーには「使い方」ボタンが残り、LPへ戻れる
  await page.getByRole('button', { name: '使い方', exact: true }).click()
  await expect(page.getByText('つかいかた — 4ステップ')).toBeVisible()
  await page.getByRole('button', { name: /地図をさわってみる — ログイン不要/ }).click()

  // 同じタブ内のリロードでは再表示しない
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await expect(page.getByText('つかいかた — 4ステップ')).toBeHidden()
  expect(errs).toEqual([])
})

test('ログインメニュー: ソーシャルログインとマジックリンクの導線が出る', async ({ page }) => {
  const errs = collectErrors(page)
  await mockSupabase(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await expect(page.getByRole('button', { name: /Google で続ける/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /GitHub で続ける/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /メールのリンクでログイン/ })).toBeVisible()
  await expect(page.getByText('デモアカウント')).toBeVisible()
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
