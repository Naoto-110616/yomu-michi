/**
 * Canvas への描画。React の外に切り出してある。
 * 1000 ノード規模を毎フレーム再レンダリングするので、
 * DOM を経由せず ctx に直接描く方が圧倒的に軽い。
 */
import {
  CATEGORY_META, RELATION_META, matchesQuery, nodeColor, nodeOpacity, nodeRadius,
  type Category, type Edge, type Graph, type RelationType, type ViewMode,
} from './graph'

export interface Transform { x: number; y: number; k: number }

export interface RenderState {
  graph: Graph
  transform: Transform
  width: number
  height: number
  dpr: number
  mode: ViewMode
  edgeTypes: Set<RelationType>
  categories: Set<Category>
  query: string
  selected: number | null
}

const BG = '#0b0d11'

export function isEdgeVisible(e: Edge, s: RenderState): boolean {
  if (!s.edgeTypes.has(e.type)) return false
  if (s.mode === 'human' && e.type === 'alt') return false
  const { nodes } = s.graph
  return s.categories.has(nodes[e.from].cat) && s.categories.has(nodes[e.to].cat)
}

/** 選択ノードとその隣接（見えているエッジ経由のみ） */
export function neighborhood(s: RenderState): Set<number> | null {
  if (s.selected === null) return null
  const set = new Set<number>([s.selected])
  for (const ei of s.graph.adjacency[s.selected]) {
    const e = s.graph.edges[ei]
    if (!isEdgeVisible(e, s)) continue
    set.add(e.from)
    set.add(e.to)
  }
  return set
}

