/**
 * ライブの力学シミュレーション。
 *
 * 事前計算した座標を「ホームポジション」として持ちつつ、
 * ブラウザ側でも毎フレーム力を解き続ける。Obsidian のグラフビューのように、
 * 触ると全体がゆっくり追従して、放すと落ち着く感触を作るのが目的。
 *
 * 速度のために:
 *   - 位置・速度は Float32Array（オブジェクト経由のプロパティ参照を避ける）
 *   - 反発力は一様グリッドで近傍だけ（全ペアだと 1000 ノードで 100 万回/フレーム）
 */
import type { Graph, RelationType } from './graph'

const REST_LENGTH: Record<RelationType, number> = {
  member: 46,
  next: 34,
  pre: 58,
  alt: 78,
  counter: 92,
}
const LINK_STRENGTH: Record<RelationType, number> = {
  member: 0.09,
  next: 0.07,
  pre: 0.06,
  alt: 0.022,
  counter: 0.03,
}

export interface SimOptions {
  /** 速度の残り具合。1に近いほど「ぬるっ」と流れる */
  damping: number
  /** 反発の強さ */
  repulsion: number
  /** ホームポジションへ戻ろうとする力。0 なら完全に自由 */
  homing: number
}

export const DEFAULT_SIM: SimOptions = { damping: 0.86, repulsion: 210, homing: 0.008 }

export class Simulation {
  readonly n: number
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  /** 事前計算された「あるべき場所」 */
  hx: Float32Array
  hy: Float32Array
  /** 表示上の不透明度。目標値へ毎フレーム寄せることで滑らかに明滅する */
  alpha: Float32Array
  alphaTarget: Float32Array
  /** 半径（衝突と反発の重み付けに使う） */
  radius: Float32Array

  active: Uint8Array
  activeList: number[] = []
  private edges: { a: number; b: number; rest: number; k: number }[] = []

  /** 0..1。大きいほどよく動く。触ると上がり、放っておくと下がる */
  energy = 1
  opts: SimOptions
  dragging = -1

  private cell = 64
  private buckets = new Map<number, number[]>()

  constructor(graph: Graph, opts: Partial<SimOptions> = {}) {
    this.opts = { ...DEFAULT_SIM, ...opts }
    this.n = graph.nodes.length
    const n = this.n
    this.x = new Float32Array(n)
    this.y = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.hx = new Float32Array(n)
    this.hy = new Float32Array(n)
    this.alpha = new Float32Array(n)
    this.alphaTarget = new Float32Array(n)
    this.radius = new Float32Array(n)
    this.active = new Uint8Array(n)
    graph.nodes.forEach((node, i) => {
      this.x[i] = this.hx[i] = node.x
      this.y[i] = this.hy[i] = node.y
      this.radius[i] = 4
      this.alpha[i] = this.alphaTarget[i] = 1
    })
  }

  setRadii(fn: (i: number) => number) {
    for (let i = 0; i < this.n; i++) this.radius[i] = fn(i)
  }

  /**
   * 表示対象を差し替える。既に表示されているノードは位置を保つので、
   * 絞り込みを変えても地図が飛ばない。新しく現れたノードはホームから入場する。
   */
  setVisible(graph: Graph, nodeIds: Set<number>, edgeIds: number[]) {
    for (let i = 0; i < this.n; i++) {
      const on = nodeIds.has(i) ? 1 : 0
      if (on && !this.active[i]) {
        // 入場時はホーム位置から。速度はリセット
        this.x[i] = this.hx[i]
        this.y[i] = this.hy[i]
        this.vx[i] = this.vy[i] = 0
      }
      this.active[i] = on
    }
    this.activeList = [...nodeIds]
    this.edges = edgeIds.map((ei) => {
      const e = graph.edges[ei]
      return { a: e.from, b: e.to, rest: REST_LENGTH[e.type], k: LINK_STRENGTH[e.type] }
    })
    this.reheat(0.9)
  }

  reheat(e = 0.7) {
    this.energy = Math.max(this.energy, e)
  }

  setAlphaTargets(fn: (i: number) => number) {
    for (const i of this.activeList) this.alphaTarget[i] = fn(i)
  }

