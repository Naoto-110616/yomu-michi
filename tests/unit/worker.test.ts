import { describe, expect, it } from 'vitest'
import { isbn10to13 } from '../../worker/index'

describe('isbn10to13: ブクログのURL末尾（ISBN-10/ASIN）→ ISBN-13', () => {
  it('チェックディジットを正しく再計算する', () => {
    expect(isbn10to13('410354953X')).toBe('9784103549536') // 成瀬は都を駆け抜ける
    expect(isbn10to13('4151102027')).toBe('9784151102028')
  })

  it('ASIN（Kindle等）や不正な値は空を返す', () => {
    expect(isbn10to13('B0ABCDEF12')).toBe('')
    expect(isbn10to13('')).toBe('')
    expect(isbn10to13('12345')).toBe('')
  })
})
