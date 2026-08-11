import { describe, expect, it } from 'vitest'
import { buildGraph, effectiveTier, nodeRadius } from '@/lib/graph'
import { tinyPayload } from './fixtures'

describe('buildGraph: 階層（概念 > 読んだ本 > 紐づく本 > その他）', () => {
  it('tier を正しく割り当てる', () => {
    const g = buildGraph(tinyPayload())
    expect(g.nodes[0].tier).toBe('concept')
    expect(g.nodes[1].tier).toBe('shelf')
    expect(g.nodes[2].tier).toBe('shelf')
    expect(g.nodes[3].tier).toBe('linked') // 読了本Aの隣
    expect(g.nodes[4].tier).toBe('far')    // 2ホップ先
  })

  it('概念一覧と隣接リストが破綻していない', () => {
    const g = buildGraph(tinyPayload())
    expect(g.concepts).toEqual([0])
    expect(g.adjacency[1].length).toBe(3) // member + alt + pre
    for (const adj of g.adjacency) {
      for (const ei of adj) expect(g.edges[ei]).toBeDefined()
    }
  })
})

describe('buildGraph: アカウントの本棚オーバーライド', () => {
  it('本棚を差し替えると shelf / star / tier が変わる', () => {
    const g = buildGraph(tinyPayload(), new Map([['book_c', 4]]))
    expect(g.nodes[1].shelf).toBe(false) // 焼き込みの読了は消える
    expect(g.nodes[3].shelf).toBe(true)
    expect(g.nodes[3].star).toBe(4)
    expect(g.nodes[3].tier).toBe('shelf')
    expect(g.nodes[1].tier).toBe('linked') // Cの隣として繰り上がる
  })

  it('空の本棚なら読んだ本の層が消える', () => {
    const g = buildGraph(tinyPayload(), new Map())
    expect(g.nodes.filter((n) => n.tier === 'shelf')).toHaveLength(0)
  })
})

describe('effectiveTier: 表示中の概念と読んだ本を核にした実効階層', () => {
  it('空の本棚では、他人が概念に紐づけただけの本は far になる（新規アカウントのバグ回帰）', () => {
    // 他人の紐付け（overlay.links）で全ての本が概念とつながっている状態を再現
    const g = buildGraph(tinyPayload(), new Map(), {
      books: [], concepts: [], bonds: [],
      links: [
        { concept: 'c_test', book: 'book_a', supporters: 2, strength: 4 },
        { concept: 'c_test', book: 'book_c', supporters: 1, strength: 3 },
      ],
    })
    // buildGraph の tier では linked に繰り上がってしまう…
    expect(g.nodes.filter((n) => n.tier === 'linked').length).toBeGreaterThan(0)
    // …が、実効階層では「立っている概念なし・読んだ本なし」なので全て far
    const visible = new Set<number>() // 新規アカウント = 表示中の概念ゼロ
    for (const n of g.nodes) {
      if (n.kind !== 'concept') expect(effectiveTier(g, n.i, visible)).toBe('far')
    }
  })

  it('読んだ本と、その隣だけが shelf / linked になる', () => {
    const g = buildGraph(tinyPayload(), new Map([['book_a', 5]]))
    const visible = new Set<number>()
    const byKey = new Map(g.nodes.map((n) => [n.key, n.i]))
    expect(effectiveTier(g, byKey.get('book_a')!, visible)).toBe('shelf')
    expect(effectiveTier(g, byKey.get('book_c')!, visible)).toBe('linked') // Aの隣
    expect(effectiveTier(g, byKey.get('book_d')!, visible)).toBe('far')
  })

  it('概念は「表示中」のときだけ隣の本を linked に繰り上げる', () => {
    const g = buildGraph(tinyPayload(), new Map())
    const byKey = new Map(g.nodes.map((n) => [n.key, n.i]))
    const concept = byKey.get('c_test')!
    const bookA = byKey.get('book_a')! // c_test の member
    expect(effectiveTier(g, bookA, new Set())).toBe('far')
    expect(effectiveTier(g, bookA, new Set([concept]))).toBe('linked')
  })
})

