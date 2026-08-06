'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES, DEFAULT_DEPTH, DEPTHS, RELATIONS, baseOpacity, buildGraph, matchesQuery, nodeRadius,
  type Category, type Payload, type RelationType, type ViewMode,
} from '@/lib/graph'
import { Simulation } from '@/lib/simulation'
import { fitTransform, hitTest, render, toWorld, type RenderState, type Transform } from '@/lib/render'
import Controls from './Controls'
import DetailPanel from './DetailPanel'
import Legend from './Legend'

export default function Atlas({ payload }: { payload: Payload }) {
  const graph = useMemo(() => buildGraph(payload), [payload])
  const sim = useMemo(() => new Simulation(graph), [graph])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [depth, setDepth] = useState(DEFAULT_DEPTH)
  const [nodeScale, setNodeScale] = useState(1)
  const [mode, setMode] = useState<ViewMode>('all')
  const [edgeTypes, setEdgeTypes] = useState<Set<RelationType>>(new Set(RELATIONS))
  const [categories, setCategories] = useState<Set<Category>>(new Set(CATEGORIES))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)

  const transform = useRef<Transform>({ x: 0, y: 0, k: 0.5 })
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const filters = useRef({ mode, edgeTypes, categories, query, selected, hovered, nodeScale })
  filters.current = { mode, edgeTypes, categories, query, selected, hovered, nodeScale }
  const visibleEdges = useRef<number[]>([])

  const snapshot = useCallback((): RenderState => ({
    graph, sim,
    transform: transform.current,
    width: size.current.w,
    height: size.current.h,
    dpr: size.current.dpr,
    visibleEdges: visibleEdges.current,
    ...filters.current,
  }), [graph, sim])

  /* ── 描画ループ ──────────────────────────────
     sim.step() が false を返したら止め、操作があれば再開する。
     止まっている間は 1 フレームも回さないのでバッテリーを食わない。 */
  const raf = useRef<number | null>(null)
  const loop = useCallback(() => {
    const moving = sim.step()
    const ctx = canvasRef.current?.getContext('2d')
    const s = snapshot()
    if (ctx && s.width > 0) render(ctx, s)
    raf.current = moving ? requestAnimationFrame(loop) : null
  }, [sim, snapshot])

  const kick = useCallback(() => {
    if (raf.current === null) raf.current = requestAnimationFrame(loop)
  }, [loop])

  const paintOnce = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    const s = snapshot()
    if (ctx && s.width > 0) render(ctx, s)
  }, [snapshot])

  /* ── サイズ追従 ──────────────────────────────
     絞り込みパネルの開閉でグラフ領域の高さが変わる。window の resize は
     発火しないので ResizeObserver で要素そのものを見る。 */
  useEffect(() => {
    const el = wrapRef.current
    const cv = canvasRef.current
    if (!el || !cv) return
    const apply = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === 0 || h === 0) return
      const prev = size.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { w, h, dpr }
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      // 表示領域が変わっても、見ている中心がずれないように平行移動で補正する
      if (prev.w > 0) {
        transform.current = {
          ...transform.current,
          x: transform.current.x + (w - prev.w) / 2,
          y: transform.current.y + (h - prev.h) / 2,
        }
      }
      paintOnce()
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [paintOnce])

  /* ── 表示対象の計算 ───────────────────────── */
  useEffect(() => {
    const tiers = new Set(DEPTHS[depth].tiers)
    const nodeIds = new Set<number>()
    graph.nodes.forEach((n) => {
      if (!tiers.has(n.tier)) return
      if (!categories.has(n.cat)) return
      if (mode === 'shelf' && n.kind !== 'concept' && !n.shelf) return
      nodeIds.add(n.i)
    })
    // 選択中のノードとその隣接は、サイズ設定に関係なく必ず出す。
    // 「概念だけ」表示のまま概念を押すと、その概念に属する本だけが現れる。
    if (selected !== null) {
      nodeIds.add(selected)
      for (const ei of graph.adjacency[selected]) {
        const e = graph.edges[ei]
        if (!edgeTypes.has(e.type)) continue
        if (mode === 'human' && e.type === 'alt') continue
        nodeIds.add(e.from)
        nodeIds.add(e.to)
      }
    }

    const eids: number[] = []
    graph.edges.forEach((e, i) => {
      if (!edgeTypes.has(e.type)) return
      if (mode === 'human' && e.type === 'alt') return
      if (nodeIds.has(e.from) && nodeIds.has(e.to)) eids.push(i)
    })
    visibleEdges.current = eids
    sim.setRadii((i) => nodeRadius(graph.nodes[i], nodeScale))
    sim.setVisible(graph, nodeIds, eids)
    setVisibleCount(nodeIds.size)
    kick()
  }, [graph, sim, depth, categories, edgeTypes, mode, nodeScale, selected, kick])

  /* ── 強調の目標値。selected / hovered / 検索で滑らかに切り替わる ── */
  useEffect(() => {
    const focus = selected ?? hovered
    let near: Set<number> | null = null
    if (focus !== null) {
      near = new Set([focus])
      for (const ei of graph.adjacency[focus]) {
        const e = graph.edges[ei]
        if (!edgeTypes.has(e.type)) continue
        near.add(e.from)
        near.add(e.to)
      }
    }
    sim.setAlphaTargets((i) => {
      const n = graph.nodes[i]
      if (query && !matchesQuery(n, query)) return 0.05
      if (near && !near.has(i)) return 0.05
      return baseOpacity(n, mode)
    })
    kick()
  }, [graph, sim, selected, hovered, query, mode, edgeTypes, kick])

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  /* ── 選択したら周辺へ寄せる ───────────────── */
  const anim = useRef<number | null>(null)
  const focusOn = useCallback((ids: Iterable<number>) => {
    const mobile = size.current.w <= 640
    const target = fitTransform(snapshot(), ids, {
      panelSide: mobile ? 'bottom' : 'right',
      panelSize: mobile ? size.current.h * 0.5 : Math.min(348, size.current.w * 0.76),
    })
    const from = { ...transform.current }
    const t0 = performance.now()
    if (anim.current) cancelAnimationFrame(anim.current)
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 420)
      const e = 1 - Math.pow(1 - u, 3)
      transform.current = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      }
      paintOnce()
      anim.current = u < 1 ? requestAnimationFrame(step) : null
    }
    anim.current = requestAnimationFrame(step)
  }, [snapshot, paintOnce])

  const select = useCallback((i: number | null) => {
    setSelected((prev) => (i !== null && prev !== i ? i : null))
    sim.reheat(0.6)
    kick()
  }, [sim, kick])

  // 表示対象・強調の更新が終わったあとにカメラを寄せる（宣言順に依存）
  useEffect(() => {
    if (selected === null) return
    const ids = new Set<number>([selected])
    for (const ei of graph.adjacency[selected]) {
      const e = graph.edges[ei]
      if (!edgeTypes.has(e.type)) continue
      if (sim.active[e.from]) ids.add(e.from)
      if (sim.active[e.to]) ids.add(e.to)
    }
    const t = setTimeout(() => focusOn(ids), 30)
    return () => clearTimeout(t)
  }, [selected, graph, sim, edgeTypes, focusOn])

  /* ── ポインタ操作 ───────────────────────── */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode2: 'none' | 'pan' | 'node' = 'none'
    let last = { x: 0, y: 0 }
    let moved = false
    let pinch: { d: number; k: number; w: { x: number; y: number } } | null = null

    const down = (e: PointerEvent) => {
      cv.setPointerCapture(e.pointerId)
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY })
      moved = false
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y),
          k: transform.current.k,
          w: toWorld(transform.current, (a.x + b.x) / 2, (a.y + b.y) / 2),
        }
        if (mode2 === 'node') sim.endDrag()
        mode2 = 'none'
        return
      }
      const hit = hitTest(snapshot(), e.offsetX, e.offsetY)
      if (hit !== null) {
        mode2 = 'node'
        sim.startDrag(hit)
        kick()
      } else {
        mode2 = 'pan'
      }
      last = { x: e.offsetX, y: e.offsetY }
    }

    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) {
        // ホバー（マウスのみ）
        if (e.pointerType === 'mouse' && mode2 === 'none') {
          const h = hitTest(snapshot(), e.offsetX, e.offsetY)
          setHovered((prev) => (prev === h ? prev : h))
        }
        return
      }
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY })

      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const k = Math.max(0.06, Math.min(6, (pinch.k * d) / pinch.d))
        transform.current = {
          k,
          x: (a.x + b.x) / 2 - pinch.w.x * k,
          y: (a.y + b.y) / 2 - pinch.w.y * k,
        }
        moved = true
        paintOnce()
        return
      }
      const dx = e.offsetX - last.x
      const dy = e.offsetY - last.y
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      last = { x: e.offsetX, y: e.offsetY }

      if (mode2 === 'node') {
        const w = toWorld(transform.current, e.offsetX, e.offsetY)
        sim.moveDrag(w.x, w.y)
        kick()
      } else if (mode2 === 'pan') {
        transform.current = {
          ...transform.current,
          x: transform.current.x + dx,
          y: transform.current.y + dy,
        }
        paintOnce()
      }
    }

    const up = (e: PointerEvent) => {
      const tapped = !moved ? { x: e.offsetX, y: e.offsetY } : null
      const wasNode = mode2 === 'node' ? sim.dragging : -1
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) pinch = null
      if (mode2 === 'node') sim.endDrag()
      mode2 = 'none'
      kick()
      if (tapped) select(wasNode >= 0 ? wasNode : hitTest(snapshot(), tapped.x, tapped.y))
    }

    const cancel = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      if (mode2 === 'node') sim.endDrag()
      mode2 = 'none'
      pinch = null
    }

    const leave = () => setHovered(null)

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const w = toWorld(transform.current, e.offsetX, e.offsetY)
      const k = Math.max(0.06, Math.min(6, transform.current.k * Math.pow(0.999, e.deltaY)))
      transform.current = { k, x: e.offsetX - w.x * k, y: e.offsetY - w.y * k }
      paintOnce()
    }

    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', cancel)
    cv.addEventListener('pointerleave', leave)
    cv.addEventListener('wheel', wheel, { passive: false })
    return () => {
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', cancel)
      cv.removeEventListener('pointerleave', leave)
      cv.removeEventListener('wheel', wheel)
    }
  }, [sim, snapshot, select, kick, paintOnce])

  /* ── 初期表示 ───────────────────────────── */
  useEffect(() => {
    const t = setTimeout(() => {
      if (!sim.activeList.length || size.current.w === 0) return
      transform.current = fitTransform(snapshot(), sim.activeList, { panelSide: 'none', panelSize: 0 })
      paintOnce()
    }, 60)
    return () => clearTimeout(t)
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── 詳細パネル用の関係リスト ─────────────── */
  const relations = useMemo(() => {
    if (selected === null) return null
    const incoming: { node: number; type: RelationType; why: string }[] = []
    const outgoing: { node: number; type: RelationType; why: string }[] = []
    for (const ei of graph.adjacency[selected]) {
      const e = graph.edges[ei]
      if (!edgeTypes.has(e.type)) continue
      const isIn = e.to === selected
      ;(isIn ? incoming : outgoing).push({
        node: isIn ? e.from : e.to, type: e.type, why: e.why,
      })
    }
    return { incoming, outgoing }
  }, [selected, graph, edgeTypes])

  const edgeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of graph.edges) c[e.type] = (c[e.type] ?? 0) + 1
    return c
  }, [graph])
  const catCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const n of graph.nodes) c[n.cat] = (c[n.cat] ?? 0) + 1
    return c
  }, [graph])

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="z-20 flex flex-none items-center gap-2.5 border-b border-line bg-panel px-3.5 py-2.5">
        <h1 className="flex-none text-[15px] font-extrabold tracking-tight">
          読む道 <span className="text-acc">/ Atlas</span>
        </h1>
        <p className="truncate text-[10.5px] text-dim">
          概念{graph.concepts.length} ・ 表示中 {visibleCount} / {graph.meta.nodes}
        </p>
        <button
          onClick={() => setControlsOpen((v) => !v)}
          className="ml-auto flex-none rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11px] text-muted active:text-text"
        >
          絞り込み {controlsOpen ? '▴' : '▾'}
        </button>
      </header>

      <Controls
        open={controlsOpen}
        depth={depth}
        onDepth={setDepth}
        nodeScale={nodeScale}
        onNodeScale={setNodeScale}
        mode={mode}
        onMode={setMode}
        edgeTypes={edgeTypes}
        onEdgeType={(t) => setEdgeTypes((s) => toggle(s, t))}
        edgeCounts={edgeCounts}
        categories={categories}
        onCategory={(c) => setCategories((s) => toggle(s, c))}
        catCounts={catCounts}
        query={query}
        onQuery={setQuery}
        concepts={graph.concepts.map((i) => graph.nodes[i])}
        onPickConcept={select}
      />

      <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none overflow-hidden">
        <canvas ref={canvasRef} className="block h-full w-full" />
        {!controlsOpen && <Legend />}
        {selected !== null && relations && (
          <DetailPanel
            node={graph.nodes[selected]}
            nodes={graph.nodes}
            incoming={relations.incoming}
            outgoing={relations.outgoing}
            onSelect={select}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
