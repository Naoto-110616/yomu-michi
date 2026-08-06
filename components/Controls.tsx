'use client'

import {
  CATEGORIES, CATEGORY_META, DEPTHS, RELATIONS, RELATION_META,
  type BookNode, type Category, type RelationType, type ViewMode,
} from '@/lib/graph'
import type { NdlItem } from '@/lib/overlay'
import WorldSearch from './WorldSearch'

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'all', label: '全体' },
  { id: 'shelf', label: '読んだ本' },
  { id: 'human', label: '人が張った線' },
]

function Chip({ on, onClick, swatch, label, count }: {
  on: boolean; onClick: () => void; swatch?: React.ReactNode; label: string; count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[11.5px] transition-colors ${
        on ? 'border-[#39424f] bg-[#232a35] text-text' : 'border-line bg-panel2 text-[#525b69]'
      }`}
    >
      {swatch}
      <span>{label}</span>
      {count !== undefined && <span className="text-[10px] tabular-nums text-dim">{count}</span>}
    </button>
  )
}

export default function Controls(props: {
  open: boolean
  depth: number
  onDepth: (d: number) => void
  nodeScale: number
  onNodeScale: (s: number) => void
  mode: ViewMode
  onMode: (m: ViewMode) => void
  edgeTypes: Set<RelationType>
  onEdgeType: (t: RelationType) => void
  edgeCounts: Record<string, number>
  categories: Set<Category>
  onCategory: (c: Category) => void
  catCounts: Record<string, number>
  query: string
  onQuery: (q: string) => void
  concepts: BookNode[]
  onPickConcept: (i: number) => void
  worldSearch: {
    loggedIn: boolean
    knownKeys: Set<string>
    onMaterialize: (item: NdlItem) => Promise<void>
  }
}) {
  return (
    <div
      className={`z-10 flex-none overflow-y-auto border-b border-line bg-panel transition-[max-height,padding] duration-300 ease-out ${
        props.open ? 'max-h-[min(58vh,460px)] px-3.5 pb-3.5 pt-3' : 'max-h-0 overflow-hidden px-3.5 py-0'
      }`}
    >
      {/* 世界の本を探す */}
      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">世界の本を探す</p>
      <div className="mb-3">
        <WorldSearch {...props.worldSearch} />
      </div>

      {/* ネットワークのサイズ */}
      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">ネットワークのサイズ</p>
      <div className="mb-1 flex gap-1.5">
        {DEPTHS.map((d) => (
          <button
            key={d.id}
            onClick={() => props.onDepth(d.id)}
            className={`flex-1 rounded-lg border px-1 py-2 text-[11.5px] transition-colors ${
              props.depth === d.id
                ? 'border-[#4c3f7a] bg-[#a78bfa]/12 font-bold text-[#c4b5fd]'
                : 'border-line bg-panel2 text-muted'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-dim">
        概念 → 読んだ本 → 紐づく本 の順に広げます。
      </p>

      {/* ノードの大きさ */}
      <div className="mb-3 flex items-center gap-3">
        <span className="flex-none text-[10px] tracking-[0.09em] text-dim">ノードの大きさ</span>
        <input
          type="range" min={0.6} max={1.8} step={0.05} value={props.nodeScale}
          onChange={(e) => props.onNodeScale(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[#2a3039] accent-[#a78bfa]"
        />
        <span className="w-8 flex-none text-right text-[10px] tabular-nums text-dim">
          {props.nodeScale.toFixed(2)}
        </span>
      </div>

      {/* 概念に飛ぶ */}
      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">
        概念（{props.concepts.length}）— 押すとその周辺へ
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {props.concepts.map((c) => (
          <button
            key={c.i}
            onClick={() => props.onPickConcept(c.i)}
            title={c.desc}
            className="rounded-full border border-[#3b3357] bg-[#a78bfa]/10 px-2.5 py-[5px] text-[11.5px] text-[#c4b5fd] transition-colors active:bg-[#a78bfa]/25"
          >
            {c.title}
          </button>
        ))}
        <button
          disabled
          title="AIが提案し、あなたが直す形で増やしていきます"
          className="rounded-full border border-dashed border-line px-2.5 py-[5px] text-[11.5px] text-dim"
        >
          ＋ 概念を追加（近日）
        </button>
      </div>

      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">表示モード</p>
      <div className="mb-3 flex gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => props.onMode(m.id)}
            className={`flex-1 rounded-lg border px-1 py-2 text-[11.5px] transition-colors ${
              props.mode === m.id
                ? 'border-[#2f4a58] bg-acc/10 font-bold text-acc'
                : 'border-line bg-panel2 text-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">つながりの種類</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {RELATIONS.map((t) => {
          const m = RELATION_META[t]
          return (
            <Chip
              key={t}
              on={props.edgeTypes.has(t)}
              onClick={() => props.onEdgeType(t)}
              count={props.edgeCounts[t] ?? 0}
              label={m.label}
              swatch={
                <i className="inline-block h-0 w-[15px] border-t-2"
                   style={{ borderColor: m.color, borderTopStyle: m.dashed ? 'dashed' : 'solid' }} />
              }
            />
          )
        })}
      </div>

      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">領域</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            on={props.categories.has(c)}
            onClick={() => props.onCategory(c)}
            count={props.catCounts[c] ?? 0}
            label={CATEGORY_META[c].label}
            swatch={
              <span className="inline-block h-[9px] w-[9px] rounded-full"
                    style={{ background: CATEGORY_META[c].color, opacity: props.categories.has(c) ? 1 : 0.4 }} />
            }
          />
        ))}
      </div>

      <input
        type="search"
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value.trim())}
        placeholder="タイトル・著者・概念で検索…"
        className="w-full appearance-none rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[13.5px] text-text outline-none placeholder:text-dim"
      />
    </div>
  )
}
