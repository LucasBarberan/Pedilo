/** @type {import('next').NextConfig} */

// Extraer hostname/port del backend configurado en el entorno
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const apiParsed = new URL(apiUrl);
const apiProtocol = apiParsed.protocol.replace(":", ""); // "http" o "https"
const apiHostname = apiParsed.hostname;
const apiPort = apiParsed.port ?? "";
const apiOrigin = apiPort ? `${apiHostname}:${apiPort}` : apiHostname;

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
  // permití acceder al dev server desde el backend configurado en NEXT_PUBLIC_API_URL
  allowedDevOrigins: [apiOrigin],
  output: 'standalone',
  // Carpeta de build configurable: la suite E2E de pricing (TestSuite) usa NEXT_DIST_DIR=.next-pricing-test para no
  // compartir caché con el `npm run dev` de desarrollo. Sin la variable, el comportamiento no cambia (.next).
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
