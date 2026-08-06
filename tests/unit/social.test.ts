import { describe, expect, it } from 'vitest'
import { attachFollowIslands, buildGraph } from '@/lib/graph'
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

  it('同じ本を読んでいると島と島の橋（overlap）が架かる', () => {
    const g = attachFollowIslands(buildGraph(tinyPayload()), input)
    const bridges = g.edges.filter((e) => e.type === 'overlap')
    expect(bridges).toHaveLength(1) // book_a のみ（isbn:9999 は自分の図に無い）
    expect(g.nodes[bridges[0].from].key).toBe('book_a')
    expect(g.nodes[bridges[0].to].key).toBe('u2::book_a')
  })

  it('フォロー線と隣接リストが破綻していない', () => {
    const g = attachFollowIslands(buildGraph(tinyPayload()), input)
    expect(g.edges.filter((e) => e.type === 'follow')).toHaveLength(3)
    for (const adj of g.adjacency) for (const ei of adj) expect(g.edges[ei]).toBeDefined()
  })
})
