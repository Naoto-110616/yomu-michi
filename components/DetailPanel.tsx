'use client'

import { useState } from 'react'

import { CATEGORY_META, RELATION_META, STAR_COLOR, starLabel, type BookNode, type RelationType } from '@/lib/graph'
import { readLinks } from '@/lib/overlay'

export interface ConceptChip {
  key: string
  label: string
  supporters: number
  mine: boolean
}

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
  chips, allConcepts, onToggleLink, onCreateConcept,
}: {
  node: BookNode
  nodes: BookNode[]
  incoming: Rel[]
  outgoing: Rel[]
  canRate: boolean
  onRate: (key: string, star: number | null) => void
  onSelect: (i: number) => void
  onClose: () => void
  /** この本に付いている概念（投票数つき） */
  chips: ConceptChip[]
  /** 紐付け候補（公式 + ユーザー概念） */
  allConcepts: { key: string; label: string }[]
  onToggleLink: (conceptKey: string, bookKey: string, currentlyMine: boolean) => void
  onCreateConcept: (label: string, bookKey: string) => void
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
      {!isConcept && <ConceptChips
        node={node} chips={chips} allConcepts={allConcepts} canRate={canRate}
        onToggleLink={onToggleLink} onCreateConcept={onCreateConcept} />}
      {!isConcept && <ReadLinks node={node} />}
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


/* ── この本が属する概念（＝ハッシュタグ + 投票） ─────────────── */

function ConceptChips({
  node, chips, allConcepts, canRate, onToggleLink, onCreateConcept,
}: {
  node: BookNode
  chips: ConceptChip[]
  allConcepts: { key: string; label: string }[]
  canRate: boolean
  onToggleLink: (conceptKey: string, bookKey: string, currentlyMine: boolean) => void
  onCreateConcept: (label: string, bookKey: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const attached = new Set(chips.map((c) => c.key))
  const candidates = allConcepts
    .filter((c) => !attached.has(c.key))
    .filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8)
  const canCreate = q.trim().length >= 2 && !allConcepts.some((c) => c.label === q.trim())

  return (
    <div className="mb-2">
      <p className="mb-1 mt-1 text-[10px] tracking-[0.05em] text-dim">▸ 概念（紐付けた人数が太さになる）</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            disabled={!canRate}
            onClick={() => onToggleLink(c.key, node.key, c.mine)}
            title={canRate ? (c.mine ? 'タップで紐付けを外す' : 'タップで自分も紐付ける') : 'ログインすると紐付けられます'}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] transition-colors ${
              c.mine
                ? 'border-[#7c6bd6] bg-[#a78bfa]/25 text-[#e9d5ff]'
                : 'border-[#3b3357] bg-[#a78bfa]/10 text-[#c4b5fd]'
            } disabled:opacity-70`}
          >
            #{c.label}
            <span className="text-[10px] tabular-nums opacity-80">{c.supporters}</span>
          </button>
        ))}
        {canRate && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-line px-2 py-[3px] text-[11px] text-dim active:text-muted"
          >
            ＋ 紐付ける
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-1.5 rounded-[10px] border border-line bg-panel2 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="概念を検索、なければ新規作成…"
            className="mb-1.5 w-full appearance-none rounded-lg border border-line bg-panel px-2 py-1.5 text-[12px] text-text outline-none placeholder:text-dim"
          />
          <div className="flex flex-wrap gap-1">
            {candidates.map((c) => (
              <button
                key={c.key}
                onClick={() => { onToggleLink(c.key, node.key, false); setAdding(false); setQ('') }}
                className="rounded-full border border-[#3b3357] bg-[#a78bfa]/10 px-2 py-[3px] text-[11px] text-[#c4b5fd]"
              >
                #{c.label}
              </button>
            ))}
            {canCreate && (
              <button
                onClick={() => { onCreateConcept(q.trim(), node.key); setAdding(false); setQ('') }}
                className="rounded-full border border-[#2f4a58] bg-acc/10 px-2 py-[3px] text-[11px] font-bold text-acc"
              >
                「{q.trim()}」を作って紐付け
              </button>
            )}
          </div>
          <button onClick={() => { setAdding(false); setQ('') }} className="mt-1 text-[10px] text-dim">
            閉じる
          </button>
        </div>
      )}
    </div>
  )
}

/* ── すぐ読み始める（図書館 / 新品 / 中古） ──────────────── */

function ReadLinks({ node }: { node: BookNode }) {
  const links = readLinks(node.title, node.author, node.isbn)
  return (
    <div className="mb-1">
      <p className="mb-1 mt-2 text-[10px] tracking-[0.05em] text-dim">▸ すぐ読み始める</p>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title={l.hint}
            className="rounded-full border border-line bg-panel2 px-2.5 py-[4px] text-[11px] text-muted no-underline active:text-text"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  )
}
