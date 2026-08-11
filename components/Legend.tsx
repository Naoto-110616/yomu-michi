'use client'

/**
 * 凡例。右下に「?」チップとして畳んでおき、必要なときだけ開く。
 * 左下は AI提案（ProposalDock）の定位置なので、重ならないよう右下に住む。
 * 開閉の記憶は localStorage（初見の人には畳んだ状態 = 地図が主役）。
 */
import { useEffect, useState } from 'react'
import { RELATIONS, RELATION_META } from '@/lib/graph'

const STARS: [number, string][] = [[5, '#fbbf24'], [4, '#7dd3fc'], [3, '#86efac'], [2, '#f472b6']]

export default function Legend() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { setOpen(localStorage.getItem('yomu:legend') === '1') } catch { /* no-op */ }
  }, [])
  const toggle = () => setOpen((v) => {
    const next = !v
    try { localStorage.setItem('yomu:legend', next ? '1' : '0') } catch { /* no-op */ }
    return next
  })

  if (!open) {
    return (
      <button
        onClick={toggle}
        title="凡例を表示"
        className="absolute bottom-2.5 right-2.5 z-[4] rounded-full border border-line bg-panel/85 px-2.5 py-1.5 text-[10.5px] text-muted shadow-lg backdrop-blur active:text-text"
      >
        凡例 ?
      </button>
    )
  }

  return (
    <div className="absolute bottom-2.5 right-2.5 z-[4] rounded-[10px] border border-line bg-panel/90 px-2.5 py-2 text-[10px] leading-[1.85] text-muted shadow-xl backdrop-blur max-[640px]:text-[9.5px]">
      <div className="flex items-center">
        <b className="font-semibold text-text">線</b>
        <button onClick={toggle} className="-mr-1 ml-auto px-1.5 text-[13px] leading-none text-dim active:text-text">×</button>
      </div>
      {RELATIONS.map((t) => {
        const m = RELATION_META[t]
        return (
          <span key={t} className="block">
            <i className="mr-1.5 inline-block h-0 w-[14px] border-t-2 align-middle"
               style={{ borderColor: m.color, borderTopStyle: m.dashed ? 'dashed' : 'solid' }} />
            {m.label}
            <span className="text-dim max-[640px]:hidden"> — {m.hint}</span>
          </span>
        )
      })}
      <b className="mb-0.5 mt-1.5 block font-semibold text-text">丸</b>
      <span className="block"><span style={{ color: '#a78bfa' }}>●</span> 概念（いちばん大きい）</span>
      {STARS.map(([s, c]) => (
        <span key={s} style={{ color: c }} className="mr-1">●<span className="text-muted">{s}</span></span>
      ))}
      <span className="block">
        <span style={{ color: '#5eead4' }}>●</span>
        <span style={{ color: '#f9a8d4' }}>●</span> 未読 — 領域の色
      </span>
    </div>
  )
}
