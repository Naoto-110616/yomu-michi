import { describe, expect, it } from 'vitest'
import { buildSocialGraph } from '@/lib/graph'

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
    ['u1', new Map([['夜と霧', 5], ['十角館の殺人', 4]])],
    ['u2', new Map([['夜と霧', 3]])],
    ['u3', new Map<string, number>()],
  ]),
  titles: new Map([
    ['夜と霧', { title: '夜と霧', cat: 'mind' }],
    ['十角館の殺人', { title: '十角館の殺人', cat: 'mys' }],
  ]),
}

describe('buildSocialGraph: フォローの地図', () => {
  it('自分が中央(0,0)、フォロー先が周囲に置かれる', () => {
    const g = buildSocialGraph(input)
    const me = g.nodes.find((n) => n.key === 'acct:u1')!
    const other = g.nodes.find((n) => n.key === 'acct:u2')!
    expect(me.x).toBe(0)
    expect(me.y).toBe(0)
    expect(Math.hypot(other.x, other.y)).toBeGreaterThan(400)
    expect(me.kind).toBe('account')
  })

  it('本棚がアカウントごとのクラスタになり、所属エッジで繋がる', () => {
    const g = buildSocialGraph(input)
    const myBooks = g.nodes.filter((n) => n.key.startsWith('u1::'))
    expect(myBooks).toHaveLength(2)
    const members = g.edges.filter((e) => e.type === 'member')
    expect(members).toHaveLength(3) // u1:2冊 + u2:1冊
  })

  it('フォロー線が張られる', () => {
    const g = buildSocialGraph(input)
    const follows = g.edges.filter((e) => e.type === 'follow')
    expect(follows).toHaveLength(3)
  })

  it('同じ本を読んでいる者どうしに橋が架かる', () => {
    const g = buildSocialGraph(input)
    const bridges = g.edges.filter((e) => e.why === '同じ本を読んでいる')
    expect(bridges).toHaveLength(1) // 夜と霧: u1 と u2
    const [a, b] = [g.nodes[bridges[0].from].key, g.nodes[bridges[0].to].key]
    expect([a, b].every((k) => k.endsWith('::夜と霧'))).toBe(true)
  })

  it('隣接リストが破綻していない', () => {
    const g = buildSocialGraph(input)
    for (const adj of g.adjacency) for (const ei of adj) expect(g.edges[ei]).toBeDefined()
  })
})
