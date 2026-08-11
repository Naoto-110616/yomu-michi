'use client'

/**
 * ログイン / 新規登録 の共通パネル。
 * ヘッダーのアカウントメニューと LP の両方から使う（幅は親が決める）。
 *
 * - ログイン: Google / GitHub / マジックリンク / パスワード
 * - 新規登録: 同じソーシャル（初回ログイン = 登録）+ メール&パスワード
 * - デモ: 1タップで「中身のあるアカウント」に入る最短動線
 */
import { useState } from 'react'
import { DEMO_ACCOUNTS, getSupabase } from '@/lib/supabase'

export default function AuthPanel({ initialMode = 'login', onDone }: {
  initialMode?: 'login' | 'signup'
  onDone?: () => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const sb = getSupabase()
  if (!sb) return null

  const reset = () => { setError(''); setNotice('') }

  const signInOAuth = async (provider: 'google' | 'github') => {
    setBusy(true)
    reset()
    const { error: err } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    setBusy(false)
    if (err) {
      setError(/not enabled|disabled/i.test(err.message)
        ? `${provider === 'google' ? 'Google' : 'GitHub'} ログインは準備中です（プロバイダ未設定）`
        : `ログインできません: ${err.message}`)
    }
  }

  const magicLink = async () => {
    setBusy(true)
    reset()
    const { error: err } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (err) setError(`送信できません: ${err.message}`)
    else setNotice('ログインリンクを送りました。メールを開いてください。')
  }

  const signInPw = async (em: string, pw: string) => {
    setBusy(true)
    reset()
    const { error: err } = await sb.auth.signInWithPassword({ email: em, password: pw })
    setBusy(false)
    if (err) setError(`ログインできません: ${err.message}`)
    else onDone?.()
  }

  const signUp = async () => {
    setBusy(true)
    reset()
    const { data, error: err } = await sb.auth.signUp({ email, password })
    setBusy(false)
    if (err) setError(`登録できません: ${err.message}`)
    else if (!data.session) setNotice('確認メールを送りました。メール内のリンクを開くと登録が完了します。')
    else onDone?.()
  }

  const tab = (m: 'login' | 'signup', label: string) => (
    <button
      onClick={() => { setMode(m); reset() }}
      className={`flex-1 rounded-lg border py-2 text-[12px] transition-colors ${
        mode === m
          ? 'border-[#2f4a58] bg-acc/10 font-bold text-acc'
          : 'border-line bg-panel2 text-muted'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      {/* ログイン / 新規登録 の切り替え */}
      <div className="mb-2.5 flex gap-1.5">
        {tab('login', 'ログイン')}
        {tab('signup', '新規登録')}
      </div>

      {/* ソーシャル（初回ログイン = そのまま登録になる） */}
      <button
        disabled={busy}
        onClick={() => signInOAuth('google')}
        className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-[#fff] py-2 text-[12px] font-bold text-[#1f2937] active:opacity-80 disabled:opacity-50"
      >
        <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.5 2.2-6.3 0-11.7-3.9-13.6-9.5l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Google で続ける
      </button>
      <button
        disabled={busy}
        onClick={() => signInOAuth('github')}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-[#171b21] py-2 text-[12px] font-bold text-[#e6edf3] active:opacity-80 disabled:opacity-50"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
        GitHub で続ける
      </button>

      <div className="my-2 border-t border-line" />

      <input
        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="メールアドレス"
        autoComplete="email"
        className="mb-1.5 w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 text-[12.5px] text-text outline-none placeholder:text-dim"
      />

      {mode === 'login' ? (
        <>
          <button
            disabled={busy || !email}
            onClick={magicLink}
            className="mb-2 w-full rounded-lg border border-[#2f4a58] bg-acc/10 py-2 text-[12px] font-bold text-acc active:bg-acc/25 disabled:opacity-40"
          >
            メールのリンクでログイン（パスワード不要）
          </button>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            autoComplete="current-password"
            className="mb-2 w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 text-[12.5px] text-text outline-none placeholder:text-dim"
          />
          <button
            disabled={busy || !email || !password}
            onClick={() => signInPw(email, password)}
            className="w-full rounded-lg bg-acc py-2 text-[12px] font-bold text-[#08131a] disabled:opacity-40"
          >
            パスワードでログイン
          </button>
        </>
      ) : (
        <>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード（8文字以上）"
            autoComplete="new-password"
            className="mb-2 w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 text-[12.5px] text-text outline-none placeholder:text-dim"
          />
          <button
            disabled={busy || !email || password.length < 8}
            onClick={signUp}
            className="mb-1.5 w-full rounded-lg bg-acc py-2 text-[12px] font-bold text-[#08131a] disabled:opacity-40"
          >
            メールで新規登録
          </button>
          <p className="m-0 text-[10.5px] leading-[1.7] text-dim">
            本棚・紐づけ・判定がこのアカウントに保存されます。上のソーシャルボタンでも、初回ログインでそのまま登録されます。
          </p>
        </>
      )}

      {/* デモ: 何も入力せずに「育った地図」を見る最短動線 */}
      <div className="my-2.5 border-t border-line" />
      <p className="m-0 mb-1 text-[10px] tracking-[0.08em] text-dim">デモアカウント — 1タップで中身を見る</p>
      {DEMO_ACCOUNTS.map((d) => (
        <button
          key={d.email}
          disabled={busy}
          onClick={() => signInPw(d.email, d.password)}
          className="mb-1.5 w-full rounded-lg border border-[#3b3357] bg-[#a78bfa]/10 py-2 text-[12px] text-[#c4b5fd] active:bg-[#a78bfa]/20 disabled:opacity-50"
        >
          {d.label}
        </button>
      ))}

      {error && <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-[#fca5a5]">{error}</p>}
      {notice && <p className="m-0 mt-1.5 text-[11px] leading-relaxed text-[#86efac]">{notice}</p>}
    </div>
  )
}
