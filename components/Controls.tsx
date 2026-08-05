'use client'

import { CATEGORIES, CATEGORY_META, RELATIONS, RELATION_META, type Category, type RelationType, type ViewMode } from '@/lib/graph'

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'all',   label: '全体マップ',       hint: '1002冊すべて' },
  { id: 'shelf', label: '自分の本棚',       hint: '読了した本だけを光らせる' },
  { id: 'human', label: '人が張った線だけ', hint: '自動生成でない関係だけ' },
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
}) {
  return (
    <div
      className={`z-10 flex-none overflow-y-auto border-b border-line bg-panel transition-[max-height,padding] duration-250 ${
        props.open ? 'max-h-[min(56vh,420px)] px-3.5 pb-3.5 pt-3' : 'max-h-0 px-3.5 py-0'
      }`}
    >
      <p className="mb-1.5 text-[10px] tracking-[0.09em] text-dim">表示モード</p>
      <div className="mb-3 flex gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => props.onMode(m.id)}
            title={m.hint}
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
                <i
                  className="inline-block h-0 w-[15px] border-t-2"
                  style={{ borderColor: m.color, borderTopStyle: m.dashed ? 'dashed' : 'solid' }}
                />
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
              <span
                className="inline-block h-[9px] w-[9px] rounded-full"
                style={{ background: CATEGORY_META[c].color, opacity: props.categories.has(c) ? 1 : 0.4 }}
              />
            }
          />
        ))}
      </div>

      <input
        type="search"
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value.trim())}
        placeholder="タイトル・著者・出典で検索…"
        className="w-full appearance-none rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[13.5px] text-text outline-none placeholder:text-dim"
      />
    </div>
  )
}
