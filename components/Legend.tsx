import { RELATIONS, RELATION_META } from '@/lib/graph'

const STARS: [number, string][] = [[5, '#fbbf24'], [4, '#7dd3fc'], [3, '#86efac'], [2, '#f472b6']]

export default function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-[10px] border border-line bg-panel/85 px-2.5 py-2 text-[10px] leading-[1.85] text-muted backdrop-blur max-[640px]:text-[9.5px]">
      <b className="mb-0.5 block font-semibold text-text">線</b>
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
