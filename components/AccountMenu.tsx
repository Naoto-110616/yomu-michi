'use client'

import { useState } from 'react'
import { DEMO_ACCOUNTS, getSupabase } from '@/lib/supabase'
import type { Profile } from '@/lib/overlay'

export interface SessionUser {
  id: string
  email: string
}

export default function AccountMenu({
  user, shelfCount, profiles, follows, viewingId, onToggleFollow, onView,
}: {
  user: SessionUser | null
  shelfCount: number | null
  profiles: Profile[]
  follows: Set<string>
  viewingId: string | null
  onToggleFollow: (profileId: string, on: boolean) => void
  onView: (p: Profile) => void
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const sb = getSupabase()

  const signIn = async (em: string, pw: string) => {
    if (!sb) return
    setBusy(true)
    setMsg('')
    const { error } = await sb.auth.signInWithPassword({ email: em, password: pw })
    setBusy(false)
    if (error) setMsg(`ログインできません: ${error.message}`)
    else setOpen(false)
  }

  const signUp = async () => {
    if (!sb) return
    setBusy(true)
    setMsg('')
    const { data, error } = await sb.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(`登録できません: ${error.message}`)
    else if (!data.session) setMsg('確認メールを送りました。メール内のリンクを開いてください。')
    else setOpen(false)
  }

  if (!sb) return null

  return (
    <div className="relative flex-none">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
          user
            ? 'border-[#2f4a58] bg-acc/10 text-acc'
            : 'border-line bg-panel2 text-muted active:text-text'
        }`}
      >
        {user ? user.email.split('@')[0] : 'ログイン'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[270px] rounded-xl border border-line bg-panel p-3.5 shadow-2xl">
          {user ? (
            <>
              <p className="m-0 mb-0.5 text-[12.5px] font-semibold">{user.email}</p>
              <p className="m-0 mb-3 text-[11px] text-muted">
                本棚 {shelfCount ?? '…'} 冊 — 地図はこのアカウントの本棚で描かれています
              </p>
              {profiles.filter((p) => p.id !== user.id).length > 0 && (
                <>
                  <p className="m-0 mb-1 text-[10px] tracking-[0.08em] text-dim">アカウント同士の紐付き</p>
                  <ul className="m-0 mb-2.5 max-h-[180px] list-none overflow-y-auto p-0">
                    {profiles.filter((p) => p.id !== user.id).map((p) => {
                      const following = follows.has(p.id)
                      return (
                        <li key={p.id} className="flex items-center gap-1.5 border-b border-[#20252e] py-1.5 last:border-b-0">
                          <span className="min-w-0 flex-1 truncate text-[12px]">{p.username}</span>
                          <button
                            onClick={() => onToggleFollow(p.id, !following)}
                            className={`flex-none rounded-full border px-2 py-0.5 text-[10.5px] ${
                              following
                                ? 'border-[#7c6bd6] bg-[#a78bfa]/20 text-[#e9d5ff]'
                                : 'border-line text-muted'
                            }`}
                          >
                            {following ? 'フォロー中' : 'フォロー'}
                          </button>
                          <button
                            onClick={() => { onView(p); setOpen(false) }}
                            disabled={viewingId === p.id}
                            className="flex-none rounded-full border border-[#2f4a58] bg-acc/10 px-2 py-0.5 text-[10.5px] text-acc disabled:opacity-50"
                          >
                            地図を見る
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              <button
                onClick={async () => { await sb.auth.signOut(); setOpen(false) }}
                className="w-full rounded-lg border border-line bg-panel2 py-2 text-[12px] text-muted active:text-text"
              >
                ログアウト（ゲスト表示に戻る）
              </button>
            </>
          ) : (
            <>
              <p className="m-0 mb-2 text-[11px] leading-relaxed text-muted">
                アカウントごとに本棚が分かれ、地図の「読んだ本」の層が変わります。
              </p>
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.email}
                  disabled={busy}
                  onClick={() => signIn(d.email, d.password)}
                  className="mb-1.5 w-full rounded-lg border border-[#3b3357] bg-[#a78bfa]/10 py-2 text-[12px] text-[#c4b5fd] active:bg-[#a78bfa]/20 disabled:opacity-50"
                >
                  {d.label}
                </button>
              ))}
              <div className="my-2.5 border-t border-line" />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="メールアドレス"
                className="mb-1.5 w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 text-[12.5px] text-text outline-none placeholder:text-dim"
              />
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード（8文字以上）"
                className="mb-2 w-full rounded-lg border border-line bg-panel2 px-2.5 py-2 text-[12.5px] text-text outline-none placeholder:text-dim"
              />
              <div className="flex gap-1.5">
                <button
                  disabled={busy || !email || !password}
                  onClick={() => signIn(email, password)}
                  className="flex-1 rounded-lg bg-acc py-2 text-[12px] font-bold text-[#08131a] disabled:opacity-40"
                >
                  ログイン
                </button>
                <button
                  disabled={busy || !email || password.length < 8}
                  onClick={signUp}
                  className="flex-1 rounded-lg border border-line bg-panel2 py-2 text-[12px] text-muted disabled:opacity-40"
                >
                  新規登録
                </button>
              </div>
            </>
          )}
          {msg && <p className="m-0 mt-2 text-[11px] leading-relaxed text-[#fca5a5]">{msg}</p>}
        </div>
      )}
    </div>
  )
}
