'use client'

/**
 * 未ログインの入口（LP）。
 *
 * スクリーンショットではなく、後ろで「実物のグラフ」が動いている。
 * LPは半透明のオーバーレイで、下では Atlas がそのまま生きているため、
 * 「地図をさわってみる」を押した瞬間に説明がそのまま本物になる。
 */

const FEATURES = [
  {
    icon: '●',
    color: '#a78bfa',
    title: '概念が育つ',
    body: '読んだ本を「哲学」「叙述トリック」のような概念に紐付けるほど、その軸が大きくなる。地図の形が、そのまま自分の知識の広がりになる。',
  },
  {
    icon: '⇢',
    color: '#f59e0b',
    title: 'AIが線を張り、あなたは1タップ',
    body: '「『銃・病原菌・鉄』の前に『サピエンス全史』の前提になる」— AIが理由と自信度つきで線を提案。合ってる／違うを1タップで判定するだけで、地図が正確になっていく。',
  },
  {
    icon: '◎',
    color: '#5eead4',
    title: '他の人の地図から学ぶ',
    body: '本棚の重なりが多い人がフォロー候補に。フォローした人の地図は自分の地図の周りに「島」として現れ、知識の広げ方を見比べられる。',
  },
]

const STEPS = [
  'Google / GitHub / メールでログイン',
  'ブクログのIDを入れる（本棚がそのまま再現される）',
  '読んだ本と1,000冊の名著が、線でつながった地図になる',
]

export default function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-gradient-to-b from-[#0b0d11]/60 via-[#0b0d11]/80 to-[#0b0d11]/[0.97] backdrop-blur-[1.5px]">
      <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col px-6 py-10">
        {/* ヒーロー（後ろで実物のグラフが漂っている） */}
        <div className="mb-8 mt-[6vh]">
          <p className="m-0 mb-2 text-[11px] font-bold tracking-[0.22em] text-acc">YOMU-MICHI</p>
          <h1 className="m-0 mb-3 text-[34px] font-extrabold leading-[1.25] tracking-tight">
            読んだ本が、
            <br />
            知識の<span className="text-[#a78bfa]">地図</span>になる。
          </h1>
          <p className="m-0 mb-6 max-w-[46ch] text-[13.5px] leading-[1.9] text-muted">
            あなたの本棚と1,000冊の名著を「前提・発展・別視点・反論」の線でつなぐ、
            読書のネットワーク図。後ろで動いているのが、その実物です。
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onEnter}
              className="rounded-xl bg-acc px-5 py-3 text-[13.5px] font-bold text-[#08131a] shadow-lg shadow-acc/20 active:scale-[0.98]"
            >
              地図をさわってみる — ログイン不要
            </button>
            <span className="text-[11px] text-dim">自分の地図は右上のログインから</span>
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

        {/* 始め方 */}
        <div className="mb-8 rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur">
          <p className="m-0 mb-2 text-[10.5px] tracking-[0.12em] text-dim">はじめかた</p>
          <ol className="m-0 list-none p-0">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5 py-1.5 text-[12.5px] leading-[1.7]">
                <span className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[#a78bfa]/20 text-[10.5px] font-bold text-[#c4b5fd]">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
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