describe('buildGraph: オーバーレイ（動的ノード + 紐付けの重み）', () => {
  const overlay = {
    books: [{ key: 'isbn:9999', title: '外の本', author: '誰か', year: 2024, cat: 'sf' }],
    concepts: [{ key: 'u_new', label: 'ユーザー概念', description: '', official: false }],
    links: [
      { concept: 'c_test', book: 'book_a', supporters: 3, strength: 4.5 },  // 既存 member と合流
      { concept: 'u_new', book: 'isbn:9999', supporters: 2, strength: 2 },  // 新しい枝
    ],
    bonds: [
      { from: 'book_c', to: 'book_a', rel: 'pre' as const, supporters: 1, strength: 5 }, // Cを先に読むとAが効く
    ],
  }

  it('動的ノードが追加される', () => {
    const g = buildGraph(tinyPayload(), null, overlay)
    const dyn = g.nodes.filter((n) => n.dynamic)
    expect(dyn.map((n) => n.key).sort()).toEqual(['isbn:9999', 'u_new'])
    expect(dyn.find((n) => n.key === 'u_new')?.kind).toBe('concept')
  })

  it('既存の所属エッジは平均強度に置き換わり、無い組は新設される', () => {
    const g = buildGraph(tinyPayload(), null, overlay)
    const members = g.edges.filter((e) => e.type === 'member')
    const merged = members.find((e) => g.nodes[e.from].key === 'c_test' && g.nodes[e.to].key === 'book_a')
    expect(merged?.weight).toBe(4.5) // 票の平均強度で置き換え
    expect(merged?.supporters).toBe(3)
    const created = members.find((e) => g.nodes[e.from].key === 'u_new')
    expect(created?.weight).toBe(2)
    expect(g.nodes[created!.to].key).toBe('isbn:9999')
  })

  it('本と本の紐付けが関係タイプそのもののエッジとして作られる', () => {
    const g = buildGraph(tinyPayload(), null, overlay)
    const bond = g.edges.find((e) => e.supporters === 1 && e.type === 'pre' && e.weight === 5)
    expect(bond).toBeDefined()
    expect(g.nodes[bond!.from].key).toBe('book_c')
    expect(g.nodes[bond!.to].key).toBe('book_a')
  })

  it('後から実体化した本は同じ著者・同シリーズに自動接続される', () => {
    const ov = {
      books: [
        { key: 'isbn:1', title: '新しい本', author: '著者A', year: 2026, cat: 'mys' },
        { key: 'isbn:2', title: '読了本A 2', author: '著者A', year: 2026, cat: 'mys' },
      ],
      concepts: [], links: [], bonds: [],
    }
    const g = buildGraph(tinyPayload(), null, ov)
    const auto = g.edges.filter((e) => e.why.includes('自動接続'))
    // 著者A の既存本(読了本A,読了本B) × 新規2冊 → 同著者エッジ + シリーズ判定
    expect(auto.length).toBeGreaterThanOrEqual(3)
    const series = auto.find((e) => e.type === 'next' && g.nodes[e.to].key === 'isbn:2')
    expect(series).toBeDefined() // 「読了本A 2」は「読了本A」のシリーズ扱い
  })
})

describe('buildGraph: AI推論ループの提案（未検証エッジ）', () => {
  const base = { books: [], concepts: [], links: [], bonds: [] }

  it('proposed / disputed だけが status 付きの破線エッジになる', () => {
    const g = buildGraph(tinyPayload(), null, {
      ...base,
      proposals: [
        { id: 'p1', kind: 'pre' as const, from: 'book_b', to: 'book_d', why: '理由', confidence: 0.8, status: 'proposed' },
        { id: 'p2', kind: 'counter' as const, from: 'book_c', to: 'book_d', why: '理由', confidence: 0.5, status: 'disputed' },
        { id: 'p3', kind: 'alt' as const, from: 'book_a', to: 'book_d', why: '理由', confidence: 0.9, status: 'rejected' },
        { id: 'p4', kind: 'alt' as const, from: 'book_b', to: 'book_c', why: '理由', confidence: 0.9, status: 'verified' },
      ],
    })
    const props = g.edges.filter((e) => e.status)
    expect(props).toHaveLength(2) // rejected / verified は描かない
    const pre = props.find((e) => e.type === 'pre')
    expect(pre?.status).toBe('proposed')
    expect(g.nodes[pre!.from].key).toBe('book_b') // pre は from が前提側
    expect(g.nodes[pre!.to].key).toBe('book_d')
    expect(pre?.why).toContain('AIの提案')
    expect(pre?.why).toContain('80%')
    expect(props.find((e) => e.type === 'counter')?.status).toBe('disputed')
  })

  it('member 提案は概念→本の所属エッジになる', () => {
    const g = buildGraph(tinyPayload(), null, {
      ...base,
      proposals: [
        { id: 'p1', kind: 'member' as const, from: 'c_test', to: 'book_d', why: '理由', confidence: 0.6, status: 'proposed' },
      ],
    })
    const e = g.edges.find((x) => x.status === 'proposed')
    expect(e?.type).toBe('member')
    expect(g.nodes[e!.from].kind).toBe('concept')
    expect(g.nodes[e!.to].key).toBe('book_d')
  })

  it('同種の実エッジが既にある提案は重複して張らない', () => {
    const g = buildGraph(tinyPayload(), null, {
      ...base,
      proposals: [
        // 焼き込みに 読了本A →(pre) 読了本B が既にある
        { id: 'p1', kind: 'pre' as const, from: 'book_a', to: 'book_b', why: '重複', confidence: 0.9, status: 'proposed' },
      ],
    })
    expect(g.edges.filter((e) => e.status)).toHaveLength(0)
  })

  it('グラフに無いキーへの提案は黙って捨てる', () => {
    const g = buildGraph(tinyPayload(), null, {
      ...base,
      proposals: [
        { id: 'p1', kind: 'alt' as const, from: '実在しない本', to: 'book_a', why: 'x', confidence: 0.9, status: 'proposed' },
      ],
    })
    expect(g.edges.filter((e) => e.status)).toHaveLength(0)
  })
})

describe('nodeRadius: 紐付け人数でノードが育つ', () => {
  it('boost に対して単調に増える', () => {
    const g = buildGraph(tinyPayload())
    const n = g.nodes[1]
    const r0 = nodeRadius(n, 1, 0)
    const r5 = nodeRadius(n, 1, 5)
    const r50 = nodeRadius(n, 1, 50)
    expect(r5).toBeGreaterThan(r0)
    expect(r50).toBeGreaterThan(r5)
    // 対数なので爆発はしない
    expect(r50 - r0).toBeLessThan(15)
  })
})
