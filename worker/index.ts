/**
 * 静的アセットの前に立つ小さな Worker。
 *
 * /api/ndl?q=… — 国立国会図書館サーチ（OpenSearch）のプロキシ。
 *   NDL は無料・キー不要で数千万件の書誌を検索できる。ここを通すことで
 *   CORS を気にせず同一オリジンで呼べて、エッジキャッシュも効く。
 *   書誌データベースを 1 円も持たずに「世界中の本」を検索対象にする要。
 *
 * それ以外のパスは静的アセット（Next.js の書き出し）にフォールバックする。
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
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
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
    const date = pick(body, /<pubDate>([\s\S]*?)<\/pubDate>/) || pick(body, /<dcterms:issued[^>]*>([\s\S]*?)<\/dcterms:issued>/)
    const ym = date.match(/(\d{4})/)
    const year = ym ? Number(ym[1]) : 0
    // 同じ本が版違いで並ぶので ISBN（無ければタイトル+著者）でまとめる
    const dedupeKey = isbn || `${title}|${author}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    items.push({ title, author, publisher, year, isbn })
  }
  return items
}

async function handleNdl(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return Response.json({ items: [], error: 'q is required' }, { status: 400 })

  // エッジキャッシュ（同じ検索語は 1 日再利用）
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(`https://cache.yomu-michi/ndl?q=${encodeURIComponent(q)}`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const upstream = `https://ndlsearch.ndl.go.jp/api/opensearch?any=${encodeURIComponent(q)}&cnt=20`
  const res = await fetch(upstream, {
    headers: { 'User-Agent': 'yomu-michi/0.1 (book graph; contact via github.com/Naoto-110616/yomu-michi)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    return Response.json({ items: [], error: `NDL ${res.status}` }, { status: 502 })
  }
  const xml = await res.text()
  const items = parseOpenSearch(xml).slice(0, 12)
  const out = Response.json(
    { items },
    { headers: { 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } }
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
        return Response.json({ items: [], error: String(e) }, { status: 502 })
      }
    }
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true })
    }
    return env.ASSETS.fetch(req)
  },
}
