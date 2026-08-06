/**
 * テスト用の最小ペイロード。
 * 概念1 + 本4冊（読了2・紐づく1・その他1）という、階層判定に必要な最小構成。
 */
import { CATEGORIES, type Payload } from '@/lib/graph'

const cat = (c: string) => CATEGORIES.indexOf(c as (typeof CATEGORIES)[number])

export function tinyPayload(): Payload {
  return {
    C: [...CATEGORIES],
    T: ['alt', 'next', 'pre', 'counter', 'member'],
    K: ['book', 'concept'],
    A: ['著者A', '著者B'],
    S: [],
    W: ['テスト用の理由'],
    D: ['テスト用の概念説明'],
    n: [
      // [title, author, year, cat, star(-1=null), shelf, x, y, src[], kind, desc, key]
      ['概念X', 0, 0, cat('phil'), -1, 0, 0, 0, [], 1, 0, 'c_test'],
      ['読了本A', 0, 2020, cat('mys'), 5, 1, 60, 0, [], 0, -1, 'book_a'],
      ['読了本B', 0, 2021, cat('mys'), 3, 1, 120, 0, [], 0, -1, 'book_b'],
      ['紐づく本C', 1, 2022, cat('sf'), -1, 0, 180, 0, [], 0, -1, 'book_c'],
      ['遠い本D', 1, 2023, cat('sf'), -1, 0, 240, 0, [], 0, -1, 'book_d'],
    ],
    e: [
      // [from, to, type, why]
      [0, 1, 4, 0], // 概念X →(member) 読了本A
      [1, 3, 0, 0], // 読了本A —(alt)— 紐づく本C
      [3, 4, 0, 0], // 紐づく本C —(alt)— 遠い本D
      [1, 2, 2, 0], // 読了本A →(pre) 読了本B
    ],
    meta: { nodes: 5, edges: 4, shelf: 2, byType: {}, raw: 5 },
  }
}