export function render(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { graph, transform: T, width: W, height: H, dpr } = s
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(T.x, T.y)
  ctx.scale(T.k, T.k)

  const near = neighborhood(s)
  const k = Math.max(T.k, 0.28)

  // ── エッジ ───────────────────
  for (const e of graph.edges) {
    if (!isEdgeVisible(e, s)) continue
    const A = graph.nodes[e.from]
    const B = graph.nodes[e.to]
    const meta = RELATION_META[e.type]
    const lit = !near || (near.has(e.from) && near.has(e.to))
    if (!lit && near && s.mode !== 'human') continue

    ctx.globalAlpha = lit ? (e.type === 'alt' ? 0.42 : 0.9) : 0.03
    ctx.strokeStyle = meta.color
    ctx.lineWidth = (e.type === 'alt' ? 0.85 : 1.8) / k
    ctx.setLineDash(meta.dashed ? [3 / k, 3.5 / k] : [])
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(B.x, B.y)
    ctx.stroke()
    ctx.setLineDash([])

    if (meta.directed && !meta.dashed && lit) {
      const dx = B.x - A.x
      const dy = B.y - A.y
      const d = Math.hypot(dx, dy) || 1
      const ux = dx / d
      const uy = dy / d
      const tip = nodeRadius(B) + 2.5
      const ax = B.x - ux * tip
      const ay = B.y - uy * tip
      const sz = 5.5 / k
      ctx.fillStyle = meta.color
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - ux * sz - uy * sz * 0.5, ay - uy * sz + ux * sz * 0.5)
      ctx.lineTo(ax - ux * sz + uy * sz * 0.5, ay - uy * sz - ux * sz * 0.5)
      ctx.closePath()
      ctx.fill()
    }
  }

  // ── ノード ───────────────────
  for (const n of graph.nodes) {
    if (!s.categories.has(n.cat)) continue
    const lit = (!near || near.has(n.i)) && matchesQuery(n, s.query)
    ctx.globalAlpha = lit ? nodeOpacity(n, s.mode) : 0.05
    ctx.beginPath()
    ctx.arc(n.x, n.y, nodeRadius(n), 0, Math.PI * 2)
    ctx.fillStyle = nodeColor(n, s.mode)
    ctx.fill()
    if (n.shelf) {
      ctx.lineWidth = 1.1 / k
      ctx.strokeStyle = 'rgba(255,255,255,.55)'
      ctx.stroke()
    }
    if (n.i === s.selected) {
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(n.x, n.y, nodeRadius(n) + 5, 0, Math.PI * 2)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 / k
      ctx.stroke()
    }
  }

  // ── ラベル（優先度順に置いて、重なったら捨てる） ──────────
  const boxes: [number, number, number, number][] = []
  const free = (a: number, b: number, c: number, d: number) => {
    for (const r of boxes) if (a < r[2] && c > r[0] && b < r[3] && d > r[1]) return false
    boxes.push([a, b, c, d])
    return true
  }
  const priority = (i: number) => {
    const n = graph.nodes[i]
    if (i === s.selected) return 0
    if (near?.has(i)) return 1
    if (s.query && matchesQuery(n, s.query)) return 1
    if (n.shelf) return n.star === 5 ? 2 : 3
    return 6 - Math.min(n.degree, 5)
  }
  const candidates = graph.nodes
    .filter(
      (n) =>
        s.categories.has(n.cat) &&
        (!near || near.has(n.i)) &&
        matchesQuery(n, s.query) &&
        (near !== null || !!s.query || n.shelf || T.k > 0.55 || n.degree >= 6)
    )
    .sort((a, b) => priority(a.i) - priority(b.i))
    .slice(0, 260)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 1
  for (const n of candidates) {
    const big = n.i === s.selected || !!near?.has(n.i) || (n.shelf && n.star === 5)
    const fs = (big ? 10.5 : 8.8) / Math.max(T.k, 0.5)
    ctx.font = `${big ? 700 : 500} ${fs}px -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif`
    const text = n.title.length > 15 ? n.title.slice(0, 14) + '…' : n.title
    const w = ctx.measureText(text).width
    const h = fs * 1.25
    const y = n.y - nodeRadius(n) - 3 / T.k
    if (!free(n.x - w / 2 - 1, y - h, n.x + w / 2 + 1, y + 2)) continue
    ctx.lineWidth = 3.2 / Math.max(T.k, 0.5)
    ctx.strokeStyle = BG
    ctx.strokeText(text, n.x, y)
    ctx.fillStyle = n.i === s.selected ? '#fff' : n.shelf ? '#eef1f5' : '#98a1af'
    ctx.fillText(text, n.x, y)
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

/* ── 座標変換 / ヒットテスト ───────────────── */

export const toWorld = (T: Transform, sx: number, sy: number) => ({
  x: (sx - T.x) / T.k,
  y: (sy - T.y) / T.k,
})

export function hitTest(s: RenderState, sx: number, sy: number): number | null {
  const w = toWorld(s.transform, sx, sy)
  let best: number | null = null
  let bestD = Infinity
  for (const n of s.graph.nodes) {
    if (!s.categories.has(n.cat)) continue
    const d = Math.hypot(n.x - w.x, n.y - w.y)
    const reach = Math.max(nodeRadius(n) + 7 / s.transform.k, 13 / s.transform.k)
    if (d < reach && d < bestD) {
      bestD = d
      best = n.i
    }
  }
  return best
}

/** 指定ノード群が、パネルに隠れない領域に収まる Transform を返す */
export function fitTransform(
  s: RenderState,
  ids: Iterable<number>,
  opts: { panelSide: 'right' | 'bottom' | 'none'; panelSize: number }
): Transform {
  const ns = [...ids].map((i) => s.graph.nodes[i])
  if (!ns.length) return s.transform
  const minX = Math.min(...ns.map((n) => n.x))
  const maxX = Math.max(...ns.map((n) => n.x))
  const minY = Math.min(...ns.map((n) => n.y))
  const maxY = Math.max(...ns.map((n) => n.y))
  const vw = opts.panelSide === 'right' ? Math.max(200, s.width - opts.panelSize) : s.width
  const vh = opts.panelSide === 'bottom' ? Math.max(160, s.height - opts.panelSize) : s.height
  const pad = 70
  const k = Math.max(
    0.3,
    Math.min(2.2, Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2)))
  )
  return { k, x: vw / 2 - ((minX + maxX) / 2) * k, y: vh / 2 - ((minY + maxY) / 2) * k }
}

export const CATEGORY_COLORS = CATEGORY_META
