/**
 * Static assets の前に立つ小さな Worker。
 *
 * /api/ndl?q=... — 国立国会図書館サーチ (OpenSearch) のプロキシ。
 * 無料・キー不要で数千万件の書誌を検索できる。同一オリジンで呼べて
 * エッジキャッシュも効く。カタログを持たずに世界中の本を扱う要。
 *
 * それ以外のパスは静的アセット (Next.js の書き出し) にフォールバック。
 */

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

interface NdlItem {
  title: string
  author: string
  publisher: string
  year: number
  isbn: string
}

const pick = (src: string, re: RegExp): string => {
  const m = src.match(re)
  return m ? m[1].trim() : ''
}

const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")

function parseOpenSearch(xml: string): NdlItem[] {
  const items: NdlItem[] = []
  const seen = new Set<string>()
  for (const chunk of xml.split('<item>').slice(1)) {
    const body = chunk.split('</item>')[0]
    const title = decodeEntities(pick(body, /<title>([\s\S]*?)<\/title>/))
    if (!title) continue
    const author = decodeEntities(
      pick(body, /<dc:creator>([\s\S]*?)<\/dc:creator>/) || pick(body, /<author>([\s\S]*?)<\/author>/)
    ).replace(/,\s*$/, '')
    const publisher = decodeEntities(pick(body, /<dc:publisher>([\s\S]*?)<\/dc:publisher>/))
    const isbn = pick(body, /dcndl:ISBN">([-0-9Xx]+)</).replace(/-/g, '')
    const date =
      pick(body, /<pubDate>([\s\S]*?)<\/pubDate>/) ||
      pick(body, /<dcterms:issued[^>]*>([\s\S]*?)<\/dcterms:issued>/)
    const ym = date.match(/(\d{4})/)
    const year = ym ? Number(ym[1]) : 0
    const dedupeKey = isbn || `${title}|${author}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    items.push({ title, author, publisher, year, isbn })
  }
  return items
}

/**
 * 失敗しても常に 200 で JSON を返す。
 * 502 を返すと中間のプロキシやブラウザで本文が読めず、原因が闇に沈むため。
 * クライアントは items が空で error があれば失敗として扱う。
 */
async function handleNdl(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (!q) return Response.json({ items: [], error: 'q is required' })

  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(`https://cache.yomu-michi/ndl?q=${encodeURIComponent(q)}`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const attempts: string[] = []
  const endpoints = [
    `https://ndlsearch.ndl.go.jp/api/opensearch?any=${encodeURIComponent(q)}&cnt=20`,
    `https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(q)}&cnt=20`,
  ]

  for (const upstream of endpoints) {
    try {
      const res = await fetch(upstream, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; yomu-michi/0.1; +https://github.com/Naoto-110616/yomu-michi)',
          Accept: 'application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(9000),
      })
      if (!res.ok) {
        attempts.push(`${upstream} -> HTTP ${res.status}`)
        continue
      }
      const xml = await res.text()
      const items = parseOpenSearch(xml).slice(0, 12)
      if (items.length === 0 && !xml.includes('<item>')) {
        attempts.push(`${upstream} -> ok but no items (head: ${xml.slice(0, 120).replace(/\s+/g, ' ')})`)
        continue
      }
      const out = Response.json(
        { items },
        { headers: { 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } }
      )
      await cache.put(cacheKey, out.clone())
      return out
    } catch (e) {
      attempts.push(`${upstream} -> ${String(e)}`)
    }
  }
  return Response.json({ items: [], error: 'NDL unreachable', attempts })
}

/* ── ブクログ連携 ─────────────────────────────────
   /api/booklog?u={アカウントID}
   公開本棚を非公式JSON API（api.booklog.jp/json/{id}?rank=N）から取得する。
   星ごとに5回引く: ユーザーの前提は「読んだ本には星を付けている」なので、
   星1〜5の合併 = 読了本。ISBN-10 は URL 末尾から拾って ISBN-13 に変換する。 */

interface BooklogItem {
  title: string
  isbn: string // ISBN-13。Kindle(ASIN)などで取れなければ空
  star: number // 1-5
}

/** ISBN-10 → ISBN-13（978接頭 + チェックディジット再計算） */
export function isbn10to13(isbn10: string): string {
  if (!/^[0-9]{9}[0-9Xx]$/.test(isbn10)) return ''
  const core = '978' + isbn10.slice(0, 9)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3)
  return core + String((10 - (sum % 10)) % 10)
}

async function handleBooklog(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const u = url.searchParams.get('u')?.trim() ?? ''
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(u)) return Response.json({ items: [], error: 'invalid user id' })

  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(`https://cache.yomu-michi/booklog?u=${encodeURIComponent(u)}`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const items: BooklogItem[] = []
  const seen = new Set<string>()
  const errors: string[] = []
  for (const rank of [5, 4, 3, 2, 1]) {
    try {
      const res = await fetch(`https://api.booklog.jp/json/${u}?count=100&rank=${rank}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; yomu-michi/0.1)' },
        signal: AbortSignal.timeout(9000),
      })
      if (!res.ok) {
        errors.push(`rank${rank} -> HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as { books?: { title?: string; url?: string }[] }
      for (const b of data.books ?? []) {
        const title = (b.title ?? '').trim()
        if (!title || seen.has(title)) continue
        seen.add(title)
        const tail = (b.url ?? '').split('/').pop() ?? ''
        const isbn = /^97[89]\d{10}$/.test(tail) ? tail : isbn10to13(tail)
        items.push({ title, isbn, star: rank })
      }
    } catch (e) {
      errors.push(`rank${rank} -> ${String(e)}`)
    }
  }

  if (!items.length) {
    // 本棚が非公開・ID間違い・API不調のいずれか。詳細を返して闇に沈めない
    return Response.json({ items: [], error: '本棚を取得できませんでした（IDと公開設定を確認）', attempts: errors })
  }
  const out = Response.json(
    { items },
    { headers: { 'Cache-Control': 'public, max-age=600', 'Access-Control-Allow-Origin': '*' } }
  )
  await cache.put(cacheKey, out.clone())
  return out
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/api/ndl') {
      try {
        return await handleNdl(req)
      } catch (e) {
        return Response.json({ items: [], error: String(e) })
      }
    }
    if (url.pathname === '/api/booklog') {
      try {
        return await handleBooklog(req)
      } catch (e) {
        return Response.json({ items: [], error: String(e) })
      }
    }
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, at: 'worker' })
    }
    return env.ASSETS.fetch(req)
  },
}
