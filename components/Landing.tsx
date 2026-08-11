'use client'

/**
 * 未ログインの入口（LP）。
 *
 * スクリーンショットではなく、後ろで「実物のグラフ」が動いている。
 * LPは半透明のオーバーレイで、下では Atlas がそのまま生きているため、
 * 「地図をさわってみる」を押した瞬間に説明がそのまま本物になる。
 *
 * ここで完結できる3つの動線:
 *   1. デモを見る       — 1タップでデモアカウントに入り、育った地図を見る
 *   2. はじめる         — ログイン / 新規登録（ソーシャル・メール）
 *   3. ログイン不要で触る — サンプル本棚の地図に降りる
 */
import { useRef, useState } from 'react'
import { RELATION_META } from '@/lib/graph'
import { DEMO_ACCOUNTS, getSupabase } from '@/lib/supabase'
import AuthPanel from './AuthPanel'

const FEATURES = [
  {
    icon: '●',
    color: '#a78bfa',
    title: '概念が育つ',
    body: '読んだ本を「哲学」「叙述トリック」のような概念に紐付けるほど、その軸が大きくなる。概念のサイズが、そのまま自分の知識の広がりになる。',
  },
  {
    icon: '⇢',
    color: '#f59e0b',
    title: 'AIが線を張り、あなたは1タップ',
    body: '「この本の前提はこの本」— AIが理由と自信度つきで線を提案。合ってる／違うを1タップで判定するだけで、地図が正確になっていく。却下率も隠さず表示。',
  },
  {
    icon: '◎',
    color: '#5eead4',
    title: '他の人の地図から学ぶ',
    body: '本棚の重なりが多い人がフォロー候補に。フォローした人の地図は自分の地図の周縁に「島」として現れ、同じ本からの知識の広げ方を見比べられる。',
  },
]

