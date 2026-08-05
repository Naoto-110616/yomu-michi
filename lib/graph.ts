/**
 * グラフのドメインモデル。
 *
 * 設計上いちばん重要なのは RelationType が 4 種類あること。
 * 単なる「関連」ではなく、前提 / 発展 / 別視点 / 反論 を区別することが
 * このプロダクトの中身そのものになっている。
 */

export const RELATIONS = ['pre', 'next', 'alt', 'counter'] as const
export type RelationType = (typeof RELATIONS)[number]

export const RELATION_META: Record<
  RelationType,
  { label: string; color: string; dashed: boolean; directed: boolean; hint: string }
> = {
  pre: {
    label: '前提', color: '#f59e0b', dashed: false, directed: true,
    hint: 'これを先に読んでおくと、相手の本が効く',
  },
  next: {
    label: '発展', color: '#60a5fa', dashed: false, directed: true,
    hint: '続き・同シリーズ・議論の先',
  },
  alt: {
    label: '別視点', color: '#5b6472', dashed: true, directed: false,
    hint: '同じテーマを別の角度から扱っている',
  },
  counter: {
    label: '反論', color: '#ef4444', dashed: true, directed: true,
    hint: '主張が対立している',
  },
}

export const CATEGORIES = [
  'hist', 'phil', 'mys', 'hor', 'sf', 'lit', 'mind', 'design', 'comedy', 'work', 'sci',
] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  hist:   { label: '歴史・文明', color: '#fbbf24' },
  phil:   { label: '哲学・思想', color: '#c4b5fd' },
  mys:    { label: 'ミステリ',   color: '#7dd3fc' },
  hor:    { label: 'ホラー',     color: '#fca5a5' },
  sf:     { label: 'SF',         color: '#5eead4' },
  lit:    { label: '文芸',       color: '#f9a8d4' },
  mind:   { label: '人の心',     color: '#f472b6' },
  design: { label: 'つくる側',   color: '#fdba74' },
  comedy: { label: 'お笑い',     color: '#facc15' },
  work:   { label: '仕事・経済', color: '#a3e635' },
  sci:    { label: '科学',       color: '#86efac' },
}

export const STAR_COLOR: Record<number, string> = {
  5: '#fbbf24', 4: '#7dd3fc', 3: '#86efac', 2: '#f472b6', 1: '#a78bfa', 0: '#6b7382',
}

export interface BookNode {
  i: number
  title: string
  author: string
  year: number
  cat: Category
  /** 所有者の★評価。0 = 未評価、null = 未読（世間の本） */
  star: number | null
  /** 所有者の本棚にある本か */
  shelf: boolean
  /** 出典（賞・ランキング名など） */
  sources: string[]
  x: number
  y: number
  degree: number
}

export interface Edge {
  from: number
  to: number
  type: RelationType
  why: string
}

/** pipeline/pack.py が吐く圧縮フォーマット */
export interface Payload {
  C: string[]
  T: string[]
  A: string[]
  S: string[]
  W: string[]
  n: [string, number, number, number, number, number, number, number, number[]][]
  e: [number, number, number, number][]
  meta: { nodes: number; edges: number; shelf: number; byType: Record<string, number>; raw: number }
}

export interface Graph {
  nodes: BookNode[]
  edges: Edge[]
  /** node index -> 接続する edge の index 一覧 */
  adjacency: number[][]
  meta: Payload['meta']
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

export function buildGraph(p: Payload): Graph {
  const nodes: BookNode[] = p.n.map((a, i) => ({
    i,
    title: a[0],
    author: p.A[a[1]] ?? '—',
    year: a[2],
    cat: (p.C[a[3]] as Category) ?? 'lit',
    star: a[4] < 0 ? null : a[4],
    shelf: !!a[5],
    x: a[6],
    y: a[7],
    sources: (a[8] ?? []).map((j) => p.S[j]).filter(Boolean),
    degree: 0,
  }))

  const edges: Edge[] = p.e.map((e) => ({
    from: e[0],
    to: e[1],
    type: (p.T[e[2]] as RelationType) ?? 'alt',
    why: p.W[e[3]] ?? '',
  }))

  const adjacency: number[][] = nodes.map(() => [])
  edges.forEach((e, i) => {
    adjacency[e.from].push(i)
    adjacency[e.to].push(i)
    nodes[e.from].degree++
    nodes[e.to].degree++
  })

  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  return {
    nodes, edges, adjacency, meta: p.meta,
    bounds: {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    },
  }
}

/* ── 表示のためのヘルパー ───────────────────────────── */

export function nodeRadius(n: BookNode): number {
  if (n.shelf) return n.star ? 3.2 + n.star * 1.15 : 5
  return 2 + Math.min(n.degree, 8) * 0.38
}

export type ViewMode = 'all' | 'shelf' | 'human'

export function nodeColor(n: BookNode, mode: ViewMode): string {
  if (mode === 'shelf' && !n.shelf) return '#232a34'
  if (n.shelf) return n.star !== null ? (STAR_COLOR[n.star] ?? '#6b7382') : '#6b7382'
  return CATEGORY_META[n.cat]?.color ?? '#4b5563'
}

export function nodeOpacity(n: BookNode, mode: ViewMode): number {
  if (mode === 'shelf') return n.shelf ? 1 : 0.2
  if (mode === 'human') return 1
  return n.shelf ? 1 : 0.62
}

export function starLabel(star: number | null): string {
  if (star === null) return '未読'
  if (star === 0) return '未評価'
  return '★'.repeat(star) + '☆'.repeat(5 - star)
}

export function matchesQuery(n: BookNode, q: string): boolean {
  if (!q) return true
  const hay = (n.title + n.author + n.sources.join('')).toLowerCase()
  return hay.includes(q.toLowerCase())
}
