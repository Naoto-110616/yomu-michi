'use client'

import { useState } from 'react'

import { CATEGORY_META, RELATION_META, STAR_COLOR, starLabel, type BookNode, type RelationType } from '@/lib/graph'
import { bondPair, coverUrl, readLinks } from '@/lib/overlay'

export interface ConceptChip {
  key: string
  label: string
  supporters: number
  /** 全ユーザーの平均強度 1-5 */
  strength: number
  /** 自分が付けた強度。未紐付けなら null */
  mine: number | null
}

export interface BondChip {
  otherKey: string
  otherIndex: number
  label: string
  supporters: number
  strength: number
  mine: number | null
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
  chips, bonds, shelfBooks, linkedBookKeys, allConcepts, onSetTie, onSetBond, onCreateConcept, onViewAccount,
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
  bonds: BondChip[]
  /** 自分の本棚（概念側から紐付ける候補 = 読んだことがある本だけ） */
  shelfBooks: { key: string; title: string }[]
  /** この概念に既に紐付いている本のキー */
  linkedBookKeys: Set<string>
  /** 紐付け候補（公式 + ユーザー概念） */
  allConcepts: { key: string; label: string }[]
  onSetTie: (conceptKey: string, bookKey: string, strength: number | null) => void
  onSetBond: (bookKey: string, otherKey: string, strength: number | null) => void
  onCreateConcept: (label: string, bookKey: string) => void
  onViewAccount?: (id: string, username: string) => void
}) {
  const isConcept = node.kind === 'concept'
  const isAccount = node.kind === 'account'
  if (isAccount) {
    const books = incoming.length + outgoing.length
    return (
      <aside className="absolute right-2.5 top-2.5 z-[5] max-h-[calc(100%-18px)] w-[min(330px,76vw)] overflow-y-auto rounded-[13px] border border-line bg-panel/[0.975] p-[14px_15px] backdrop-blur max-[640px]:inset-x-2 max-[640px]:bottom-2 max-[640px]:top-auto max-[640px]:max-h-[50%] max-[640px]:w-auto">
        <button onClick={onClose} className="float-right -mr-1 -mt-0.5 px-1 text-[17px] leading-none text-muted">×</button>
        <p className="m-0 mb-1 text-[10px] tracking-[0.12em] text-[#f0abfc]">アカウント</p>
        <h2 className="m-0 mb-1 pr-4 text-[15px] leading-[1.45]">{node.title}</h2>
        <p className="m-0 mb-3 text-[11.5px] text-muted">本棚 {books} 冊のクラスタ</p>
        {onViewAccount && (
          <button
            onClick={() => onViewAccount(node.key.slice(5), node.title)}
            className="w-full rounded-lg border border-[#2f4a58] bg-acc/10 py-2 text-[12px] font-bold text-acc active:bg-acc/25"
          >
            この人の地図を見る
          </button>
        )}
      </aside>
    )
  }
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
      {!isConcept && <Cover node={node} />}
      <h2 className="m-0 mb-1 pr-4 text-[15px] leading-[1.45]">{node.title}</h2>
      {isConcept ? (
        <>
          <p className="m-0 mb-2 text-[12px] leading-[1.75] text-[#c3c9d2]">{node.desc}</p>
          {canRate && (
            <ConceptLinker node={node} shelfBooks={shelfBooks} linked={linkedBookKeys} onSetTie={onSetTie} />
          )}
        </>
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
        onSetTie={onSetTie} onCreateConcept={onCreateConcept} />}
      {!isConcept && <BondChips
        node={node} nodes={nodes} bonds={bonds} canRate={canRate}
        onSetBond={onSetBond} onSelect={onSelect} />}
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

/** 1-5 の強度スター。value=null は未設定 */
function StarStrength({ value, onPick }: { value: number | null; onPick: (s: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          onClick={(e) => { e.stopPropagation(); onPick(value === s ? null : s) }}
          className="px-px text-[14px] leading-none transition-transform active:scale-125"
          style={{ color: value !== null && value >= s ? '#a78bfa' : '#39404e' }}
          aria-label={`強さ${s}`}
        >
          ★
        </button>
      ))}
    </span>
  )
}

function Cover({ node }: { node: BookNode }) {
  const [hidden, setHidden] = useState(false)
  const url = coverUrl(node.isbn)
  if (!url || hidden) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setHidden(true)}
      className="float-right ml-2 mb-1 h-[92px] w-auto rounded-md border border-line object-cover"
    />
  )
}

