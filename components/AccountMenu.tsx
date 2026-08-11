'use client'

import { useEffect, useState } from 'react'
import type { UserIdentity } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import type { Profile } from '@/lib/overlay'
import AuthPanel from './AuthPanel'

export interface SessionUser {
  id: string
  email: string
}

export default function AccountMenu({
  user, shelfCount, profiles, follows, viewingId, overlaps, titleOf, booklogId,
  onToggleFollow, onView, onImportCsv, onImportBooklog,
}: {
  user: SessionUser | null
  shelfCount: number | null
  profiles: Profile[]
  follows: Set<string>
  viewingId: string | null
  /** userId → 自分の棚と重なっている本のキー（フォロー候補の並び順になる） */
  overlaps: Map<string, string[]>
  titleOf: (key: string) => string
  /** プロフィールに保存済みのブクログID（再同期に使う） */
  booklogId: string | null
  onToggleFollow: (profileId: string, on: boolean) => void
  onView: (p: Profile) => void
  onImportCsv: (file: File) => Promise<number>
  onImportBooklog: (booklogId: string) => Promise<number>
}) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  const [blogId, setBlogId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const sb = getSupabase()

  /* ── ログイン方法の連携（後からソーシャルを紐づける） ──
     1つのアカウントに Google / GitHub / メール を複数結びつけて、
     どれでログインしても同じ地図に入れるようにする。 */
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null)
  useEffect(() => {
    if (!sb || !user || !open) return
    let on = true
    sb.auth.getUserIdentities().then(({ data }) => {
      if (on) setIdentities(data?.identities ?? [])
    })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, open])

  const linkProvider = async (provider: 'google' | 'github') => {
    if (!sb) return
    setBusy(true)
    setMsg('')
    const { error } = await sb.auth.linkIdentity({
      provider,
      options: { redirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) {
      setMsg(/manual linking|not enabled|disabled/i.test(error.message)
        ? '連携には Supabase の Authentication 設定で「Manual Linking」を有効にしてください'
        : `連携できません: ${error.message}`)
    }
  }

  const unlinkProvider = async (provider: string) => {
    if (!sb || !identities) return
    const found = identities.find((i) => i.provider === provider)
    if (!found) return
    setBusy(true)
    setMsg('')
    const { error } = await sb.auth.unlinkIdentity(found)
    setBusy(false)
    if (error) setMsg(`解除できません: ${error.message}`)
    else {
      const { data } = await sb.auth.getUserIdentities()
      setIdentities(data?.identities ?? [])
    }
  }

  const doImportBooklog = async () => {
    const id = (blogId || booklogId || '').trim()
    if (!id) return
    setImporting(true)
    setMsg('')
    try {
      setImported(await onImportBooklog(id))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
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
              <p className="m-0 mb-2 text-[11px] text-muted">
                本棚 {shelfCount ?? '…'} 冊 — 地図はこのアカウントの本棚で描かれています
              </p>
              {/* ブクログID連携: IDを入れるだけで公開本棚（星1-5 = 読了）を再現 */}
              <div className="mb-2.5 rounded-lg border border-[#8a6d1f] bg-[#fbbf24]/5 p-2">
                <p className="m-0 mb-1.5 text-[10px] tracking-[0.08em] text-[#fcd34d]">
                  ブクログ連携 — IDだけで本棚を再現
                </p>
                <div className="flex gap-1.5">
                  <input
                    value={blogId}
                    onChange={(e) => setBlogId(e.target.value)}
                    placeholder={booklogId ? `@${booklogId}（保存済み）` : 'ブクログのID（例: busainu）'}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-[12px] text-text outline-none placeholder:text-dim"
                  />
                  <button
                    disabled={importing || (!blogId.trim() && !booklogId)}
                    onClick={doImportBooklog}
                    className="flex-none rounded-lg border border-[#8a6d1f] bg-[#fbbf24]/10 px-2.5 py-1.5 text-[11.5px] text-[#fcd34d] active:bg-[#fbbf24]/20 disabled:opacity-40"
                  >
                    {importing ? '取込中…' : booklogId && !blogId.trim() ? '再同期' : '取り込む'}
                  </button>
                </div>
                {imported !== null && (
                  <p className="m-0 mt-1 text-[10.5px] text-[#fcd34d]">{imported}冊を取り込みました</p>
                )}
              </div>
              <label className="mb-2.5 block w-full cursor-pointer rounded-lg border border-line bg-panel2 py-2 text-center text-[12px] text-muted active:text-text">
                ブクログCSVを取り込む（エクスポートしたファイル）
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setImporting(true)
                    setImported(await onImportCsv(file))
                    setImporting(false)
                    e.target.value = ''
                  }}
                />
              </label>
              {profiles.filter((p) => p.id !== user.id).length > 0 && (
                <>
                  <p className="m-0 mb-1 text-[10px] tracking-[0.08em] text-dim">
                    フォロー候補 — 本棚の重なりが多い順
                  </p>
                  <ul className="m-0 mb-2.5 max-h-[220px] list-none overflow-y-auto p-0">
                    {profiles
                      .filter((p) => p.id !== user.id)
                      .map((p) => ({ p, over: overlaps.get(p.id) ?? [] }))
                      // 未フォローの重なりが多い人が先頭 = 「次に繋がるべき人」
                      .sort((a, b) => {
                        const fa = follows.has(a.p.id) ? 1 : 0
                        const fb = follows.has(b.p.id) ? 1 : 0
                        if (fa !== fb) return fa - fb
                        return b.over.length - a.over.length
                      })
                      .map(({ p, over }) => {
                      const following = follows.has(p.id)
                      const sample = over.slice(0, 2).map((k) => {
                        const t = titleOf(k)
                        return t.length > 9 ? t.slice(0, 8) + '…' : t
                      })
                      return (
                        <li key={p.id} className="border-b border-[#20252e] py-1.5 last:border-b-0">
                          <div className="flex items-center gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[12px]">
                              {p.username}
                              {over.length > 0 && (
                                <span className={`ml-1.5 text-[10px] tabular-nums ${following ? 'text-dim' : 'text-[#5eead4]'}`}>
                                  {over.length}冊重なり
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => onToggleFollow(p.id, !following)}
                              className={`flex-none rounded-full border px-2 py-0.5 text-[10.5px] ${
                                following
                                  ? 'border-[#7c6bd6] bg-[#a78bfa]/20 text-[#e9d5ff]'
                                  : over.length > 0
                                    ? 'border-[#0d5c53] bg-[#5eead4]/10 text-[#5eead4]'
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
                          </div>
                          {over.length > 0 && !following && (
                            <p className="m-0 mt-0.5 truncate text-[10px] text-dim">
                              同じ本: {sample.join('、')}{over.length > 2 ? ` ほか${over.length - 2}冊` : ''}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              {/* ログイン方法の連携 */}
              <p className="m-0 mb-1 text-[10px] tracking-[0.08em] text-dim">ログイン方法の連携</p>
              <ul className="m-0 mb-2.5 list-none p-0">
                {([['google', 'Google'], ['github', 'GitHub']] as const).map(([prov, label]) => {
                  const linked = identities?.some((i) => i.provider === prov) ?? false
                  const canUnlink = (identities?.length ?? 0) >= 2
                  return (
                    <li key={prov} className="flex items-center gap-1.5 border-b border-[#20252e] py-1.5 last:border-b-0">
                      <span className="min-w-0 flex-1 text-[12px]">
                        {label}
                        {linked && <span className="ml-1.5 text-[10px] text-[#86efac]">連携済み</span>}
                      </span>
                      {linked ? (
                        <button
                          disabled={busy || !canUnlink}
                          onClick={() => unlinkProvider(prov)}
                          title={canUnlink ? '' : '最後のログイン方法は解除できません'}
                          className="flex-none rounded-full border border-line px-2 py-0.5 text-[10.5px] text-muted disabled:opacity-40"
                        >
                          解除
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => linkProvider(prov)}
                          className="flex-none rounded-full border border-[#2f4a58] bg-acc/10 px-2 py-0.5 text-[10.5px] text-acc disabled:opacity-50"
                        >
                          連携する
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
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
                ログイン後、ブクログIDを入れるだけで本棚を再現できます。
              </p>
              <AuthPanel onDone={() => setOpen(false)} />
            </>
          )}
          {msg && <p className="m-0 mt-2 text-[11px] leading-relaxed text-[#fca5a5]">{msg}</p>}
        </div>
      )}
    </div>
  )
}
