import { describe, expect, it } from 'vitest'
import { computeOverlaps, planAutoTies, rejectRate, type Proposal } from '@/lib/overlay'

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

describe('planAutoTies: 領域 → 概念の自動紐付け計画', () => {
  const concepts = new Set(['cat:phil', 'cat:lit', 'cat:sf'])
  const cats = new Map([
    ['夜と霧', 'phil'],
    ['三体', 'sf'],
    ['謎の本', 'unknown'], // 概念が存在しない領域
  ])
  const catOf = (k: string) => cats.get(k)

  it('未整理の本だけを、その領域の概念へ紐づける（強度=星）', () => {
    const shelf: [string, number][] = [['夜と霧', 5], ['三体', 4]]
    const rows = planAutoTies(shelf, new Set(), catOf, concepts)
    expect(rows).toEqual([
      { concept_key: 'cat:phil', book_key: '夜と霧', strength: 5 },
      { concept_key: 'cat:sf', book_key: '三体', strength: 4 },
    ])
  })

  it('手動で紐付け済みの本には触らない', () => {
    const rows = planAutoTies([['夜と霧', 5]], new Set(['夜と霧']), catOf, concepts)
    expect(rows).toEqual([])
  })

  it('未評価（星0）は控えめの強度3、領域不明は文芸に寄せる', () => {
    const rows = planAutoTies([['よく分からない本', 0]], new Set(), catOf, concepts)
    expect(rows).toEqual([{ concept_key: 'cat:lit', book_key: 'よく分からない本', strength: 3 }])
  })

  it('対応する概念が実在しない領域はスキップ（FK違反を出さない）', () => {
    const rows = planAutoTies([['謎の本', 3]], new Set(), catOf, new Set(['cat:phil']))
    expect(rows).toEqual([])
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
