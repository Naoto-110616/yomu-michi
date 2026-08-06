/**
 * Supabase クライアント。
 *
 * URL と anon キーは公開してよい値（クライアントに必ず露出する）。
 * 行の保護はすべて RLS（Row Level Security）が担う。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = 'https://nllvoohyeulirzswglsi.supabase.co'
const ANON_KEY = 'sb_publishable_wcHKxigIl4eYIUqPcduPkQ_bRl5IUam'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (URL.startsWith('__')) return null // 未設定ならオフライン動作（ゲストのみ）
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

/** 動作確認用のデモアカウント（DB 側でシード済み・公開情報） */
export const DEMO_ACCOUNTS = [
  { label: 'デモA — 93冊の本棚', email: 'demo-a@yomu-michi.dev', password: 'yomu-demo-a' },
  { label: 'デモB — まっさらな本棚', email: 'demo-b@yomu-michi.dev', password: 'yomu-demo-b' },
] as const
