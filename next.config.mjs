/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // permití acceder al dev server desde tu IP de LAN
  allowedDevOrigins: ['192.168.0.168'],
}

export default nextConfig