function ConceptChips({
  node, chips, allConcepts, canRate, onSetTie, onCreateConcept,
}: {
  node: BookNode
  chips: ConceptChip[]
  allConcepts: { key: string; label: string }[]
  canRate: boolean
  onSetTie: (conceptKey: string, bookKey: string, strength: number | null) => void
  onCreateConcept: (label: string, bookKey: string) => void
  onViewAccount?: (id: string, username: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const attached = new Set(chips.map((c) => c.key))
  const candidates = allConcepts
    .filter((c) => !attached.has(c.key))
    .filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8)
  const canCreate = q.trim().length >= 2 && !allConcepts.some((c) => c.label === q.trim())

  return (
    <div className="mb-2">
      <p className="mb-1 mt-1 text-[10px] tracking-[0.05em] text-dim">
        ▸ 概念との結びつき（強さ1-5の平均が太さになる）
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c.key} className="inline-flex flex-col">
            <button
              onClick={() => canRate && setOpen(open === c.key ? null : c.key)}
              title={canRate ? '自分の強さを付ける' : 'ログインすると強さを付けられます'}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] transition-colors ${
                c.mine !== null
                  ? 'border-[#7c6bd6] bg-[#a78bfa]/25 text-[#e9d5ff]'
                  : 'border-[#3b3357] bg-[#a78bfa]/10 text-[#c4b5fd]'
              }`}
            >
              #{c.label}
              <span className="text-[10px] tabular-nums opacity-90">{c.strength.toFixed(1)}</span>
              <span className="text-[9.5px] tabular-nums opacity-60">({c.supporters}人)</span>
            </button>
            {open === c.key && (
              <span className="mt-1 flex items-center gap-1 rounded-lg border border-line bg-panel2 px-1.5 py-1">
                <StarStrength value={c.mine} onPick={(st) => { onSetTie(c.key, node.key, st); setOpen(null) }} />
              </span>
            )}
          </span>
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
                onClick={() => { onSetTie(c.key, node.key, 3); setAdding(false); setQ('') }}
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

/* ── 概念側からの紐付け（候補 = 読んだことがある本） ─────── */

function ConceptLinker({
  node, shelfBooks, linked, onSetTie,
}: {
  node: BookNode
  shelfBooks: { key: string; title: string }[]
  linked: Set<string>
  onSetTie: (conceptKey: string, bookKey: string, strength: number | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [strength, setStrength] = useState(3)
  const candidates = shelfBooks
    .filter((b) => !linked.has(b.key))
    .filter((b) => !q || b.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8)
  return (
    <div className="mb-2">
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-[#3b3357] px-2.5 py-[4px] text-[11px] text-[#c4b5fd] active:bg-[#a78bfa]/15"
        >
          ＋ 読んだ本から紐付ける
        </button>
      ) : (
        <div className="rounded-[10px] border border-line bg-panel2 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="自分の本棚から検索…"
            className="mb-1.5 w-full appearance-none rounded-lg border border-line bg-panel px-2 py-1.5 text-[12px] text-text outline-none placeholder:text-dim"
          />
          <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-dim">
            強さ
            <StarStrength value={strength} onPick={(st) => setStrength(st ?? 3)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {candidates.length === 0 && (
              <span className="text-[11px] text-dim">候補なし（読んだ本だけが候補になります）</span>
            )}
            {candidates.map((b) => (
              <button
                key={b.key}
                onClick={() => { onSetTie(node.key, b.key, strength); setQ('') }}
                className="rounded-full border border-[#3b3357] bg-[#a78bfa]/10 px-2 py-[3px] text-[11px] text-[#c4b5fd]"
              >
                {b.title.length > 14 ? b.title.slice(0, 13) + '…' : b.title}
              </button>
            ))}
          </div>
          <button onClick={() => { setAdding(false); setQ('') }} className="mt-1 text-[10px] text-dim">閉じる</button>
        </div>
      )}
    </div>
  )
}

/* ── 本と本の結びつき ─────────────────────────────── */

function BondChips({
  node, nodes, bonds, canRate, onSetBond, onSelect,
}: {
  node: BookNode
  nodes: BookNode[]
  bonds: BondChip[]
  canRate: boolean
  onSetBond: (bookKey: string, otherKey: string, strength: number | null) => void
  onSelect: (i: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const attached = new Set(bonds.map((b) => b.otherKey))
  const candidates = q.trim().length >= 2
    ? nodes
        .filter((n) => n.kind === 'book' && n.key !== node.key && !attached.has(n.key))
        .filter((n) => n.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 6)
    : []
  return (
    <div className="mb-2">
      <p className="mb-1 mt-2 text-[10px] tracking-[0.05em] text-dim">▸ 結びつく本</p>
      <div className="flex flex-wrap gap-1.5">
        {bonds.map((b) => (
          <span key={b.otherKey} className="inline-flex flex-col">
            <button
              onClick={() => (canRate ? setOpen(open === b.otherKey ? null : b.otherKey) : onSelect(b.otherIndex))}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] transition-colors ${
                b.mine !== null
                  ? 'border-[#0e7490] bg-[#22d3ee]/20 text-[#a5f3fc]'
                  : 'border-[#155e70] bg-[#22d3ee]/10 text-[#67e8f9]'
              }`}
            >
              {b.label.length > 12 ? b.label.slice(0, 11) + '…' : b.label}
              <span className="text-[10px] tabular-nums opacity-90">{b.strength.toFixed(1)}</span>
            </button>
            {open === b.otherKey && (
              <span className="mt-1 flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-1.5 py-1">
                <StarStrength value={b.mine} onPick={(st) => { onSetBond(node.key, b.otherKey, st); setOpen(null) }} />
                <button onClick={() => onSelect(b.otherIndex)} className="text-[10px] text-dim">見る</button>
              </span>
            )}
          </span>
        ))}
        {canRate && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-line px-2 py-[3px] text-[11px] text-dim active:text-muted"
          >
            ＋ 本と結びつける
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-1.5 rounded-[10px] border border-line bg-panel2 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="結びつける本のタイトルを検索…"
            className="mb-1.5 w-full appearance-none rounded-lg border border-line bg-panel px-2 py-1.5 text-[12px] text-text outline-none placeholder:text-dim"
          />
          <div className="flex flex-wrap gap-1">
            {candidates.map((n) => (
              <button
                key={n.key}
                onClick={() => { onSetBond(node.key, n.key, 3); setAdding(false); setQ('') }}
                className="rounded-full border border-[#155e70] bg-[#22d3ee]/10 px-2 py-[3px] text-[11px] text-[#67e8f9]"
              >
                {n.title.length > 14 ? n.title.slice(0, 13) + '…' : n.title}
              </button>
            ))}
          </div>
          <button onClick={() => { setAdding(false); setQ('') }} className="mt-1 text-[10px] text-dim">閉じる</button>
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
