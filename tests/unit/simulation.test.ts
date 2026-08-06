import { describe, expect, it } from 'vitest'
import { buildGraph, type Graph } from '@/lib/graph'
import { Simulation } from '@/lib/simulation'
import { tinyPayload } from './fixtures'

function setup(): { g: Graph; sim: Simulation } {
  const g = buildGraph(tinyPayload())
  const sim = new Simulation(g)
  sim.setVisible(g, new Set(g.nodes.map((n) => n.i)), g.edges.map((_, i) => i))
  return { g, sim }
}

/** step() が false を返すまで回す。上限に達したら -1 */
function runUntilStill(sim: Simulation, cap = 5000): number {
  for (let i = 0; i < cap; i++) {
    if (!sim.step()) return i
  }
  return -1
}

describe('Simulation: 沈静化（震え禁止）', () => {
  it('必ず有限ステップで完全に止まる', () => {
    const { sim } = setup()
    const steps = runUntilStill(sim)
    expect(steps).toBeGreaterThan(10)   // 一瞬では止まらない（動きがある）
    expect(steps).not.toBe(-1)          // かつ必ず止まる
    // 止まったあとに勝手に再始動しない
    for (let i = 0; i < 10; i++) expect(sim.step()).toBe(false)
  })

  it('止まった状態の座標は有限値', () => {
    const { sim } = setup()
    runUntilStill(sim)
    for (const i of sim.activeList) {
      expect(Number.isFinite(sim.all[i].x)).toBe(true)
      expect(Number.isFinite(sim.all[i].y)).toBe(true)
    }
  })
})

describe('Simulation: ドラッグ（Obsidian 的な掴む→追従→余音）', () => {
  it('掴んだノードはポインタに固定され、離すと再び止まる', () => {
    const { sim } = setup()
    runUntilStill(sim)

    sim.startDrag(1)
    sim.moveDrag(300, 300)
    for (let i = 0; i < 40; i++) sim.step()
    expect(sim.all[1].x).toBeCloseTo(300, 0) // fx で固定
    expect(sim.all[1].y).toBeCloseTo(300, 0)

    // ドラッグ中は step が動き続ける（alphaTarget > 0）
    expect(sim.step()).toBe(true)

    sim.endDrag()
    const steps = runUntilStill(sim)
    expect(steps).not.toBe(-1) // 余音のあと必ず沈静化
  })

  it('隣接ノードがバネで追従する', () => {
    const { sim, g } = setup()
    runUntilStill(sim)
    const before = { x: sim.all[3].x, y: sim.all[3].y } // 読了本Aの隣（alt）
    sim.startDrag(1)
    sim.moveDrag(sim.all[1].x + 400, sim.all[1].y)
    for (let i = 0; i < 200; i++) sim.step()
    const moved = Math.hypot(sim.all[3].x - before.x, sim.all[3].y - before.y)
    expect(moved).toBeGreaterThan(5) // 引きずられている
    sim.endDrag()
    expect(g.nodes.length).toBe(5)
  })
})

describe('Simulation: 表示の入れ替え', () => {
  it('表示中のノードは位置を保ち、新入りはホームから入場する', () => {
    const g = buildGraph(tinyPayload())
    const sim = new Simulation(g)
    sim.setVisible(g, new Set([0, 1, 2]), [0, 3]) // member と pre だけ
    for (let i = 0; i < 150; i++) sim.step()
    const kept = { x: sim.all[1].x, y: sim.all[1].y }

    sim.setVisible(g, new Set([0, 1, 2, 3, 4]), g.edges.map((_, i) => i))
    expect(sim.all[1].x).toBe(kept.x) // 入れ替え直後、既存は動かない
    expect(sim.all[1].y).toBe(kept.y)
    expect(sim.all[3].x).toBe(g.nodes[3].x) // 新入りはホーム位置
    expect(runUntilStill(sim)).not.toBe(-1)
  })

  it('グラフ再構築時に前の位置を引き継げる（★を付けても地図が飛ばない）', () => {
    const g1 = buildGraph(tinyPayload())
    const sim1 = new Simulation(g1)
    sim1.setVisible(g1, new Set(g1.nodes.map((n) => n.i)), g1.edges.map((_, i) => i))
    for (let i = 0; i < 200; i++) sim1.step()

    const g2 = buildGraph(tinyPayload(), new Map([['book_a', 5]]))
    const sim2 = new Simulation(g2, sim1)
    expect(sim2.all[1].x).toBe(sim1.all[1].x)
    expect(sim2.all[1].y).toBe(sim1.all[1].y)
  })
})

describe('Simulation: 強調のフェード（物理と独立）', () => {
  it('物理が止まっていてもフェードは目標へ収束し、収束後に止まる', () => {
    const { sim } = setup()
    runUntilStill(sim)
    sim.setFadeTargets((i) => (i === 4 ? 0.05 : 1))
    let steps = 0
    while (sim.step() && steps < 300) steps++
    expect(steps).toBeLessThan(300)          // フェードだけなら数十フレームで終わる
    expect(sim.fade[4]).toBeCloseTo(0.05, 1) // 目標に到達
    expect(sim.step()).toBe(false)           // 収束後は完全停止
  })
})
