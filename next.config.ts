import type { NextConfig } from 'next'

// GitHub Pages はサブパス配信なので basePath が要る。
// Vercel など独自ドメインに移す時は BASE_PATH を空にするだけでよい。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
