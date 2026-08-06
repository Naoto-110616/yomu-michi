/**
 * DB 側から来る「動的な層」。
 * 焼き込みグラフの上に、実体化した本・概念・結びつき（強度つき投票）・
 * アカウント（プロフィール / フォロー）を重ねる。
 *
 * 結びつきの強さは 1-5 の5段階。表示は全ユーザーの平均。
 * 例: 夜と霧 × 哲学 = A:5, B:4 → 平均 4.5 → 太い線
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
  strength: number
}
export interface OverlayBond {
  from: string
  to: string
  rel: 'pre' | 'next' | 'alt' | 'counter'
  supporters: number
  strength: number
}
export interface Profile {
  id: string
  username: string
}

/** AI推論ループの提案（未検証エッジ）と、その判定状況 */
export interface Proposal {
  id: string
  kind: 'pre' | 'next' | 'alt' | 'counter' | 'member'
  /** member のときは概念キー。それ以外は from→to（pre は from が前提側） */
  from: string
  to: string
  why: string
  confidence: number
  evidence: string | null
  yes: number
  no: number
  unsure: number
  status: 'proposed' | 'verified' | 'rejected' | 'disputed'
  /** 自分の判定。未判定なら null */
  myVote: 'yes' | 'no' | 'unsure' | null
}

/**
 * 却下率。AIの精度をユーザーが自分で較正するための数字なので隠さない。
 * 判定が1件も無いあいだは null（率を出せない）。
 */
export function rejectRate(proposals: Proposal[], kind?: Proposal['kind']): number | null {
  const judged = proposals.filter((p) => (!kind || p.kind === kind) && p.status !== 'proposed')
  if (!judged.length) return null
  return judged.filter((p) => p.status === 'rejected').length / judged.length
}

export interface Overlay {
  books: OverlayBook[]
  concepts: OverlayConcept[]
  links: OverlayLink[]
  bonds: OverlayBond[]
  /** 自分の紐付け強度: "concept::book" / "a::b" → 1-5 */
  mine: Map<string, number>
  profiles: Profile[]
  /** 自分がフォローしている user id */
  follows: Set<string>
  /** AI推論ループの提案（全状態。地図に描くのは proposed / disputed だけ） */
  proposals: Proposal[]
}

export const EMPTY_OVERLAY: Overlay = {
  books: [], concepts: [], links: [], bonds: [],
  mine: new Map(), profiles: [], follows: new Set(), proposals: [],
}

export async function fetchOverlay(userId: string | null): Promise<Overlay> {
  const sb = getSupabase()
  if (!sb) return EMPTY_OVERLAY
  const [strength, bonds, concepts, books, profiles, mineLinks, mineBonds, follows, proposals, myVerdicts] = await Promise.all([
    sb.from('concept_link_strength').select('concept_key, book_key, supporters, strength'),
    sb.from('book_link_strength').select('from_key, to_key, rel, supporters, strength'),
    sb.from('concepts').select('key, label, description, official'),
    sb.from('books').select('key, title, author, year, cat, isbn'),
    sb.from('profiles').select('id, username'),
    userId ? sb.from('concept_links').select('concept_key, book_key, strength').eq('user_id', userId) : Promise.resolve({ data: [] }),
    userId ? sb.from('book_links').select('from_key, to_key, rel, strength').eq('user_id', userId) : Promise.resolve({ data: [] }),
    userId ? sb.from('follows').select('followee').eq('follower', userId) : Promise.resolve({ data: [] }),
    sb.from('proposal_status').select('id, kind, from_key, to_key, why, confidence, evidence, yes, no, unsure, status'),
    userId ? sb.from('verdicts').select('proposal_id, vote').eq('user_id', userId) : Promise.resolve({ data: [] }),
  ])
  type Row = Record<string, unknown>
  const mine = new Map<string, number>()
  for (const r of ((mineLinks as { data: Row[] | null }).data ?? []))
    mine.set(`${r.concept_key}::${r.book_key}`, Number(r.strength ?? 3))
  for (const r of ((mineBonds as { data: Row[] | null }).data ?? []))
    mine.set(`${r.from_key}::${r.to_key}::${r.rel}`, Number(r.strength ?? 3))
  return {
    links: (strength.data ?? []).map((r) => ({
      concept: r.concept_key as string, book: r.book_key as string,
      supporters: r.supporters as number, strength: Number(r.strength ?? 3),
    })),
    bonds: (bonds.data ?? []).map((r) => ({
      from: r.from_key as string, to: r.to_key as string,
      rel: r.rel as OverlayBond['rel'],
      supporters: r.supporters as number, strength: Number(r.strength ?? 3),
    })),
    concepts: (concepts.data ?? []).map((r) => ({
      key: r.key as string, label: r.label as string,
      description: (r.description as string) ?? '', official: !!r.official,
    })),
    books: (books.data ?? []).map((r) => ({
      key: r.key as string, title: r.title as string, author: (r.author as string) ?? '',
      year: (r.year as number) ?? 0, cat: (r.cat as string) ?? 'lit',
      isbn: (r.isbn as string) ?? undefined,
    })),
    profiles: (profiles.data ?? []).map((r) => ({ id: r.id as string, username: r.username as string })),
    mine,
    follows: new Set((((follows as { data: Row[] | null }).data) ?? []).map((r) => r.followee as string)),
    proposals: (() => {
      const votes = new Map<string, string>()
      for (const r of ((myVerdicts as { data: Row[] | null }).data ?? []))
        votes.set(r.proposal_id as string, r.vote as string)
      return (proposals.data ?? []).map((r) => ({
        id: r.id as string,
        kind: r.kind as Proposal['kind'],
        from: r.from_key as string,
        to: r.to_key as string,
        why: r.why as string,
        confidence: Number(r.confidence ?? 0.5),
        evidence: (r.evidence as string) ?? null,
        yes: Number(r.yes ?? 0),
        no: Number(r.no ?? 0),
        unsure: Number(r.unsure ?? 0),
        status: (r.status as Proposal['status']) ?? 'proposed',
        myVote: (votes.get(r.id as string) as Proposal['myVote']) ?? null,
      }))
    })(),
  }
}

