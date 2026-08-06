'use client'

/**
 * AI推論ループの検証UI。
 *
 * DESIGN.md の中心的な体験:「AIが仮に張った線 — 合っていますか？」を
 * 1件ずつ出し、1タップ（合ってる / 違う / どちらとも）で判定する。
 * ユーザーの仕事は投稿ではなく却下。だからこのカードは常に1タップで終わる。
 *
 * 却下率をフッターに常時表示する。AI中心のプロダクトが信頼を失うのは
 * 精度が低いときではなく、精度の低さを隠したとき。
 */
import { useMemo, useState } from 'react'
import { RELATION_META } from '@/lib/graph'
import { rejectRate, type Proposal } from '@/lib/overlay'

const KIND_LABEL: Record<Proposal['kind'], string> = {
  pre: '前提', next: '続き・発展', alt: '似ている', counter: '反論', member: '概念に所属',
}

export default function ProposalDock({
  proposals, titleOf, canVote, selectedKey, onVote,
}: {
  proposals: Proposal[]
  /** キー → 表示名（本のタイトル / 概念ラベル） */
  titleOf: (key: string) => string
  canVote: boolean
  /** 地図で選択中のノードのキー。触っている本の提案を先に出す */
  selectedKey: string | null
  onVote: (p: Proposal, v: 'yes' | 'no' | 'unsure') => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const queue = useMemo(() => {
    const q = proposals.filter(
      (p) => (p.status === 'proposed' || p.status === 'disputed') && !p.myVote
    )
    q.sort((a, b) => {
      if (selectedKey) {
        const ta = a.from === selectedKey || a.to === selectedKey ? 1 : 0
        const tb = b.from === selectedKey || b.to === selectedKey ? 1 : 0
        if (ta !== tb) return tb - ta
      }
      return b.confidence - a.confidence
    })
    return q
  }, [proposals, selectedKey])

  if (!queue.length) return null
  const p = queue[0]
  const meta = RELATION_META[p.kind === 'member' ? 'member' : p.kind]
  const rate = rejectRate(proposals, p.kind)

  const vote = async (v: 'yes' | 'no' | 'unsure') => {
    if (!canVote || busy) return
    setBusy(true)
    try { await onVote(p, v) } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-3 left-3 z-[4] flex items-center gap-1.5 rounded-full border border-[#3b3357] bg-panel/95 px-3 py-1.5 text-[11.5px] text-[#c4b5fd] shadow-lg backdrop-blur active:bg-[#a78bfa]/15"
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#a78bfa]" />
        AIの提案 {queue.length}件
      </button>
    )
  }

  return (
    <aside className="absolute bottom-3 left-3 z-[4] w-[min(320px,calc(100vw-24px))] rounded-[13px] border border-[#3b3357] bg-panel/[0.975] p-3 shadow-xl backdrop-blur">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#a78bfa]" />
        <p className="m-0 text-[10px] tracking-[0.1em] text-[#c4b5fd]">
          AIが仮に張った線 — 合っていますか？
        </p>
        <button onClick={() => setOpen(false)} className="ml-auto px-1 text-[15px] leading-none text-muted">
          ×
        </button>
      </div>

      <p className="m-0 mb-1 text-[12.5px] leading-[1.5] text-text">
        {p.kind === 'member' ? (
          <>
            <strong>{titleOf(p.to)}</strong>
            <span className="text-dim"> は </span>
            <span style={{ color: meta.color }}>#{titleOf(p.from)}</span>
            <span className="text-dim"> に属する</span>
          </>
        ) : (
          <>
            <strong>{titleOf(p.from)}</strong>
            <em
              className="mx-1.5 inline-block whitespace-nowrap rounded-full border px-1.5 py-px align-[1px] text-[9.5px] not-italic"
              style={{ color: meta.color, borderColor: meta.color }}
            >
              {KIND_LABEL[p.kind]}→
            </em>
            <strong>{titleOf(p.to)}</strong>
          </>
        )}
      </p>
      <p className="m-0 mb-1.5 text-[11px] leading-[1.65] text-muted">{p.why}</p>
      {p.evidence && (
        <p className="m-0 mb-1.5 text-[10px] leading-[1.5] text-dim">出典: {p.evidence}</p>
      )}

      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[9.5px] text-dim">AIの自信</span>
        <span className="h-[5px] w-24 overflow-hidden rounded-full bg-[#242b36]">
          <span
            className="block h-full rounded-full bg-[#a78bfa]"
            style={{ width: `${Math.round(p.confidence * 100)}%` }}
          />
        </span>
        <span className="text-[10px] tabular-nums text-muted">{Math.round(p.confidence * 100)}%</span>
        {p.status === 'disputed' && (
          <span className="ml-auto rounded-full border border-[#7f1d1d] px-1.5 py-px text-[9.5px] text-[#fca5a5]">
            賛否が割れています
          </span>
        )}
      </div>

      {canVote ? (
        <div className="flex gap-1.5">
          <button
            onClick={() => vote('yes')}
            disabled={busy}
            className="flex-1 rounded-lg border border-[#14532d] bg-[#22c55e]/15 py-1.5 text-[12px] font-bold text-[#86efac] active:bg-[#22c55e]/30 disabled:opacity-50"
          >
            合ってる
          </button>
          <button
            onClick={() => vote('no')}
            disabled={busy}
            className="flex-1 rounded-lg border border-[#7f1d1d] bg-[#ef4444]/10 py-1.5 text-[12px] font-bold text-[#fca5a5] active:bg-[#ef4444]/25 disabled:opacity-50"
          >
            違う
          </button>
          <button
            onClick={() => vote('unsure')}
            disabled={busy}
            className="rounded-lg border border-line bg-panel2 px-2.5 py-1.5 text-[11px] text-muted active:text-text disabled:opacity-50"
          >
            保留
          </button>
        </div>
      ) : (
        <p className="m-0 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-center text-[11px] text-dim">
          ログインすると判定できます
        </p>
      )}

      <p className="m-0 mt-1.5 text-[9.5px] text-dim">
        残り {queue.length} 件
        {rate !== null && ` ・ ${KIND_LABEL[p.kind]}の却下率 ${Math.round(rate * 100)}%`}
        {rate === null && ' ・ まだ判定がありません'}
      </p>
    </aside>
  )
}
