import { describe, expect, it } from 'vitest'
import { computeOverlaps, rejectRate, type Proposal } from '@/lib/overlay'

describe('computeOverlaps: 本棚の重なり → フォロー候補', () => {
  const rows = [
    { user_id: 'me', book_key: '夜と霧' },
    { user_id: 'a', book_key: '夜と霧' },
    { user_id: 'a', book_key: '三体' },
    { user_id: 'a', book_key: '知らない本' },
    { user_id: 'b', book_key: '三体' },
    { user_id: 'c', book_key: '関係ない本' },
  ]

  it('自分の棚と重なる本だけを、人ごとに数える', () => {
    const m = computeOverlaps('me', new Set(['夜と霧', '三体']), rows)
    expect(m.get('a')).toEqual(['夜と霧', '三体'])
    expect(m.get('b')).toEqual(['三体'])
    expect(m.has('c')).toBe(false) // 重なりゼロは載らない
  })

  it('自分自身は候補にならない', () => {
    const m = computeOverlaps('me', new Set(['夜と霧']), rows)
    expect(m.has('me')).toBe(false)
  })

  it('棚が空なら候補も空', () => {
    expect(computeOverlaps('me', new Set(), rows).size).toBe(0)
  })
})

describe('rejectRate: AIの却下率（信頼の較正材料）', () => {
  const p = (kind: Proposal['kind'], status: Proposal['status']): Proposal => ({
    id: crypto.randomUUID(), kind, from: 'x', to: 'y', why: '', confidence: 0.5,
    evidence: null, yes: 0, no: 0, unsure: 0, status, myVote: null,
  })

  it('判定ゼロなら null（率を出せない）', () => {
    expect(rejectRate([p('pre', 'proposed')])).toBe(null)
  })

  it('種類ごとの却下率を出す', () => {
    const list = [
      p('pre', 'verified'), p('pre', 'rejected'), p('pre', 'proposed'),
      p('alt', 'rejected'),
    ]
    expect(rejectRate(list, 'pre')).toBeCloseTo(0.5) // 判定済み2件中1件却下
    expect(rejectRate(list, 'alt')).toBe(1)
    expect(rejectRate(list)).toBeCloseTo(2 / 3)
  })
})