/** 他のアカウントの視点: その人の本棚と、その人自身の強度を取る */
export async function fetchPersonalView(userId: string) {
  const sb = getSupabase()
  if (!sb) return null
  const [shelf, links, bonds] = await Promise.all([
    sb.from('shelf').select('book_key, star').eq('user_id', userId),
    sb.from('concept_links').select('concept_key, book_key, strength').eq('user_id', userId),
    sb.from('book_links').select('from_key, to_key, rel, strength').eq('user_id', userId),
  ])
  return {
    shelf: new Map((shelf.data ?? []).map((r) => [r.book_key as string, r.star as number])),
    links: (links.data ?? []).map((r) => ({
      concept: r.concept_key as string, book: r.book_key as string,
      supporters: 1, strength: Number(r.strength ?? 3),
    })),
    bonds: (bonds.data ?? []).map((r) => ({
      from: r.from_key as string, to: r.to_key as string,
      rel: r.rel as OverlayBond['rel'],
      supporters: 1, strength: Number(r.strength ?? 3),
    })),
  }
}

/* ── 表紙（無料・キー不要: 国立国会図書館のサムネイル） ── */

export const coverUrl = (isbn?: string) =>
  isbn ? `https://ndlsearch.ndl.go.jp/thumbnail/${isbn.replace(/-/g, '')}.jpg` : null

/* ── 「すぐ読み始める」ための外部リンク（すべて無料・キー不要） ── */

export function readLinks(title: string, author: string, isbn?: string) {
  const q = encodeURIComponent(`${title} ${author !== '—' ? author : ''}`.trim())
  return [
    {
      label: '図書館で探す', hint: 'カーリル — 近くの図書館の在架',
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

/**
 * パイプラインの norm_title と同じ規則のJS版。
 * NDL から追加する本が、焼き込みの本と重複ノードにならないための照合に使う。
 * （例: 「夜と霧 新版」→ 夜と霧 → 既存ノードに合流し、ISBN と表紙だけが付く）
 */
export function normalizeTitleKey(raw: string): string {
  let t = raw
    .replace(/[【〈《（(].*?[】〉》）)]/g, '')
    .replace(/^(新装版|完全版|増補改訂版|増補版|改訂版|完訳|新版)[\s　]*/, '')
  for (const sep of ['――', '—', '―', ' - ', '／', '：', ':']) {
    const i = t.indexOf(sep)
    if (i > 0) t = t.slice(0, i)
  }
  const EDITION = /^(新版|新装版|改訂版|完全版|文庫版|愛蔵版)$/
  const VOL = /^(上|中|下|[0-9０-９]{1,2}|[IVXivx]{1,4})$/
  const parts = t.trim().split(/[\s　]+/).filter((p) => p && !EDITION.test(p))
  if (!parts.length) return ''
  let head = parts[0]
  const vols = parts.slice(1).filter((p) => VOL.test(p))
  if (vols.length) head += vols.join('')
  else if (head.length < 4 && parts[1]) head += parts[1]
  return head.replace(/[\s　]/g, '').toLowerCase()
}

/** 本と本の結びつきの正規化（無向: 辞書順で a < b） */
export const bondPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])


/* ── フォローの地図のデータ: 自分 + フォロー先の本棚とフォロー網 ── */

export async function fetchSocial(me: { id: string; email: string }) {
  const sb = getSupabase()
  if (!sb) return null
  const [profiles, follows] = await Promise.all([
    sb.from('profiles').select('id, username'),
    sb.from('follows').select('follower, followee'),
  ])
  const myFollowees = new Set(
    (follows.data ?? []).filter((f) => f.follower === me.id).map((f) => f.followee as string)
  )
  const ids = [me.id, ...myFollowees]
  const shelves = await sb.from('shelf').select('user_id, book_key, star').in('user_id', ids)
  const shelfMap = new Map<string, Map<string, number>>()
  for (const r of shelves.data ?? []) {
    const uid = r.user_id as string
    if (!shelfMap.has(uid)) shelfMap.set(uid, new Map())
    shelfMap.get(uid)!.set(r.book_key as string, r.star as number)
  }
  const all = (profiles.data ?? []).map((r) => ({ id: r.id as string, username: r.username as string }))
  return {
    me: { id: me.id, username: all.find((p) => p.id === me.id)?.username ?? me.email.split('@')[0] },
    accounts: all.filter((p) => myFollowees.has(p.id)),
    follows: (follows.data ?? [])
      .map((f) => ({ follower: f.follower as string, followee: f.followee as string }))
      .filter((f) => ids.includes(f.follower) && ids.includes(f.followee)),
    shelves: shelfMap,
  }
}
