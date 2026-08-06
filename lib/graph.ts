/**
 * グラフのドメインモデル。
 *
 * 2つの軸で構成が決まる:
 *   NodeKind     — 概念か、本か。概念は本より上位の存在。
 *   RelationType — 前提 / 発展 / 別視点 / 反論 / 所属。
 *
 * このプロダクトの中身は、単なる「関連」ではなく関係の種類を区別することにある。
 */

export const RELATIONS = ['member', 'follow', 'overlap', 'pre', 'next', 'alt', 'counter'] as const
export type RelationType = (typeof RELATIONS)[number]

export const RELATION_META: Record<
  RelationType,
  { label: string; color: string; dashed: boolean; directed: boolean; hint: string }
> = {
  member: {
    label: '所属', color: '#a78bfa', dashed: false, directed: false,
    hint: 'この概念に属する本（太さ = 結びつきの平均強度）',
  },
  follow: {
    label: 'フォロー', color: '#f0abfc', dashed: false, directed: true,
    hint: 'アカウント同士の紐付き',
  },
  overlap: {
    label: '重なり', color: '#5eead4', dashed: true, directed: false,
    hint: '同じ本を読んでいる（島と島の橋）',
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

export type NodeKind = 'book' | 'concept' | 'account'

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
  /** 安定キー（正規化タイトル / isbn:xxx）。本棚・紐付けはこのキーで繋がる */
  key: string
  /** DB から来た動的ノードか（NDL検索で実体化した本・ユーザー概念） */
  dynamic?: boolean
  isbn?: string
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
  /** 結びつきの平均強度 1-5。焼き込みエッジは 1（AI提案の初期値） */
  weight?: number
  /** 紐付けた人数 */
  supporters?: number
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

export interface GraphOverlay {
  books: { key: string; title: string; author: string; year: number; cat: string; isbn?: string }[]
  concepts: { key: string; label: string; description: string; official: boolean }[]
  links: { concept: string; book: string; supporters: number; strength: number }[]
  bonds: { from: string; to: string; rel: 'pre' | 'next' | 'alt' | 'counter'; supporters: number; strength: number }[]
}

export function buildGraph(
  p: Payload,
  shelfOverride: ShelfOverride = null,
  overlay: GraphOverlay | null = null
): Graph {
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

  const byKey = new Map(nodes.map((n) => [n.key, n]))

  const edges: Edge[] = p.e.map((e) => ({
    from: e[0],
    to: e[1],
    type: (p.T[e[2]] as RelationType) ?? 'alt',
    why: p.W[e[3]] ?? '',
    weight: 1,
  }))

  if (overlay) {
    // 焼き込みに無い動的ノードを追加（配置はライブ物理に任せるので座標はゼロ近傍でよい）
    const addNode = (partial: Omit<BookNode, 'i' | 'degree' | 'tier' | 'x' | 'y' | 'sources'>) => {
      const node: BookNode = {
        ...partial,
        i: nodes.length,
        x: (Math.random() - 0.5) * 120,
        y: (Math.random() - 0.5) * 120,
        sources: [],
        degree: 0,
        tier: 'far',
      }
      nodes.push(node)
      byKey.set(node.key, node)
      return node
    }
    for (const c of overlay.concepts) {
      if (byKey.has(c.key)) continue
      addNode({
        key: c.key, dynamic: true, kind: 'concept', title: c.label, author: '',
        desc: c.description, year: 0, cat: 'phil' as Category, star: null, shelf: false,
      })
    }
    for (const b of overlay.books) {
      if (byKey.has(b.key)) continue
      const star = shelfOverride?.has(b.key) ? (shelfOverride.get(b.key) ?? 0) : null
      addNode({
        key: b.key, dynamic: true, isbn: b.isbn, kind: 'book', title: b.title, author: b.author,
        desc: '', year: b.year, cat: (b.cat as Category) ?? 'lit',
        star, shelf: shelfOverride?.has(b.key) ?? false,
      })
    }
    // 紐付け（投票）を所属エッジに反映。既存エッジは重みを上書き、無ければ新設
    const edgeIndex = new Map<string, Edge>()
    for (const e of edges) {
      if (e.type === 'member') edgeIndex.set(`${nodes[e.from].key}::${nodes[e.to].key}`, e)
    }
    for (const l of overlay.links) {
      const c = byKey.get(l.concept)
      const b = byKey.get(l.book)
      if (!c || !b) continue
      const why = `${l.supporters}人 / 強さ 平均 ${l.strength}`
      const existing = edgeIndex.get(`${l.concept}::${l.book}`)
      if (existing) {
        // 票がある場合は平均強度で置き換える（焼き込みの weight=1 は AI 初期値）
        existing.weight = l.strength
        existing.supporters = l.supporters
        existing.why = why
      } else {
        edges.push({
          from: c.i, to: b.i, type: 'member',
          why, weight: l.strength, supporters: l.supporters,
        })
      }
    }
    // 本と本の紐付け（前提/続き/似ている/反論 — 地図の共通語彙で描く）
    for (const bond of overlay.bonds) {
      const a = byKey.get(bond.from)
      const b = byKey.get(bond.to)
      if (!a || !b) continue
      edges.push({
        from: a.i, to: b.i, type: bond.rel,
        why: `${bond.supporters}人 / 強さ 平均 ${bond.strength}`,
        weight: bond.strength, supporters: bond.supporters,
      })
    }

    // ── 同じ著者・同シリーズの自動接続（後から実体化した本にも適用） ──
    const normAuthor = (a: string) =>
      a.replace(/[\s・,、.=＝]/g, '').toLowerCase().slice(0, 8)
    const titleRoot = (t: string) =>
      t.replace(/[\s　]/g, '').replace(/(上|下|中|[0-9０-９]{1,3}|[ivxIVX]{1,4})$/, '').toLowerCase()
    const dyn = nodes.filter((n) => n.dynamic && n.kind === 'book')
    for (const d of dyn) {
      if (!d.author || d.author === '—') continue
      const dA = normAuthor(d.author)
      const dRoot = titleRoot(d.title)
      for (const n of nodes) {
        if (n.i === d.i || n.kind !== 'book') continue
        if (n.author && n.author !== '—' && dA.length >= 3 && normAuthor(n.author) === dA) {
          if (dRoot.length >= 3 && titleRoot(n.title) === dRoot) {
            edges.push({ from: n.i, to: d.i, type: 'next', why: '同シリーズ（自動接続）', weight: 1 })
          } else {
            edges.push({ from: n.i, to: d.i, type: 'alt', why: `同じ著者（${d.author}・自動接続）`, weight: 1 })
          }
        }
      }
    }
    // 動的概念ノードの初期位置は、紐付いた本の重心の近くへ
    for (const n of nodes) {
      if (!n.dynamic) continue
      const linked = [
        ...overlay.links.filter((l) => l.concept === n.key || l.book === n.key)
          .map((l) => ({ other: l.concept === n.key ? l.book : l.concept })),
        ...overlay.bonds.filter((l) => l.from === n.key || l.to === n.key)
          .map((l) => ({ other: l.from === n.key ? l.to : l.from })),
      ]
      const anchors = linked
        .map((l) => byKey.get(l.other))
        .filter((a): a is BookNode => !!a && !a.dynamic)
      if (anchors.length) {
        n.x = anchors.reduce((s2, a) => s2 + a.x, 0) / anchors.length + (Math.random() - 0.5) * 60
        n.y = anchors.reduce((s2, a) => s2 + a.y, 0) / anchors.length + (Math.random() - 0.5) * 60
      }
    }
  }

  const adjacency: number[][] = nodes.map(() => [])
  edges.forEach((e, i) => {
    adjacency[e.from].push(i)
    adjacency[e.to].push(i)
    nodes[e.from].degree++
    nodes[e.to].degree++
  })

  // ── 階層を決める ────────────────────────
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

/* ── 表示のためのヘルパー ───────────────────── */

/** ネットワークのサイズ = 何段目まで出すか */
export const DEPTHS: { id: number; label: string; tiers: Tier[] }[] = [
  { id: 0, label: '概念だけ',   tiers: ['concept'] },
  { id: 1, label: '+ 読んだ本', tiers: ['concept', 'shelf'] },
  { id: 2, label: '+ 紐づく本', tiers: ['concept', 'shelf', 'linked'] },
  { id: 3, label: 'すべて',     tiers: ['concept', 'shelf', 'linked', 'far'] },
]
export const DEFAULT_DEPTH = 2

export function nodeRadius(n: BookNode, scale = 1, boost = 0): number {
  const base =
    n.kind === 'account' ? 16 + Math.min(n.degree, 20) * 0.3
    : n.kind === 'concept' ? 13 + Math.min(n.degree, 12) * 0.45
    : n.shelf ? (n.star ? 4 + n.star * 1.4 : 5.5)
    : 2.4 + Math.min(n.degree, 8) * 0.42
  // boost = そのノードに集まった紐付け人数。多いほど育つ（対数で頭打ち）
  return (base + Math.log2(1 + boost) * 2.2) * scale
}

export type ViewMode = 'all' | 'shelf' | 'human'

export function nodeColor(n: BookNode, mode: ViewMode): string {
  if (n.kind === 'account') return '#f0abfc'
  if (n.kind === 'concept') return '#a78bfa'
  if (mode === 'shelf' && !n.shelf) return '#232a34'
  if (n.shelf) return n.star !== null ? (STAR_COLOR[n.star] ?? '#6b7382') : '#6b7382'
  return CATEGORY_META[n.cat]?.color ?? '#4b5563'
}

export function baseOpacity(n: BookNode, mode: ViewMode): number {
  if (n.kind === 'account') return 1
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


/* ── フォローの島 ───────────────────────────────
   自分の全体図はそのまま中央に。フォローしている人の地図は
   「島」として周縁に常在し、パン／ズームで遗びに行ける。
   図は分ける（島ごとに別ノード）。重なりは島と島の橋で見せる。 */

export interface SocialInput {
  me: { id: string; username: string }
  accounts: { id: string; username: string }[]
  follows: { follower: string; followee: string }[]
  /** userId → (bookKey → star) */
  shelves: Map<string, Map<string, number>>
  /** bookKey → タイトル解決用 */
  titles: Map<string, { title: string; cat: string }>
}

export function attachFollowIslands(base: Graph, input: SocialInput): Graph {
  const nodes = base.nodes
  const edges = base.edges
  const byKey = new Map(nodes.map((n) => [n.key, n.i]))
  const acctIndex = new Map<string, number>()

  const add = (n: Omit<BookNode, 'i' | 'degree' | 'sources'>) => {
    const node: BookNode = { ...n, i: nodes.length, degree: 0, sources: [] }
    nodes.push(node)
    byKey.set(node.key, node.i)
    return node
  }

  // 自分のアンカー（地図の中央）。ここからフォロー線が伸びる
  const me = add({
    key: `acct:${input.me.id}`, kind: 'account', dynamic: true,
    title: `${input.me.username}（あなた）`, author: '', desc: '', year: 0,
    cat: 'phil' as Category, star: null, shelf: false, x: 0, y: 0, tier: 'concept',
  })
  acctIndex.set(input.me.id, me.i)

  const others = input.accounts.filter((a) => a.id !== input.me.id)
  others.forEach((person, pi) => {
    // 自分の図（＋900）の外側に島を置く
    const ang = (pi / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2
    const cx = Math.cos(ang) * 1700
    const cy = Math.sin(ang) * 1380
    const acct = add({
      key: `acct:${person.id}`, kind: 'account', dynamic: true,
      title: person.username, author: '', desc: '', year: 0,
      cat: 'phil' as Category, star: null, shelf: false, x: cx, y: cy, tier: 'concept',
    })
    acctIndex.set(person.id, acct.i)

    const shelf = input.shelves.get(person.id) ?? new Map<string, number>()
    let bi = 0
    for (const [bookKey, star] of shelf) {
      const meta = input.titles.get(bookKey)
      const golden = bi * 2.39996
      const r = 80 + (bi % 6) * 24
      const book = add({
        key: `${person.id}::${bookKey}`, kind: 'book', dynamic: true,
        title: meta?.title ?? bookKey.replace(/^isbn:/, ''), author: '', desc: '', year: 0,
        cat: (meta?.cat as Category) ?? 'lit', star, shelf: true,
        x: cx + Math.cos(golden) * r, y: cy + Math.sin(golden) * r, tier: 'shelf',
      })
      edges.push({ from: acct.i, to: book.i, type: 'member', why: `${person.username} の本棚`, weight: 1 })
      // 重なり: 自分の地図に同じ本があれば橋を架ける
      const mine = byKey.get(bookKey)
      if (mine !== undefined && !nodes[mine].dynamic) {
        edges.push({ from: mine, to: book.i, type: 'overlap', why: '同じ本を読んでいる', weight: 1 })
      }
      bi++
    }
  })

  for (const f of input.follows) {
    const a = acctIndex.get(f.follower)
    const b = acctIndex.get(f.followee)
    if (a === undefined || b === undefined) continue
    edges.push({ from: a, to: b, type: 'follow', why: 'フォローしている', weight: 3 })
  }

  const adjacency: number[][] = nodes.map(() => [])
  for (const n of nodes) n.degree = 0
  edges.forEach((e, i) => {
    adjacency[e.from].push(i)
    adjacency[e.to].push(i)
    nodes[e.from].degree++
    nodes[e.to].degree++
  })
  return { ...base, nodes, edges, adjacency, meta: { ...base.meta, nodes: nodes.length, edges: edges.length } }
}
