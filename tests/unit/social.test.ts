import { describe, expect, it } from 'vitest'
import { attachFollowIslands, attachOwnHub, buildGraph } from '@/lib/graph'
import { tinyPayload } from './fixtures'

const input = {
  me: { id: 'u1', username: 'わたし' },
  accounts: [
    { id: 'u2', username: 'あの人' },
    { id: 'u3', username: 'その人' },
  ],
  follows: [
    { follower: 'u1', followee: 'u2' },
    { follower: 'u1', followee: 'u3' },
    { follower: 'u3', followee: 'u1' },
    { follower: 'u2', followee: 'u3' }, // フォロー先同士 — 描かない
  ],
  shelves: new Map([
    ['u2', new Map([['book_a', 3], ['isbn:9999', 5]])],
    ['u3', new Map<string, number>()],
  ]),
  titles: new Map([['book_a', { title: '読了本A', cat: 'mys' }]]),
}

describe('attachFollowIslands: 自分の図の周縁にフォローの島', () => {
  it('自分の全体図は保たれ、島が外側に足される', () => {
    const base = buildGraph(tinyPayload())
    const baseCount = base.nodes.length
    const g = attachFollowIslands(base, input)
    expect(g.nodes.length).toBe(baseCount + 3 + 2) // アカウント3 + 島の本2
    const island = g.nodes.find((n) => n.key === 'acct:u2')!
    expect(Math.hypot(island.x, island.y)).toBeGreaterThan(1000) // 図の外側
    const meAcct = g.nodes.find((n) => n.key === 'acct:u1')!
    expect(meAcct.x).toBe(0) // 自分のアンカーは中央
  })

  it('島の本は別ノード（図は分ける方針）', () => {
    const g = attachFollowIslands(buildGraph(tinyPayload()), input)
    expect(g.nodes.find((n) => n.key === 'u2::book_a')).toBeDefined()
    expect(g.nodes.find((n) => n.key === 'book_a')).toBeDefined() // 自分側はそのまま
  })

  it('本棚の重なりは1冊ごとの橋ではなく、アカウント同士の1本に集約される', () => {
    // 本棚が似ている人ほど橋が何百本も重なって「カーテン」になるため
    const g = attachFollowIslands(buildGraph(tinyPayload()), input)
    const bridges = g.edges.filter((e) => e.type === 'overlap')
    expect(bridges).toHaveLength(1) // u2 と1冊（book_a）重なっている
    expect(g.nodes[bridges[0].from].key).toBe('acct:u1')
    expect(g.nodes[bridges[0].to].key).toBe('acct:u2')
    expect(bridges[0].supporters).toBe(1) // 重なり冊数
    expect(bridges[0].why).toContain('1冊')
  })

  it('フォロー線は自分が絡むものだけ（フォロー先同士は描かない）', () => {
    const g = attachFollowIslands(buildGraph(tinyPayload()), input)
    const follows = g.edges.filter((e) => e.type === 'follow')
    expect(follows).toHaveLength(3) // u1→u2, u1→u3, u3→u1（u2→u3 は落ちる）
    for (const e of follows) {
      expect([g.nodes[e.from].key, g.nodes[e.to].key]).toContain('acct:u1')
    }
    for (const adj of g.adjacency) for (const ei of adj) expect(g.edges[ei]).toBeDefined()
  })
})

describe('attachOwnHub: アカウント → 概念 → 本 の幹', () => {
  function hubSetup(tied: string[]) {
    const g = buildGraph(tinyPayload(), new Map([['book_a', 5], ['book_b', 3]]), {
      books: [], concepts: [
        { key: 'cat:phil', label: '哲学・思想', description: '', official: true, createdBy: null },
      ], links: [], bonds: [],
    })
    const withMe = attachFollowIslands(g, {
      me: { id: 'me', username: 'わたし' },
      accounts: [], follows: [], shelves: new Map(),
      titles: new Map(),
    })
    return attachOwnHub(withMe, {
      meKey: 'acct:me',
      ownConceptKeys: new Set(['cat:phil']),
      tiedBookKeys: new Set(tied),
    })
  }

  it('自分の概念へ hub=concept の線、未整理の本へ hub=book の点線が張られる', () => {
    const g = hubSetup([])
    const hubs = g.edges.filter((e) => e.hub)
    const conceptHub = hubs.find((e) => e.hub === 'concept')
    expect(conceptHub).toBeDefined()
    expect(g.nodes[conceptHub!.to].key).toBe('cat:phil')
    // 読了2冊（book_a, book_b）が未整理としてアカウント直結
    expect(hubs.filter((e) => e.hub === 'book')).toHaveLength(2)
    expect(conceptHub!.dist).toBeGreaterThan(0) // バネの上書きを持つ
  })

  it('概念に紐づけた本はアカウント直結から外れる（=概念側へ移動する）', () => {
    const g = hubSetup(['book_a'])
    const bookHubs = g.edges.filter((e) => e.hub === 'book')
    expect(bookHubs).toHaveLength(1)
    expect(g.nodes[bookHubs[0].to].key).toBe('book_b') // 残るのは未整理のbのみ
  })

  it('アカウントノードが無ければ何もしない（ゲスト）', () => {
    const g = buildGraph(tinyPayload())
    const before = g.edges.length
    const after = attachOwnHub(g, { meKey: 'acct:none', ownConceptKeys: new Set(), tiedBookKeys: new Set() })
    expect(after.edges.length).toBe(before)
  })
})
