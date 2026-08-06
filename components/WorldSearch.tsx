'use client'

import { useCallback, useRef, useState } from 'react'
import { ndlKey, searchNdl, type NdlItem } from '@/lib/overlay'

/**
 * 世界の本を探す（国立国会図書館サーチ）。
 * ヒットした本は「まだ地図に居ない本」。棚に入れるか概念に紐付けた瞬間に
 * DB へ実体化されて、地図のノードになる。
 */
export default function WorldSearch({
  loggedIn,
  knownKeys,
  onMaterialize,
}: {
  loggedIn: boolean
  knownKeys: Set<string>
  onMaterialize: (item: NdlItem) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<NdlItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const seq = useRef(0)

  const run = useCallback(async () => {
    const query = q.trim()
    if (!query) return
    const my = ++seq.current
    setBusy(true)
    setError('')
    try {
      const results = await searchNdl(query)
      if (seq.current === my) setItems(results)
    } catch (e) {
      if (seq.current === my) {
        setError(e instanceof Error ? e.message : '検索に失敗しました')
        setItems([])
      }
    } finally {
      if (seq.current === my) setBusy(false)
    }
  }, [q])

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder="世界の本を探す（国会図書館 / 数千万件）…"
          className="min-w-0 flex-1 appearance-none rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[13.5px] text-text outline-none placeholder:text-dim"
        />
        <button
          onClick={run}
          disabled={busy || !q.trim()}
          className="flex-none rounded-[10px] border border-[#2f4a58] bg-acc/10 px-3.5 text-[12px] font-bold text-acc disabled:opacity-40"
        >
          {busy ? '検索中…' : '検索'}
        </button>
      </div>

      {error && <p className="mb-0 mt-2 text-[11px] text-[#fca5a5]">{error}</p>}

      {items !== null && !error && (
        <ul className="m-0 mt-2 max-h-[240px] list-none overflow-y-auto rounded-[10px] border border-line bg-panel2 p-0">
          {items.length === 0 && (
            <li className="px-3 py-3 text-[12px] text-dim">見つかりませんでした</li>
          )}
          {items.map((it) => {
            const key = ndlKey(it)
            const inMap = knownKeys.has(key) || added.has(key)
            return (
              <li key={key} className="flex items-center gap-2.5 border-b border-[#20252e] px-3 py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[12.5px] font-semibold leading-tight">{it.title}</p>
                  <p className="m-0 mt-0.5 truncate text-[10.5px] text-dim">
                    {it.author || '—'}
                    {it.publisher && ` / ${it.publisher}`}
                    {it.year > 0 && ` / ${it.year}`}
                  </p>
                </div>
                {inMap ? (
                  <span className="flex-none text-[10.5px] text-dim">地図に居ます</span>
                ) : loggedIn ? (
                  <button
                    onClick={async () => {
                      await onMaterialize(it)
                      setAdded((prev) => new Set(prev).add(key))
                    }}
                    className="flex-none rounded-full border border-[#2f4a58] bg-acc/10 px-2.5 py-1 text-[11px] font-bold text-acc active:bg-acc/25"
                  >
                    ＋ 棚に入れる
                  </button>
                ) : (
                  <span className="flex-none text-[10px] text-dim">要ログイン</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="mb-0 mt-1.5 text-[10px] leading-relaxed text-dim">
        棚に入れた瞬間に、その本は地図のノードになります（遅延実体化）。
      </p>
    </div>
  )
}
