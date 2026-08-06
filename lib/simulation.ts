/**
 * ライブの力学シミュレーション（d3-force 版）。
 *
 * Obsidian のグラフビューの挙動を再現する:
 *   - 通常時は alpha が単調に減衰して「静かに」止まる。振動しない。
 *   - ノードを掴んでいる間だけ alphaTarget を 0.3 に上げ、
 *     掴んだノードは fx/fy でポインタに固定、まわりがバネで追従する。
 *   - 離すと alphaTarget を 0 に戻し、余韻を残してゆっくり沈静化する。
 *   - ホバーや選択では物理を一切動かさない（動かすと震える）。
 *
 * 以前の自作エンジンは「ホーム位置へ戻る力」と「バネ」と「衝突の押し戻し」が
 * 拮抗して平衡点まわりで振動していた。d3-force は速度減衰と alpha 減衰の
 * 二重減衰で必ず静止に向かうので、この問題が構造的に起きない。
 *
 * d3 内蔵のタイマーは使わず、外の描画ループから tick() を手で呼ぶ。
 */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation as D3Simulation,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Graph, RelationType } from './graph'

export interface SimNode extends SimulationNodeDatum {
  id: number
  x: number
  y: number
  /** 事前計算されたホームポジション（弱い引力の目標） */
  hx: number
  hy: number
  /** 半径（衝突判定に使う） */
  r: number
}

interface SimLink {
  source: SimNode | number
  target: SimNode | number
  type: RelationType
}

/** バネの自然長。所属（概念→本）は短く、対立は長く */
const DISTANCE: Record<RelationType, number> = {
  member: 48, next: 34, pre: 60, alt: 84, counter: 98,
}
/** バネの強さ。別視点は弱くして「うっすら引き合う」程度に */
const STRENGTH: Record<RelationType, number> = {
  member: 0.5, next: 0.45, pre: 0.32, alt: 0.06, counter: 0.1,
}

const ALPHA_MIN = 0.004

export class Simulation {
  /** 全ノード。graph の index と同じ並び。d3 が x/y を直接書き換える */
  readonly all: SimNode[]
  /** 表示用の不透明度（物理とは独立に毎フレーム目標へ寄せる） */
  fade: Float32Array
  private fadeTarget: Float32Array

  active: Uint8Array
  activeList: number[] = []
  dragging = -1

  private sim: D3Simulation<SimNode, never>
  private linkForce = forceLink<SimNode, SimLink>()
    .id((d) => d.id)
    .distance((l) => DISTANCE[l.type])
    .strength((l) => STRENGTH[l.type])

  constructor(graph: Graph, inherit?: Simulation) {
    const n = graph.nodes.length
    this.all = graph.nodes.map((node, i) => {
      const prev = inherit && inherit.all.length === n ? inherit.all[i] : null
      return {
        id: i,
        x: prev ? prev.x : node.x,
        y: prev ? prev.y : node.y,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        hx: node.x,
        hy: node.y,
        r: 4,
      }
    })
    this.fade = new Float32Array(n).fill(1)
    this.fadeTarget = new Float32Array(n).fill(1)
    if (inherit && inherit.fade.length === n) {
      this.fade.set(inherit.fade)
    }
    this.active = new Uint8Array(n)

    this.sim = forceSimulation<SimNode>()
      .stop() // 内蔵タイマーは使わない
      .alphaMin(ALPHA_MIN)
      .alphaDecay(0.02)      // 沈静化の速さ。小さいほど長く漂う
      .velocityDecay(0.38)   // 摩擦。Obsidian 的なぬるっとした流れ
      .force('link', this.linkForce as never)
      .force('charge', forceManyBody<SimNode>().strength(-55).distanceMax(340).theta(0.9))
      .force('collide', forceCollide<SimNode>((d) => d.r + 3).strength(0.7))
      // ホームへの弱い引力。クラスタ構造を保ちつつ、バネと喧嘩しない強さ
      .force('homeX', forceX<SimNode>((d) => d.hx).strength(0.035))
      .force('homeY', forceY<SimNode>((d) => d.hy).strength(0.035))
  }

  setRadii(fn: (i: number) => number) {
    for (const node of this.all) node.r = fn(node.id)
  }

  /**
   * 表示対象を差し替える。表示中のノードは位置を保つので絞り込みで地図が飛ばない。
   * 新しく現れるノードはホーム位置から静かに入場する。
   */
  setVisible(graph: Graph, nodeIds: Set<number>, edgeIds: number[]) {
    for (let i = 0; i < this.all.length; i++) {
      const on = nodeIds.has(i) ? 1 : 0
      if (on && !this.active[i]) {
        const node = this.all[i]
        node.x = node.hx
        node.y = node.hy
        node.vx = 0
        node.vy = 0
      }
      this.active[i] = on
    }
    this.activeList = [...nodeIds]
    const subset = this.activeList.map((i) => this.all[i])
    const links: SimLink[] = edgeIds.map((ei) => {
      const e = graph.edges[ei]
      return { source: e.from, target: e.to, type: e.type }
    })
    this.sim.nodes(subset)
    this.linkForce.links(links as never)
    // 入れ替え直後だけ温めて、新しい配置に馴染ませる
    this.sim.alpha(Math.max(this.sim.alpha(), 0.5))
  }

  /* ── 不透明度（物理とは独立） ─────────────── */

  setFadeTargets(fn: (i: number) => number) {
    for (const i of this.activeList) this.fadeTarget[i] = fn(i)
  }

  private tweenFade(): boolean {
    let moving = false
    for (const i of this.activeList) {
      const d = this.fadeTarget[i] - this.fade[i]
      if (Math.abs(d) > 0.004) {
        this.fade[i] += d * 0.16
        moving = true
      } else this.fade[i] = this.fadeTarget[i]
    }
    return moving
  }

  /* ── 1フレーム ──────────────────────────── */

  /** 進めた結果まだ動いているなら true。false になったら描画ループを止めてよい */
  step(): boolean {
    const fading = this.tweenFade()
    const hot = this.sim.alpha() > ALPHA_MIN || this.sim.alphaTarget() > 0
    if (hot) this.sim.tick()
    return hot || fading
  }

  /* ── ドラッグ（d3 の作法そのまま） ─────────── */

  startDrag(i: number) {
    this.dragging = i
    const node = this.all[i]
    node.fx = node.x
    node.fy = node.y
    this.sim.alphaTarget(0.3)
    if (this.sim.alpha() < 0.3) this.sim.alpha(0.3)
  }

  moveDrag(wx: number, wy: number) {
    if (this.dragging < 0) return
    const node = this.all[this.dragging]
    node.fx = wx
    node.fy = wy
  }

  endDrag() {
    if (this.dragging < 0) return
    const node = this.all[this.dragging]
    node.fx = null
    node.fy = null
    this.dragging = -1
    this.sim.alphaTarget(0)
  }

  /** 表示の入れ替えなど、外部要因で温め直したいときだけ使う */
  wake(alpha = 0.3) {
    this.sim.alpha(Math.max(this.sim.alpha(), alpha))
  }
}