  /** 表示用の透明度だけを滑らかに追従させる（力学が止まっていても動かす） */
  tweenAlpha(): boolean {
    let moving = false
    for (const i of this.activeList) {
      const d = this.alphaTarget[i] - this.alpha[i]
      if (Math.abs(d) > 0.004) {
        this.alpha[i] += d * 0.18
        moving = true
      } else this.alpha[i] = this.alphaTarget[i]
    }
    return moving
  }

  private rebuildGrid() {
    this.buckets.clear()
    const c = this.cell
    for (const i of this.activeList) {
      const key = (Math.floor(this.x[i] / c) << 16) ^ (Math.floor(this.y[i] / c) & 0xffff)
      const b = this.buckets.get(key)
      if (b) b.push(i)
      else this.buckets.set(key, [i])
    }
  }

  /** 1フレーム進める。まだ動いているなら true */
  step(): boolean {
    const alphaMoving = this.tweenAlpha()
    if (this.energy < 0.012 && this.dragging < 0) return alphaMoving

    const { damping, repulsion, homing } = this.opts
    const e = this.energy
    const { x, y, vx, vy, radius } = this
    this.rebuildGrid()
    const c = this.cell

    // ── 反発（近傍セルのみ）─────────────────────
    for (const i of this.activeList) {
      const gx = Math.floor(x[i] / c)
      const gy = Math.floor(y[i] / c)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const b = this.buckets.get(((gx + ox) << 16) ^ ((gy + oy) & 0xffff))
          if (!b) continue
          for (let bi = 0; bi < b.length; bi++) {
            const j = b[bi]
            if (j <= i) continue
            let dx = x[j] - x[i]
            let dy = y[j] - y[i]
            let d2 = dx * dx + dy * dy
            if (d2 > 16384 || d2 === 0) {
              if (d2 === 0) { dx = 0.5; dy = 0.5; d2 = 0.5 } else continue
            }
            const min = radius[i] + radius[j] + 8
            // 半径が大きいノード（＝概念）は強く押しのける
            const w = (repulsion * e * (1 + (radius[i] + radius[j]) * 0.06)) / d2
            let fx = dx * w
            let fy = dy * w
            // めり込みは直接押し返す
            const d = Math.sqrt(d2)
            if (d < min) {
              const push = ((min - d) / d) * 0.4
              fx += dx * push
              fy += dy * push
            }
            vx[i] -= fx; vy[i] -= fy
            vx[j] += fx; vy[j] += fy
          }
        }
      }
    }

    // ── リンク（バネ）───────────────────────
    for (let k = 0; k < this.edges.length; k++) {
      const { a, b, rest, k: ks } = this.edges[k]
      const dx = x[b] - x[a]
      const dy = y[b] - y[a]
      const d = Math.hypot(dx, dy) || 0.001
      const f = ((d - rest) / d) * ks * e
      const fx = dx * f
      const fy = dy * f
      vx[a] += fx; vy[a] += fy
      vx[b] -= fx; vy[b] -= fy
    }

    // ── ホームへの引き戻し + 積分 ──────────────
    let maxSpeed = 0
    for (const i of this.activeList) {
      if (i === this.dragging) { vx[i] = vy[i] = 0; continue }
      if (homing > 0) {
        vx[i] += (this.hx[i] - x[i]) * homing * e
        vy[i] += (this.hy[i] - y[i]) * homing * e
      }
      vx[i] *= damping
      vy[i] *= damping
      x[i] += vx[i]
      y[i] += vy[i]
      const s = Math.abs(vx[i]) + Math.abs(vy[i])
      if (s > maxSpeed) maxSpeed = s
    }

    this.energy *= 0.985
    if (maxSpeed < 0.02 && this.dragging < 0) this.energy *= 0.9
    return true
  }

  startDrag(i: number) {
    this.dragging = i
    this.reheat(1)
  }
  moveDrag(wx: number, wy: number) {
    if (this.dragging < 0) return
    this.x[this.dragging] = wx
    this.y[this.dragging] = wy
    this.reheat(0.85)
  }
  endDrag() {
    this.dragging = -1
    this.reheat(0.5)
  }
}
