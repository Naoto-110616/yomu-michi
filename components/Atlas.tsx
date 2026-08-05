'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES, RELATIONS, buildGraph,
  type Category, type Payload, type RelationType, type ViewMode,
} from '@/lib/graph'
import {
  fitTransform, hitTest, isEdgeVisible, neighborhood, render, toWorld,
  type RenderState, type Transform,
} from '@/lib/render'
import Controls from './Controls'
import DetailPanel from './DetailPanel'
import Legend from './Legend'

export default function Atlas({ payload }: { payload: Payload }) {
  const graph = useMemo(() => buildGraph(payload), [payload])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [mode, setMode] = useState<ViewMode>('all')
  const [edgeTypes, setEdgeTypes] = useState<Set<RelationType>>(new Set(RELATIONS))
  const [categories, setCategories] = useState<Set<Category>>(new Set(CATEGORIES))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [hintVisible, setHintVisible] = useState(true)

  // transform と canvas サイズは 60fps で変わるので ref。
  // フィルタ類は React state。draw() の時点で両者を合成して RenderState を作る。
  const transform = useRef<Transform>({ x: 0, y: 0, k: 0.5 })
  const size = useRef({ w: 0, h: 0, dpr: 1 })
  const filters = useRef({ mode, edgeTypes, categories, query, selected })
  filters.current = { mode, edgeTypes, categories, query, selected }

  const stateRef = useRef<RenderState>(null as unknown as RenderState)
  const snapshot = useCallback((): RenderState => {
    const s: RenderState = {
      graph,
      transform: transform.current,
      width: size.current.w,
      height: size.current.h,
      dpr: size.current.dpr,
      ...filters.current,
    }
    stateRef.current = s
    return s
  }, [graph])
  snapshot()

  const frame = useRef<number | null>(null)
  const draw = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const s = snapshot()
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && s.width > 0) render(ctx, s)
    })
  }, [snapshot])

  /* ── リサイズ ─────────────────────────── */
  useEffect(() => {
    const resize = () => {
      const el = wrapRef.current
      const cv = canvasRef.current
      if (!el || !cv) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size.current = { w: el.clientWidth, h: el.clientHeight, dpr }
      cv.width = el.clientWidth * dpr
      cv.height = el.clientHeight * dpr
      draw()
    }
    resize()
    // 初期表示は全体が入る位置に
    if (size.current.w > 0) {
      const { minX, maxX, minY, maxY } = graph.bounds
      const pad = 60
      const k = Math.min(
        size.current.w / (maxX - minX + pad * 2),
        size.current.h / (maxY - minY + pad * 2)
      )
      transform.current = {
        k,
        x: size.current.w / 2 - ((minX + maxX) / 2) * k,
        y: size.current.h / 2 - ((minY + maxY) / 2) * k,
      }
    }
    draw()
    window.addEventListener('resize', resize)
    const t = setTimeout(() => setHintVisible(false), 7000)
    return () => {
      window.removeEventListener('resize', resize)
      clearTimeout(t)
    }
  }, [graph, draw])

  useEffect(draw, [mode, edgeTypes, categories, query, selected, draw])

  /* ── 選択時に周辺へ寄せる ────────────────── */
  const anim = useRef<number | null>(null)
  const focusOn = useCallback(
    (ids: Set<number>) => {
      const mobile = size.current.w <= 640
      const target = fitTransform(snapshot(), ids, {
        panelSide: mobile ? 'bottom' : 'right',
        panelSize: mobile ? size.current.h * 0.5 : Math.min(348, size.current.w * 0.76),
      })
      const from = { ...transform.current }
      const t0 = performance.now()
      if (anim.current) cancelAnimationFrame(anim.current)
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / 380)
        const e = 1 - Math.pow(1 - u, 3)
        transform.current = {
          k: from.k + (target.k - from.k) * e,
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
        }
        draw()
        anim.current = u < 1 ? requestAnimationFrame(step) : null
      }
      anim.current = requestAnimationFrame(step)
    },
    [draw, snapshot]
  )

  const select = useCallback(
    (i: number | null) => {
      setSelected((prev) => {
        const next = i !== null && prev !== i ? i : null
        if (next !== null) {
          const s = { ...snapshot(), selected: next }
          const nb = neighborhood(s)
          if (nb) requestAnimationFrame(() => focusOn(nb))
        }
        return next
      })
    },
    [focusOn, snapshot]
  )

  /* ── ポインタ操作（パン / ピンチ / タップ） ──────── */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ptrs = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number } | null = null
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
        drag = null
        return
      }
      drag = { x: e.offsetX, y: e.offsetY }
    }
    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY })
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const k = Math.max(0.08, Math.min(6, (pinch.k * d) / pinch.d))
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        transform.current = { k, x: cx - pinch.w.x * k, y: cy - pinch.w.y * k }
        moved = true
        draw()
        return
      }
      if (!drag) return
      const dx = e.offsetX - drag.x
      const dy = e.offsetY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      transform.current = {
        ...transform.current,
        x: transform.current.x + dx,
        y: transform.current.y + dy,
      }
      drag = { x: e.offsetX, y: e.offsetY }
      draw()
    }
    const up = (e: PointerEvent) => {
      const tapped = !moved ? { x: e.offsetX, y: e.offsetY } : null
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) pinch = null
      drag = null
      if (tapped) select(hitTest(snapshot(), tapped.x, tapped.y))
    }
    const cancel = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      drag = null
      pinch = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const w = toWorld(transform.current, e.offsetX, e.offsetY)
      const k = Math.max(0.08, Math.min(6, transform.current.k * Math.pow(0.999, e.deltaY)))
      transform.current = { k, x: e.offsetX - w.x * k, y: e.offsetY - w.y * k }
      draw()
    }

    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', cancel)
    cv.addEventListener('wheel', wheel, { passive: false })
    return () => {
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', cancel)
      cv.removeEventListener('wheel', wheel)
    }
  }, [draw, select, snapshot])

  /* ── 選択ノードの関係リスト ───────────────── */
  const relations = useMemo(() => {
    if (selected === null) return null
    const incoming: { node: number; type: RelationType; why: string }[] = []
    const outgoing: { node: number; type: RelationType; why: string }[] = []
    for (const ei of graph.adjacency[selected]) {
      const e = graph.edges[ei]
      if (!isEdgeVisible(e, snapshot())) continue
      const isIncoming = e.to === selected
      ;(isIncoming ? incoming : outgoing).push({
        node: isIncoming ? e.from : e.to,
        type: e.type,
        why: e.why,
      })
    }
    return { incoming, outgoing }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, graph, edgeTypes, categories, mode, snapshot])

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
          {graph.meta.nodes}冊 / {graph.meta.edges}本の線 / 読了{graph.meta.shelf}
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
      />

      <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none overflow-hidden">
        <canvas ref={canvasRef} className="block h-full w-full" />
        <Legend />
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
        <p
          className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-bg/75 px-3 py-1 text-[10.5px] text-[#4a5260] transition-opacity duration-700 max-[640px]:hidden ${
            hintVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          ドラッグ＝移動 / ホイール＝拡大 / 丸をクリック＝周辺だけ表示
        </p>
      </div>
    </div>
  )
}
