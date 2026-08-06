'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES, DEFAULT_DEPTH, DEPTHS, RELATIONS, baseOpacity, buildGraph, matchesQuery, nodeRadius,
  type Category, type Payload, type RelationType, type ShelfOverride, type ViewMode,
} from '@/lib/graph'
import { Simulation } from '@/lib/simulation'
import { fitTransform, hitTest, render, toWorld, type RenderState, type Transform } from '@/lib/render'
import { getSupabase } from '@/lib/supabase'
import { EMPTY_OVERLAY, bondPair, fetchOverlay, fetchPersonalView, ndlKey, type NdlItem, type Overlay, type Profile } from '@/lib/overlay'
import AccountMenu, { type SessionUser } from './AccountMenu'
import Controls from './Controls'
import DetailPanel from './DetailPanel'
import Legend from './Legend'

/** タップとドラッグの境界（px）。これ未満の移動はクリック扱いで、物理は一切動かさない */
const DRAG_THRESHOLD = 4

export default function Atlas({ payload }: { payload: Payload }) {
  /* ── アカウント & 本棚 ─────────────────────
     未ログイン: 焼き込みの本棚（サンプル93冊）で描く。
     ログイン中: そのアカウントの shelf テーブルの中身で描く。 */
  const [user, setUser] = useState<SessionUser | null>(null)
  const [userShelf, setUserShelf] = useState<Map<string, number> | null>(null)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    sb.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email ?? '' } : null)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email ?? '' } : null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !user) { setUserShelf(null); return }
    let on = true
    sb.from('shelf').select('book_key, star').then(({ data, error }) => {
      if (!on) return
      if (error) { setUserShelf(new Map()); return }
      setUserShelf(new Map((data ?? []).map((r) => [r.book_key as string, r.star as number])))
    })
    return () => { on = false }
  }, [user])

  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY)
  const reloadOverlay = useCallback(() => {
    fetchOverlay(user?.id ?? null).then(setOverlay).catch(() => {})
  }, [user?.id])
  useEffect(reloadOverlay, [reloadOverlay])

  /* ── 他アカウントの視点 ─────────────────────
     フォローしている人の地図を「その人の本棚 + その人の強度」で見る。
     平均ではなく本人の値で描くので、その人の頭の中の形がそのまま出る。 */
  const [viewing, setViewing] = useState<Profile | null>(null)
  const [personal, setPersonal] = useState<{
    shelf: Map<string, number>
    links: Overlay['links']
    bonds: Overlay['bonds']
  } | null>(null)
  useEffect(() => {
    if (!viewing) { setPersonal(null); return }
    let on = true
    fetchPersonalView(viewing.id).then((p) => { if (on && p) setPersonal(p) }).catch(() => {})
    return () => { on = false }
  }, [viewing])

  const effectiveOverlay: Overlay = useMemo(() => {
    if (!viewing || !personal) return overlay
    return { ...overlay, links: personal.links, bonds: personal.bonds }
  }, [overlay, viewing, personal])

  const shelfOverride: ShelfOverride =
    viewing && personal ? personal.shelf : user ? (userShelf ?? new Map()) : null
  const graph = useMemo(
    () => buildGraph(payload, shelfOverride, effectiveOverlay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payload, user?.id, userShelf, effectiveOverlay, viewing?.id, personal]
  )

  // ノードごとの紐付け人数（大きさに反映）
  const boosts = useMemo(() => {
    const m = new Map<number, number>()
    const byKey = new Map(graph.nodes.map((n) => [n.key, n.i]))
    const add = (k: string, v: number) => {
      const i = byKey.get(k)
      if (i !== undefined) m.set(i, (m.get(i) ?? 0) + v)
    }
    // 結びつきの強さ（平均×人数の対数）でノードが育つ
    for (const l of effectiveOverlay.links) {
      const v = l.strength * (1 + Math.log2(1 + l.supporters) * 0.4)
      add(l.concept, v)
      add(l.book, v)
    }
    for (const b of effectiveOverlay.bonds) {
      add(b.a, b.strength)
      add(b.b, b.strength)
    }
    return m
  }, [graph, effectiveOverlay])

  // グラフを作り直しても、前のシミュレーションから位置を引き継ぐ（★を付けても地図が飛ばない）
  const prevSim = useRef<Simulation | null>(null)
  const sim = useMemo(() => {
    const s = new Simulation(graph, prevSim.current ?? undefined)
    prevSim.current = s
    return s
  }, [graph])

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

  /* ── 描画ループ ─────────────────────────────
     graph / sim / boosts はオーバーレイ到着で作り直されるため、ループから
     直接閉じ込めてはいけない。ref 経由で「その瞬間の最新一式」を読む。

     以前の実装はループが sim をクロージャに抱えており、グラフ再構築後に
     (1) 古いループが古い sim を回し続けて新しい sim が止まって見える
     (2) 古い graph と新しい visibleEdges の食い違いで例外 → rAF が宙に浮き
         kick() が永遠に無視される
     という二重の停止バグがあった。ref 化 + 例外時リセットの二段でふさぐ。
     この回帰は tests/e2e/atlas.spec.ts の「オーバーレイ後もドラッグで動く」が守る。 */
  const live = useRef({ graph, sim, boosts })
  live.current = { graph, sim, boosts }

  const snapshot = useCallback((): RenderState => ({
    ...live.current,
    transform: transform.current,
    width: size.current.w,
    height: size.current.h,
    dpr: size.current.dpr,
    visibleEdges: visibleEdges.current,
    ...filters.current,
  }), [])

  const raf = useRef<number | null>(null)
  const loopFn = useRef<(() => void) | null>(null)
  if (loopFn.current === null) {
    loopFn.current = () => {
      raf.current = null // 先に外す。ループ内で例外が起きても次の kick が効く
      try {
        const s = snapshot()
        const moving = s.sim.step()
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx && s.width > 0) render(ctx, s)
        if (moving && raf.current === null) raf.current = requestAnimationFrame(loopFn.current!)
      } catch (err) {
        console.error('[atlas] render loop error', err)
      }
    }
  }

  const kick = useCallback(() => {
    if (raf.current === null) raf.current = requestAnimationFrame(loopFn.current!)
  }, [])

  const paintOnce = useCallback(() => {
    try {
      const s = snapshot()
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && s.width > 0) render(ctx, s)
    } catch (err) {
      console.error('[atlas] paint error', err)
    }
  }, [snapshot])

  /* ── サイズ追従（絞り込みパネル開閉に ResizeObserver で追従） ── */
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
      // 動的ノード（実体化した本・ユーザー概念）は絞り込みに関係なく出す
      if (n.dynamic) { nodeIds.add(n.i); return }
      if (!tiers.has(n.tier)) return
      if (!categories.has(n.cat)) return
      if (mode === 'shelf' && n.kind !== 'concept' && !n.shelf) return
      nodeIds.add(n.i)
    })
    // 選択中のノードとその隣接は、サイズ設定に関係なく必ず出す
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
    sim.setRadii((i) => nodeRadius(graph.nodes[i], nodeScale, boosts.get(i) ?? 0))
    sim.setVisible(graph, nodeIds, eids)
    setVisibleCount(nodeIds.size)
    kick()
  }, [graph, sim, depth, categories, edgeTypes, mode, nodeScale, selected, boosts, kick])

  /* ── 強調（不透明度の目標値）。物理は動かさない ── */
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
    sim.setFadeTargets((i) => {
      const n = graph.nodes[i]
      if (query && !matchesQuery(n, query)) return 0.05
      if (near && !near.has(i)) return 0.05
      return baseOpacity(n, mode)
    })
    kick()
  }, [graph, sim, selected, hovered, query, mode, edgeTypes, kick])

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  /* ── カメラ ─────────────────────────────── */
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

  // 選択は物理に触らない（触ると揺れる）。カメラと強調だけ動かす
  const select = useCallback((i: number | null) => {
    setSelected((prev) => (i !== null && prev !== i ? i : null))
    kick()
  }, [kick])

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

  /* ── ポインタ操作 ──────────────────────────
     ノードの上で押しても、DRAG_THRESHOLD を超えるまではドラッグを開始しない。
     タップ（クリック）で物理が動くと「触るたびに震える」ため。 */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ptrs = new Map<number, { x: number; y: number }>()
    let pending: number | null = null   // 押したノード（まだドラッグではない）
    let dragging = false                // sim.startDrag 済みか
    let panning = false
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
        if (dragging) { live.current.sim.endDrag(); dragging = false }
        pending = null
        panning = false
        return
      }
      pending = hitTest(snapshot(), e.offsetX, e.offsetY)
      panning = pending === null
      last = { x: e.offsetX, y: e.offsetY }
    }

    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && !dragging && !panning) {
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
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) moved = true
      last = { x: e.offsetX, y: e.offsetY }

      if (pending !== null && moved && !dragging) {
        dragging = true
        live.current.sim.startDrag(pending)
        kick()
      }
      if (dragging) {
        const w = toWorld(transform.current, e.offsetX, e.offsetY)
        live.current.sim.moveDrag(w.x, w.y)
        kick()
      } else if (panning && moved) {
        transform.current = {
          ...transform.current,
          x: transform.current.x + dx,
          y: transform.current.y + dy,
        }
        paintOnce()
      }
    }

    const up = (e: PointerEvent) => {
      const tappedNode = !moved ? pending : null
      const tappedEmpty = !moved && pending === null
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) pinch = null
      if (dragging) { live.current.sim.endDrag(); dragging = false; kick() }
      pending = null
      panning = false
      if (tappedNode !== null) select(tappedNode)
      else if (tappedEmpty) select(null)
    }

    const cancel = (e: PointerEvent) => {
      ptrs.delete(e.pointerId)
      if (dragging) { live.current.sim.endDrag(); dragging = false }
      pending = null
      panning = false
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
  }, [snapshot, select, kick, paintOnce])

  /* ── 初期表示 ───────────────────────────── */
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current) return
    const t = setTimeout(() => {
      if (!sim.activeList.length || size.current.w === 0) return
      transform.current = fitTransform(snapshot(), sim.activeList, { panelSide: 'none', panelSize: 0 })
      didFit.current = true
      paintOnce()
    }, 60)
    return () => clearTimeout(t)
  }, [sim, snapshot, paintOnce])

  /* ── ★を付ける（ログイン中のみ） ─────────── */
  const rate = useCallback(async (key: string, star: number | null) => {
    const sb = getSupabase()
    if (!sb || !user) return
    // 楽観更新 → 失敗したら再取得
    setUserShelf((prev) => {
      const next = new Map(prev ?? [])
      if (star === null) next.delete(key)
      else next.set(key, star)
      return next
    })
    const res = star === null
      ? await sb.from('shelf').delete().eq('user_id', user.id).eq('book_key', key)
      : await sb.from('shelf').upsert({ user_id: user.id, book_key: key, star })
    if (res.error) {
      const { data } = await sb.from('shelf').select('book_key, star')
      setUserShelf(new Map((data ?? []).map((r) => [r.book_key as string, r.star as number])))
    }
  }, [user])

  /* ── 概念への紐付け: 強度 1-5 を付ける / null で外す ── */
  const setTie = useCallback(async (conceptKey: string, bookKey: string, strength: number | null) => {
    const sb = getSupabase()
    if (!sb || !user) return
    if (strength === null) {
      await sb.from('concept_links').delete()
        .eq('concept_key', conceptKey).eq('book_key', bookKey).eq('user_id', user.id)
    } else {
      await sb.from('concept_links').upsert({ concept_key: conceptKey, book_key: bookKey, user_id: user.id, strength })
    }
    reloadOverlay()
  }, [user, reloadOverlay])

  /* ── 本と本の結びつき（無向・辞書順に正規化） ── */
  const setBond = useCallback(async (bookKey: string, otherKey: string, strength: number | null) => {
    const sb = getSupabase()
    if (!sb || !user) return
    const [a, b] = bondPair(bookKey, otherKey)
    if (strength === null) {
      await sb.from('book_links').delete().eq('a_key', a).eq('b_key', b).eq('user_id', user.id)
    } else {
      await sb.from('book_links').upsert({ a_key: a, b_key: b, user_id: user.id, strength })
    }
    reloadOverlay()
  }, [user, reloadOverlay])

  const createConcept = useCallback(async (label: string, bookKey: string) => {
    const sb = getSupabase()
    if (!sb || !user) return
    const key = `u_${crypto.randomUUID().slice(0, 8)}`
    const { error } = await sb.from('concepts').insert({ key, label, description: '', official: false, created_by: user.id })
    if (!error) {
      await sb.from('concept_links').upsert({ concept_key: key, book_key: bookKey, user_id: user.id })
    }
    reloadOverlay()
  }, [user, reloadOverlay])

  /* ── NDL検索からの実体化: books に登録 → 棚に入れる ── */
  const materialize = useCallback(async (item: NdlItem) => {
    const sb = getSupabase()
    if (!sb || !user) return
    const key = ndlKey(item)
    await sb.from('books').upsert({
      key, isbn: item.isbn || null, title: item.title, author: item.author,
      publisher: item.publisher, year: item.year, cat: 'lit', created_by: user.id,
    })
    await sb.from('shelf').upsert({ user_id: user.id, book_key: key, star: 0 })
    setUserShelf((prev) => new Map(prev ?? []).set(key, 0))
    reloadOverlay()
  }, [user, reloadOverlay])

  /* ── ブクログの本棚をワンタップで再現 ─────────
     焼き込みペイロードの93冊（=ブクログ由来）を自分の shelf に一括コピーする。 */
  const importSampleShelf = useCallback(async (): Promise<number> => {
    const sb = getSupabase()
    if (!sb || !user) return 0
    const rows = payload.n
      .filter((a) => a[5])
      .map((a) => ({ user_id: user.id, book_key: a[11], star: a[4] < 0 ? 0 : a[4] }))
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await sb.from('shelf').upsert(rows.slice(i, i + 50))
      if (error) return i
    }
    const { data } = await sb.from('shelf').select('book_key, star')
    setUserShelf(new Map((data ?? []).map((r) => [r.book_key as string, r.star as number])))
    return rows.length
  }, [user, payload])

  /* ── フォロー ───────────────────────────── */
  const toggleFollow = useCallback(async (profileId: string, on: boolean) => {
    const sb = getSupabase()
    if (!sb || !user) return
    if (on) await sb.from('follows').upsert({ follower: user.id, followee: profileId })
    else await sb.from('follows').delete().eq('follower', user.id).eq('followee', profileId)
    reloadOverlay()
  }, [user, reloadOverlay])

  /* ── 詳細パネル用 ─────────────────────────── */
  const relations = useMemo(() => {
    if (selected === null) return null
    const incoming: { node: number; type: RelationType; why: string }[] = []
    const outgoing: { node: number; type: RelationType; why: string }[] = []
    for (const ei of graph.adjacency[selected]) {
      const e = graph.edges[ei]
      if (!edgeTypes.has(e.type)) continue
      const isIn = e.to === selected
      ;(isIn ? incoming : outgoing).push({ node: isIn ? e.from : e.to, type: e.type, why: e.why })
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
          {viewing
            ? `${viewing.username} の地図を見ています`
            : user ? `${user.email.split('@')[0]} の本棚` : 'サンプル本棚'}
          {' ・ 表示中 '}{visibleCount} / {graph.meta.nodes}
        </p>
        {viewing && (
          <button
            onClick={() => setViewing(null)}
            className="flex-none rounded-full border border-[#7c6bd6] bg-[#a78bfa]/20 px-2.5 py-1 text-[10.5px] text-[#e9d5ff]"
          >
            自分に戻る
          </button>
        )}
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <AccountMenu
            user={user}
            shelfCount={user ? (userShelf?.size ?? null) : null}
            profiles={overlay.profiles}
            follows={overlay.follows}
            viewingId={viewing?.id ?? null}
            onToggleFollow={toggleFollow}
            onView={(p) => setViewing(p)}
            onImportSample={importSampleShelf}
          />
          <button
            onClick={() => setControlsOpen((v) => !v)}
            className="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11px] text-muted active:text-text"
          >
            絞り込み {controlsOpen ? '▴' : '▾'}
          </button>
        </div>
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
        worldSearch={{
          loggedIn: !!user,
          knownKeys: new Set(graph.nodes.map((n) => n.key)),
          onMaterialize: materialize,
        }}
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
            canRate={!!user && !viewing}
            onRate={rate}
            onSelect={select}
            onClose={() => setSelected(null)}
            chips={overlay.links
              .filter((l) => l.book === graph.nodes[selected].key)
              .map((l) => ({
                key: l.concept,
                label: overlay.concepts.find((c) => c.key === l.concept)?.label ?? l.concept,
                supporters: l.supporters,
                strength: l.strength,
                mine: overlay.mine.get(`${l.concept}::${graph.nodes[selected].key}`) ?? null,
              }))
              .sort((a, b) => b.strength - a.strength)}
            bonds={overlay.bonds
              .filter((l) => l.a === graph.nodes[selected].key || l.b === graph.nodes[selected].key)
              .map((l) => {
                const otherKey = l.a === graph.nodes[selected].key ? l.b : l.a
                const other = graph.nodes.find((n) => n.key === otherKey)
                return {
                  otherKey,
                  otherIndex: other?.i ?? -1,
                  label: other?.title ?? otherKey,
                  supporters: l.supporters,
                  strength: l.strength,
                  mine: overlay.mine.get(`${l.a}::${l.b}`) ?? null,
                }
              })
              .filter((b) => b.otherIndex >= 0)
              .sort((a, b) => b.strength - a.strength)}
            allConcepts={overlay.concepts.map((c) => ({ key: c.key, label: c.label }))}
            shelfBooks={graph.nodes
              .filter((n) => n.kind === 'book' && n.shelf)
              .map((n) => ({ key: n.key, title: n.title }))}
            linkedBookKeys={new Set(
              effectiveOverlay.links
                .filter((l) => l.concept === graph.nodes[selected].key)
                .map((l) => l.book)
            )}
            onSetTie={setTie}
            onSetBond={setBond}
            onCreateConcept={createConcept}
          />
        )}
      </div>
    </div>
  )
}
