/**
 * Canvas への描画。位置は Simulation が持つ Float32Array から直接読む。
 * React の再レンダリングとは完全に切り離してある。
 */
import {
  CATEGORY_META, RELATION_META, baseOpacity, matchesQuery, nodeColor, nodeRadius,
  type Category, type Graph, type RelationType, type ViewMode,
} from './graph'
import type { Simulation } from './simulation'

export interface Transform { x: number; y: number; k: number }

export interface RenderState {
  graph: Graph
  sim: Simulation
  transform: Transform
  width: number
  height: number
  dpr: number
  mode: ViewMode
  edgeTypes: Set<RelationType>
  categories: Set<Category>
  query: string
  selected: number | null
  hovered: number | null
  visibleEdges: number[]
  nodeScale: number
}

const BG = '#0b0d11'

export function render(ctx: CanvasRenderingContext2D, s: RenderState) {
  const { graph, sim, transform: T, width: W, height: H, dpr } = s
  const { x, y, alpha } = sim

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(T.x, T.y)
  ctx.scale(T.k, T.k)

  const k = Math.max(T.k, 0.25)
  const focus = s.selected ?? s.hovered

  // ── エッジ ─────────────────────────────
  for (const ei of s.visibleEdges) {
    const e = graph.edges[ei]
    const meta = RELATION_META[e.type]
    const a = Math.min(alpha[e.from], alpha[e.to])
    if (a < 0.02) continue

    const strong = e.type !== 'alt'
    ctx.globalAlpha = a * (e.type === 'alt' ? 0.36 : e.type === 'member' ? 0.55 : 0.85)
    ctx.strokeStyle = meta.color
    ctx.lineWidth = (e.type === 'alt' ? 0.8 : e.type === 'member' ? 1.1 : 1.7) / k
    ctx.setLineDash(meta.dashed ? [3 / k, 3.5 / k] : [])
    ctx.beginPath()
    ctx.moveTo(x[e.from], y[e.from])
    ctx.lineTo(x[e.to], y[e.to])
    ctx.stroke()
    ctx.setLineDash([])

    if (meta.directed && !meta.dashed && strong && a > 0.5) {
      const dx = x[e.to] - x[e.from]
      const dy = y[e.to] - y[e.from]
      const d = Math.hypot(dx, dy) || 1
      const ux = dx / d
      const uy = dy / d
      const tip = nodeRadius(graph.nodes[e.to], s.nodeScale) + 2.5
      const ax = x[e.to] - ux * tip
      const ay = y[e.to] - uy * tip
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

  // ── ノード ─────────────────────────────
  for (const i of sim.activeList) {
    const n = graph.nodes[i]
    const a = alpha[i]
    if (a < 0.02) continue
    const r = nodeRadius(n, s.nodeScale)
    ctx.globalAlpha = a

    if (n.kind === 'concept') {
      // 概念はうっすら光らせて、本より上位であることを見せる
      const g = ctx.createRadialGradient(x[i], y[i], r * 0.3, x[i], y[i], r * 2.4)
      g.addColorStop(0, 'rgba(167,139,250,.30)')
      g.addColorStop(1, 'rgba(167,139,250,0)')
      ctx.globalAlpha = a * 0.9
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x[i], y[i], r * 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = a
    }

    ctx.beginPath()
    ctx.arc(x[i], y[i], r, 0, Math.PI * 2)
    ctx.fillStyle = nodeColor(n, s.mode)
    ctx.fill()

    if (n.kind === 'concept') {
      ctx.lineWidth = 1.6 / k
      ctx.strokeStyle = '#ddd6fe'
      ctx.stroke()
    } else if (n.shelf) {
      ctx.lineWidth = 1.1 / k
      ctx.strokeStyle = 'rgba(255,255,255,.5)'
      ctx.stroke()
    }

    if (i === focus) {
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(x[i], y[i], r + 6 / k, 0, Math.PI * 2)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 / k
      ctx.stroke()
    }
  }

  // ── ラベル（優先度順・衝突したら捨てる）──────────
  const boxes: [number, number, number, number][] = []
  const free = (a: number, b: number, c: number, d: number) => {
    for (const r of boxes) if (a < r[2] && c > r[0] && b < r[3] && d > r[1]) return false
    boxes.push([a, b, c, d])
    return true
  }
  const priority = (i: number) => {
    const n = graph.nodes[i]
    if (i === focus) return 0
    if (n.kind === 'concept') return 1
    if (s.query && matchesQuery(n, s.query)) return 2
    if (n.shelf) return n.star === 5 ? 3 : 4
    return 8 - Math.min(n.degree, 5)
  }
  const cand = sim.activeList
    .filter((i) => {
      const n = graph.nodes[i]
      if (alpha[i] < 0.35) return false
      return n.kind === 'concept' || n.shelf || T.k > 0.5 || n.degree >= 6 || i === focus
    })
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, 240)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineJoin = 'round'
  for (const i of cand) {
    const n = graph.nodes[i]
    const isConcept = n.kind === 'concept'
    const big = isConcept || i === focus || (n.shelf && n.star === 5)
    const fs = (isConcept ? 12.5 : big ? 10.5 : 8.8) / Math.max(T.k, 0.5)
    ctx.font = `${big ? 700 : 500} ${fs}px -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif`
    const text = n.title.length > 16 ? n.title.slice(0, 15) + '…' : n.title
    const w = ctx.measureText(text).width
    const h = fs * 1.25
    const yy = y[i] - nodeRadius(n, s.nodeScale) - 4 / T.k
    if (!free(x[i] - w / 2 - 1, yy - h, x[i] + w / 2 + 1, yy + 2)) continue
    ctx.globalAlpha = alpha[i]
    ctx.lineWidth = 3.4 / Math.max(T.k, 0.5)
    ctx.strokeStyle = BG
    ctx.strokeText(text, x[i], yy)
    ctx.fillStyle = isConcept ? '#e9d5ff' : i === focus ? '#fff' : n.shelf ? '#eef1f5' : '#98a1af'
    ctx.fillText(text, x[i], yy)
  }

  ctx.restore()
  ctx.globalAlpha = 1
}

/* ── 座標変換 / ヒットテスト ───────────────────────── */

export const toWorld = (T: Transform, sx: number, sy: number) => ({
  x: (sx - T.x) / T.k,
  y: (sy - T.y) / T.k,
})

export function hitTest(s: RenderState, sx: number, sy: number): number | null {
  const w = toWorld(s.transform, sx, sy)
  const { x, y, alpha } = s.sim
  let best: number | null = null
  let bestD = Infinity
  for (const i of s.sim.activeList) {
    if (alpha[i] < 0.25) continue
    const d = Math.hypot(x[i] - w.x, y[i] - w.y)
    const reach = Math.max(nodeRadius(s.graph.nodes[i], s.nodeScale) + 8 / s.transform.k, 14 / s.transform.k)
    if (d < reach && d < bestD) { bestD = d; best = i }
  }
  return best
}

export function fitTransform(
  s: RenderState,
  ids: Iterable<number>,
  opts: { panelSide: 'right' | 'bottom' | 'none'; panelSize: number }
): Transform {
  const list = [...ids]
  if (!list.length) return s.transform
  const { x, y } = s.sim
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const i of list) {
    minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i])
    minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i])
  }
  const vw = opts.panelSide === 'right' ? Math.max(200, s.width - opts.panelSize) : s.width
  const vh = opts.panelSide === 'bottom' ? Math.max(160, s.height - opts.panelSize) : s.height
  const pad = 80
  const k = Math.max(
    0.25,
    Math.min(2.0, Math.min(vw / (maxX - minX + pad * 2), vh / (maxY - minY + pad * 2)))
  )
  return { k, x: vw / 2 - ((minX + maxX) / 2) * k, y: vh / 2 - ((minY + maxY) / 2) * k }
}

export const CATEGORY_COLORS = CATEGORY_META
