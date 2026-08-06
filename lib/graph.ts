/**
 * グラフのドメインモデル。
 *
 * 2つの軸で構成が決まる:
 *   NodeKind     — 概念か、本か。概念は本より上位の存在。
 *   RelationType — 前提 / 発展 / 別視点 / 反論 / 所属。
 *
 * このプロダクトの中身は、単なる「関連」ではなく関係の種類を区別することにある。
 */

export const RELATIONS = ['member', 'pre', 'next', 'alt', 'counter'] as const
export type RelationType = (typeof RELATIONS)[number]

export const RELATION_META: Record<
  RelationType,
  { label: string; color: string; dashed: boolean; directed: boolean; hint: string }
> = {
  member: {
    label: '所属', color: '#a78bfa', dashed: false, directed: false,
    hint: 'この概念に属する本',
  },
  pre: {
    label: '前提', color: '#f59e0b', dashed: false, directed: true,
    hint: '先に読んでおくと効く',
  },
  next: {
    label: '発展', color: '#60a5fa', dashed: false, directed: true,
    hint: '続き・同シリーズ・議論の先',
  },
  alt: {
    label: '別視点', color: '#5b6472', dashed: true, directed: false,
    hint: '同じテーマを別の角度から',
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

export type NodeKind = 'book' | 'concept'

/**
 * 表示の階層。既定では 概念 > 読んだ本 > 紐づく本 の順に大きく・濃くなる。
 * ネットワークのサイズ（何段目まで出すか）もこれで決める。
 */
export const TIERS = ['concept', 'shelf', 'linked', 'far'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_META: Record<Tier, { label: string; scale: number }> = {
  concept: { label: '概念',     scale: 1.0 },
  shelf:   { label: '読んだ本', scale: 0.62 },
  linked:  { label: '紐づく本', scale: 0.38 },
  far:     { label: 'その他',   scale: 0.26 },
}

export interface BookNode {
  i: number
  /** 安定キー（正規化タイトル）。アカウントの本棚はこのキーで紐づく */
  key: string
  kind: NodeKind
  title: string
  author: string
  desc: string
  year: number
  cat: Category
  /** 所有者の★評価。0 = 未評価、null = 未読 / 概念 */
  star: number | null
  shelf: boolean
  sources: string[]
  /** 事前計算されたホームポジション */
  x: number
  y: number
  degree: number
  tier: Tier
}

export interface Edge {
  from: number
  to: number
  type: RelationType
  why: string
}

export interface Payload {
  C: string[]
  T: string[]
  K: string[]
  A: string[]
  S: string[]
  W: string[]
  D: string[]
  n: [string, number, number, number, number, number, number, number, number[], number, number, string][]
  e: [number, number, number, number][]
  meta: { nodes: number; edges: number; shelf: number; byType: Record<string, number>; raw: number }
}

export interface Graph {
  nodes: BookNode[]
  edges: Edge[]
  adjacency: number[][]
  meta: Payload['meta']
  concepts: number[]
}

/**
 * shelfOverride:
 *   null      → 焼き込みの本棚（ゲスト表示 = 尚斗の93冊）
 *   Map       → ログイン中アカウントの本棚。key → ★（0 = 未評価）。
 *               空の Map なら「まだ1冊も読んでいないアカウント」として描く。
 */
export type ShelfOverride = Map<string, number> | null

export function buildGraph(p: Payload, shelfOverride: ShelfOverride = null): Graph {
  const nodes: BookNode[] = p.n.map((a, i) => {
    const key = a[11]
    const kind = (p.K?.[a[9]] as NodeKind) ?? 'book'
    const useOverride = shelfOverride !== null && kind === 'book'
    return {
      i,
      key,
      kind,
      title: a[0],
      author: p.A[a[1]] ?? '',
      desc: a[10] >= 0 ? (p.D?.[a[10]] ?? '') : '',
      year: a[2],
      cat: (p.C[a[3]] as Category) ?? 'lit',
      star: useOverride
        ? (shelfOverride.has(key) ? (shelfOverride.get(key) ?? 0) : null)
        : a[4] < 0 ? null : a[4],
      shelf: useOverride ? shelfOverride.has(key) : !!a[5],
      x: a[6],
      y: a[7],
      sources: (a[8] ?? []).map((j) => p.S[j]).filter(Boolean),
      degree: 0,
      tier: 'far' as Tier,
    }
  })

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

  // ── 階層を決める ──────────────────────────────
  // 概念 → 読んだ本 → そのどちらかに1ホップで繋がる本 → それ以外
  const core = new Set<number>()
  nodes.forEach((n) => {
    if (n.kind === 'concept') { n.tier = 'concept'; core.add(n.i) }
    else if (n.shelf) { n.tier = 'shelf'; core.add(n.i) }
  })
  for (const i of core) {
    for (const ei of adjacency[i]) {
      const e = edges[ei]
      for (const j of [e.from, e.to]) {
        if (!core.has(j) && nodes[j].tier === 'far') nodes[j].tier = 'linked'
      }
    }
  }

  return {
    nodes, edges, adjacency, meta: p.meta,
    concepts: nodes.filter((n) => n.kind === 'concept').map((n) => n.i),
  }
}

/* ── 表示のためのヘルパー ───────────────────────── */

/** ネットワークのサイズ = 何段目まで出すか */
export const DEPTHS: { id: number; label: string; tiers: Tier[] }[] = [
  { id: 0, label: '概念だけ',   tiers: ['concept'] },
  { id: 1, label: '+ 読んだ本', tiers: ['concept', 'shelf'] },
  { id: 2, label: '+ 紐づく本', tiers: ['concept', 'shelf', 'linked'] },
  { id: 3, label: 'すべて',     tiers: ['concept', 'shelf', 'linked', 'far'] },
]
export const DEFAULT_DEPTH = 2

export function nodeRadius(n: BookNode, scale = 1): number {
  const base =
    n.kind === 'concept' ? 13 + Math.min(n.degree, 12) * 0.45
    : n.shelf ? (n.star ? 4 + n.star * 1.4 : 5.5)
    : 2.4 + Math.min(n.degree, 8) * 0.42
  return base * scale
}

export type ViewMode = 'all' | 'shelf' | 'human'

export function nodeColor(n: BookNode, mode: ViewMode): string {
  if (n.kind === 'concept') return '#a78bfa'
  if (mode === 'shelf' && !n.shelf) return '#232a34'
  if (n.shelf) return n.star !== null ? (STAR_COLOR[n.star] ?? '#6b7382') : '#6b7382'
  return CATEGORY_META[n.cat]?.color ?? '#4b5563'
}

export function baseOpacity(n: BookNode, mode: ViewMode): number {
  if (n.kind === 'concept') return 1
  if (mode === 'shelf') return n.shelf ? 1 : 0.18
  if (n.shelf) return 1
  return n.tier === 'linked' ? 0.62 : 0.42
}

export function starLabel(star: number | null): string {
  if (star === null) return '未読'
  if (star === 0) return '未評価'
  return '★'.repeat(star) + '☆'.repeat(5 - star)
}

export function matchesQuery(n: BookNode, q: string): boolean {
  if (!q) return true
  return (n.title + n.author + n.desc + n.sources.join('')).toLowerCase().includes(q.toLowerCase())
}
