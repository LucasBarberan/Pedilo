/** @type {import('next').NextConfig} */

// Extraer hostname/port del backend configurado en el entorno
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const apiParsed = new URL(apiUrl);
const apiProtocol = apiParsed.protocol.replace(":", ""); // "http" o "https"
const apiHostname = apiParsed.hostname;
const apiPort = apiParsed.port ?? "";

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      // Dominio fijo de producción
      { protocol: "https", hostname: apiUrl, pathname: "/**" },
      // Host dinámico tomado de NEXT_PUBLIC_API_URL (funciona en LAN, Docker, etc.)
      { protocol: apiProtocol, hostname: apiHostname, port: apiPort, pathname: "/**" },
    ],
  },
  // permití acceder al dev server desde tu IP de LAN
  allowedDevOrigins: ['api.demo.keltron.app', '192.168.18.5:5000'],
  output: 'standalone',
}

export default nextConfig
