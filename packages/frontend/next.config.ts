import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@uiw/react-md-editor', '@uiw/react-markdown-preview'],
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { 'accounts': 'accounts' }]
    return config
  },
}

export default nextConfig