const STEPS = [
  {
    title: '本棚をつなぐ',
    body: 'ブクログのIDを入れるだけで読んだ本を再現。CSVの取り込みや、国会図書館の検索から1冊ずつ足すこともできる。',
  },
  {
    title: '自動でいったん整理される',
    body: '取り込んだ本は領域（哲学・SF・ミステリ…）の概念へ自動で紐づく。違うと思ったら、あとから1冊ずつ付け替え・強度変更・解除が自由。',
  },
  {
    title: 'AIの提案を1タップで判定',
    body: 'AIが「前提・発展・別視点・反論」の線を仮に張る。あなたの仕事は投稿ではなく判定 — 合ってる／違う／保留の1タップだけ。',
  },
  {
    title: '地図が育ち、次に読む本が見える',
    body: '検証された線は実線になり、概念が大きくなる。未読の前提が線の先に現れるので、「次に何を読むか」が地図から分かる。',
  },
]

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const authRef = useRef<HTMLDivElement>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoErr, setDemoErr] = useState('')

  /** 1タップデモ: 93冊の本棚が育てた地図にそのまま入る */
  const enterDemo = async () => {
    const sb = getSupabase()
    if (!sb) { onEnter(); return }
    setDemoBusy(true)
    setDemoErr('')
    const d = DEMO_ACCOUNTS[0]
    const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password })
    setDemoBusy(false)
    // 成功すればログイン状態になり、LPは自動で閉じる（Atlas側のeffect）
    if (error) setDemoErr('デモに入れませんでした。下のログイン不要の地図をお試しください。')
  }

  const scrollToAuth = () => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-gradient-to-b from-[#0b0d11]/60 via-[#0b0d11]/85 to-[#0b0d11]/[0.97] backdrop-blur-[1.5px]">
      <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col px-6 py-10">
        {/* ヒーロー（後ろで実物のグラフが漂っている） */}
        <div className="mb-9 mt-[5vh]">
          <p className="m-0 mb-2 text-[11px] font-bold tracking-[0.22em] text-acc">YOMU-MICHI</p>
          <h1 className="m-0 mb-3 text-[34px] font-extrabold leading-[1.25] tracking-tight">
            読んだ本が、
            <br />
            知識の<span className="text-[#a78bfa]">地図</span>になる。
          </h1>
          <p className="m-0 mb-6 max-w-[46ch] text-[13.5px] leading-[1.9] text-muted">
            読書リストは、読んだ端から忘れていく。読む道は、あなたの本棚を
            「前提・発展・別視点・反論」の線でつなぎ、知識がどこで厚く、
            どこで薄いかを一枚の地図にする。後ろで動いているのが、その実物です。
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <button
              onClick={scrollToAuth}
              className="rounded-xl bg-acc px-5 py-3 text-[13.5px] font-bold text-[#08131a] shadow-lg shadow-acc/20 active:scale-[0.98]"
            >
              はじめる — 無料
            </button>
            <button
              onClick={enterDemo}
              disabled={demoBusy}
              className="rounded-xl border border-[#3b3357] bg-[#a78bfa]/10 px-5 py-3 text-[13.5px] font-bold text-[#c4b5fd] active:bg-[#a78bfa]/25 disabled:opacity-50"
            >
              {demoBusy ? 'デモに入っています…' : 'デモを見る'}
            </button>
          </div>
          <button onClick={onEnter} className="bg-transparent p-0 text-[12px] text-dim underline underline-offset-4 active:text-muted">
            地図をさわってみる — ログイン不要
          </button>
          {demoErr && <p className="m-0 mt-2 text-[11px] text-[#fca5a5]">{demoErr}</p>}
        </div>

        {/* つかいかた: 4ステップのフロー */}
        <div className="mb-8 rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur">
          <p className="m-0 mb-3 text-[10.5px] tracking-[0.12em] text-dim">つかいかた — 4ステップ</p>
          <ol className="m-0 list-none p-0">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex items-start gap-3 pb-4 last:pb-0">
                {/* 番号と縦の接続線 */}
                <span className="relative flex flex-none flex-col items-center self-stretch">
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#a78bfa]/20 text-[11px] font-bold text-[#c4b5fd]">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && <span className="w-px flex-1 bg-[#3b3357]" />}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-[13px] font-bold leading-[1.5]">{s.title}</span>
                  <span className="block text-[12px] leading-[1.85] text-muted">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          {/* 線の種類のミニ凡例: この地図の言語 */}
          <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line pt-2.5">
            {(['pre', 'next', 'alt', 'counter'] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                <i className="inline-block h-0 w-[16px] border-t-2"
                   style={{ borderColor: RELATION_META[t].color, borderTopStyle: RELATION_META[t].dashed ? 'dashed' : 'solid' }} />
                {RELATION_META[t].label}
              </span>
            ))}
          </div>
        </div>

        {/* 3つの特徴 */}
        <div className="mb-8 grid gap-2.5">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur">
              <p className="m-0 mb-1 text-[13px] font-bold">
                <span className="mr-2" style={{ color: f.color }}>{f.icon}</span>
                {f.title}
              </p>
              <p className="m-0 text-[12px] leading-[1.85] text-muted">{f.body}</p>
            </div>
          ))}
        </div>

        {/* ログイン / 新規登録 */}
        <div ref={authRef} className="mb-8 scroll-mt-6 rounded-2xl border border-[#2f4a58] bg-panel/90 p-4 backdrop-blur">
          <p className="m-0 mb-1 text-[10.5px] tracking-[0.12em] text-acc">いますぐはじめる</p>
          <p className="m-0 mb-3 text-[12px] leading-[1.8] text-muted">
            アカウントを作ると、本棚・紐づけ・判定が保存され、あなただけの地図が育ちはじめます。
          </p>
          <AuthPanel />
        </div>

        <button
          onClick={onEnter}
          className="mb-6 w-full rounded-xl border border-[#2f4a58] bg-acc/10 py-3 text-[13px] font-bold text-acc active:bg-acc/25"
        >
          地図をさわってみる
        </button>

        <p className="m-0 pb-4 text-center text-[10px] leading-[1.8] text-dim">
          書影: 国立国会図書館サーチ ・ 図書館在架: カーリル ・ 本棚データ: ブクログ（公開本棚）
        </p>
      </div>
    </div>
  )
}
