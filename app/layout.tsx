import type { Metadata, Viewport } from 'next'
import './globals.css'

const title = '読む道 — 読んだ本が、知識の地図になる'
const description =
  'あなたの本棚を「前提・発展・別視点・反論」の線でつなぐ読書のネットワーク図。ブクログのIDひとつで本棚がそのまま地図になり、AIの提案を1タップで判定するほど正確に育つ。'

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website', locale: 'ja_JP' },
  twitter: { card: 'summary_large_image', title, description },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b0d11',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  )
}
