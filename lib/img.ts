// lib/img.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const API = new URL(API_URL);
const API_ORIGIN = `${API.protocol}//${API.hostname}${API.port ? `:${API.port}` : ""}`;

export function fixImageUrl(input?: string) {
  if (!input) return "";

  // Siempre resolvemos contra la base (sirve si viene relativa)
  const u = new URL(input, API_ORIGIN);

  // Si vino con localhost/127.*, pasamos al host/puerto reales de la API
  if (u.hostname === "localhost" || u.hostname.startsWith("127.")) {
    u.protocol = API.protocol;
    u.hostname = API.hostname;
    u.port = API.port;
  }

  // Tu backend sirve bajo /static/productos/... → asegura el prefijo
  if (u.pathname.startsWith("/productos/")) {
    u.pathname = `/static${u.pathname}`;
  }

  return u.toString();
}

// alias por si en otro lado lo importaste con otro nombre
export const normalizeImageUrl = fixImageUrl;
