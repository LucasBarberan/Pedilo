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
      { protocol: "http", hostname: "localhost",     port: "5000", pathname: "/**" },
      { protocol: "http", hostname: "192.168.0.168", port: "5000", pathname: "/**" }, // tu IP
    ],
    // o, temporalmente en LAN: unoptimized: true
  },
  // permití acceder al dev server desde tu IP de LAN
  allowedDevOrigins: ['192.168.0.168'],
}

export default nextConfig
