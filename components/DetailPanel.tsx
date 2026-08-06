'use client'

import { CATEGORY_META, RELATION_META, STAR_COLOR, starLabel, type BookNode, type RelationType } from '@/lib/graph'

type Rel = { node: number; type: RelationType; why: string }

function RelList({ items, nodes, onSelect }: { items: Rel[]; nodes: BookNode[]; onSelect: (i: number) => void }) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((r, i) => {
        const m = RELATION_META[r.type]
        return (
          <li
            key={`${r.node}-${r.type}-${i}`}
            onClick={() => onSelect(r.node)}
            className="cursor-pointer border-b border-[#20252e] py-[7px] text-[12px] leading-[1.5] last:border-b-0 active:text-acc"
          >
            <em
              className="mr-1.5 inline-block whitespace-nowrap rounded-full border px-1.5 py-px align-[1px] text-[9.5px] not-italic"
              style={{ color: m.color, borderColor: m.color }}
            >
              {m.label}
            </em>
            {nodes[r.node].title}
            {r.why && <span className="mt-0.5 block text-[10.5px] leading-[1.5] text-dim">{r.why}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export default function DetailPanel({
  node, nodes, incoming, outgoing, canRate, onRate, onSelect, onClose,
}: {
  node: BookNode
  nodes: BookNode[]
  incoming: Rel[]
  outgoing: Rel[]
  canRate: boolean
  onRate: (key: string, star: number | null) => void
  onSelect: (i: number) => void
  onClose: () => void
}) {
  const isConcept = node.kind === 'concept'
  const starColor = isConcept
    ? '#c4b5fd'
    : node.star === null
      ? CATEGORY_META[node.cat].color
      : (STAR_COLOR[node.star] ?? '#6b7382')
  return (
    <aside className="absolute right-2.5 top-2.5 z-[5] max-h-[calc(100%-18px)] w-[min(330px,76vw)] overflow-y-auto rounded-[13px] border border-line bg-panel/[0.975] p-[14px_15px] backdrop-blur max-[640px]:inset-x-2 max-[640px]:bottom-2 max-[640px]:top-auto max-[640px]:max-h-[50%] max-[640px]:w-auto">
      <button onClick={onClose} className="float-right -mr-1 -mt-0.5 px-1 text-[17px] leading-none text-muted">
        ×
      </button>
      {isConcept && (
        <p className="m-0 mb-1 text-[10px] tracking-[0.12em] text-[#a78bfa]">概念</p>
      )}
      <h2 className="m-0 mb-1 pr-4 text-[15px] leading-[1.45]">{node.title}</h2>
      {isConcept ? (
        <p className="m-0 mb-2 text-[12px] leading-[1.75] text-[#c3c9d2]">{node.desc}</p>
      ) : (
        <>
          <p className="m-0 mb-2 text-[11.5px] text-muted">
            {node.author}
            {node.year > 0 && ` / ${node.year}`}
          </p>
          <p className="m-0 mb-1.5 text-[12.5px] tracking-[0.1em]" style={{ color: starColor }}>
            {starLabel(node.star)}
            {node.star === null && <span className="text-[11px] tracking-normal"> — 世間の本</span>}
          </p>
          {canRate && (
            <div className="mb-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => onRate(node.key, node.star === s ? null : s)}
                  className="px-0.5 text-[17px] leading-none transition-transform active:scale-125"
                  style={{ color: node.star !== null && node.star >= s ? '#fbbf24' : '#3a4150' }}
                  aria-label={`星${s}`}
                >
                  ★
                </button>
              ))}
              <button
                onClick={() => onRate(node.key, node.star === null ? 0 : null)}
                className="ml-1.5 rounded-full border border-line px-2 py-0.5 text-[10.5px] text-muted active:text-text"
              >
                {node.star === null ? '読んだことにする' : '本棚から外す'}
              </button>
            </div>
          )}
        </>
      )}
      {!isConcept && <p className="m-0 mb-1.5 text-[11.5px] text-muted">{CATEGORY_META[node.cat].label}</p>}
      {node.sources.map((s) => (
        <span key={s} className="mb-1 mr-1 inline-block rounded-full border border-line px-2 py-px text-[10.5px] text-dim">
          {s}
        </span>
      ))}
      {incoming.length > 0 && (
        <>
          <p className="mb-1 mt-3 text-[10px] tracking-[0.05em] text-dim">
            ▸ {isConcept ? 'この概念に属する' : 'この本に向かっている'} ({incoming.length})
          </p>
          <RelList items={incoming} nodes={nodes} onSelect={onSelect} />
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <p className="mb-1 mt-3 text-[10px] tracking-[0.05em] text-dim">
            ▸ {isConcept ? 'この概念に属する' : 'ここから伸びている'} ({outgoing.length})
          </p>
          <RelList items={outgoing} nodes={nodes} onSelect={onSelect} />
        </>
      )}
      {incoming.length === 0 && outgoing.length === 0 && (
        <p className="mt-2.5 text-[12px] text-muted">表示中の条件では、つながりがありません。</p>
      )}
    </aside>
  )
}
