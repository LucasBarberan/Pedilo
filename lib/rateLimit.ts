// Hallazgo 6.8 (medio): las rutas con token en la URL (mesa/[token], demo/[token]) no tenían ningún
// límite de intentos propio — toda la validación quedaba delegada al Backend. Límite simple en memoria
// por IP, suficiente para frenar un barrido automatizado de tokens sin agregar una dependencia nueva
// (no hay Redis compartido en Pedilo). Vive por proceso: alcanza porque el deploy estándar es un solo
// contenedor de Next standalone por cliente.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function isRateLimited(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

/**
 * IP real del visitante detrás del proxy de confianza (Caddy): el ÚLTIMO valor de la cadena
 * `X-Forwarded-For` (el que agrega el proxy más cercano a este servidor), mismo criterio que
 * `requestHost()` en `runtimeConfig.ts` — el primer valor lo controla el propio visitante.
 */
export function clientIp(request: Request): string {
  const chain = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const last = chain.length ? chain[chain.length - 1]?.trim() : undefined;
  return last || "desconocido";
}
