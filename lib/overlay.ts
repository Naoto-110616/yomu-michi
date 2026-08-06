/**
 * DB 側から来る「動的な層」。
 *
 * 焼き込みグラフ（1033ノード）の上に、次の3つを重ねる:
 *   - ユーザーが登録した本（NDL検索から実体化した本）
 *   - ユーザーが作った概念
 *   - 概念⇄本の紐付け（＝投票）。supporters が多いほど太く・大きく描く
 */
import { getSupabase } from './supabase'

export interface OverlayBook {
  key: string
  title: string
  author: string
  year: number
  cat: string
  isbn?: string
}
export interface OverlayConcept {
  key: string
  label: string
  description: string
  official: boolean
}
export interface OverlayLink {
  concept: string
  book: string
  supporters: number
}

export interface Overlay {
  books: OverlayBook[]
  concepts: OverlayConcept[]
  links: OverlayLink[]
  /** 自分が紐付けたもの（concept_key::book_key） */
  mine: Set<string>
}

export const EMPTY_OVERLAY: Overlay = { books: [], concepts: [], links: [], mine: new Set() }

export async function fetchOverlay(userId: string | null): Promise<Overlay> {
  const sb = getSupabase()
  if (!sb) return EMPTY_OVERLAY
  const [strength, concepts, books, mineRes] = await Promise.all([
    sb.from('concept_link_strength').select('concept_key, book_key, supporters'),
    sb.from('concepts').select('key, label, description, official'),
    sb.from('books').select('key, title, author, year, cat, isbn'),
    userId
      ? sb.from('concept_links').select('concept_key, book_key').eq('user_id', userId)
      : Promise.resolve({ data: [] as { concept_key: string; book_key: string }[] }),
  ])
  return {
    links: (strength.data ?? []).map((r) => ({
      concept: r.concept_key as string,
      book: r.book_key as string,
      supporters: r.supporters as number,
    })),
    concepts: (concepts.data ?? []).map((r) => ({
      key: r.key as string,
      label: r.label as string,
      description: (r.description as string) ?? '',
      official: !!r.official,
    })),
    books: (books.data ?? []).map((r) => ({
      key: r.key as string,
      title: r.title as string,
      author: (r.author as string) ?? '',
      year: (r.year as number) ?? 0,
      cat: (r.cat as string) ?? 'lit',
      isbn: (r.isbn as string) ?? undefined,
    })),
    mine: new Set(
      ((mineRes as { data: { concept_key: string; book_key: string }[] | null }).data ?? []).map(
        (r) => `${r.concept_key}::${r.book_key}`
      )
    ),
  }
}

/* ── 「すぐ読み始める」ための外部リンク（すべて無料・キー不要） ── */

export function readLinks(title: string, author: string, isbn?: string) {
  const q = encodeURIComponent(`${title} ${author !== '—' ? author : ''}`.trim())
  return [
    {
      label: '図書館で探す',
      hint: 'カーリル — 近くの図書館の在架',
      url: isbn ? `https://calil.jp/book/${isbn}` : `https://calil.jp/search?q=${q}`,
    },
    { label: 'Amazon', hint: '新品・Kindle', url: `https://www.amazon.co.jp/s?k=${q}&i=stripbooks` },
    { label: '楽天ブックス', hint: '新品・在庫', url: `https://books.rakuten.co.jp/search?sitem=${q}` },
    { label: 'ブックオフ', hint: '中古', url: `https://shopping.bookoff.co.jp/search/keyword/${q}` },
  ]
}

/* ── NDL 検索（同一オリジンの Worker プロキシ経由） ── */

export interface NdlItem {
  title: string
  author: string
  publisher: string
  year: number
  isbn: string
}

export async function searchNdl(q: string): Promise<NdlItem[]> {
  const res = await fetch(`/api/ndl?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`検索に失敗しました (${res.status})`)
  const data = (await res.json()) as { items: NdlItem[] }
  return data.items ?? []
}

/** NDL の本 → 実体化キー。ISBN があれば ISBN、無ければタイトルで */
export const ndlKey = (item: NdlItem) => (item.isbn ? `isbn:${item.isbn}` : item.title.replace(/\s+/g, '').toLowerCase())
