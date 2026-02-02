/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "5000", pathname: "/**" },
      { protocol: "https", hostname: "api.demo.keltron.app", pathname: "/**" },
    ],
    // o, temporalmente en LAN: unoptimized: true
  },
  // permití acceder al dev server desde tu IP de LAN
  allowedDevOrigins: ['api.demo.keltron.app'],
  output: 'standalone',
}

export default nextConfig
