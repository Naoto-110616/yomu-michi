import type { Metadata, Viewport } from 'next'
import './globals.css'

const title = '読む道 — 本と本のあいだの地図'
const description =
  '1002冊を「前提・発展・別視点・反論」の4種類の関係でつないだ地図。この本を読む前に何を読めばいいか、が線で見える。'

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
