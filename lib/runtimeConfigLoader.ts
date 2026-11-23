// lib/runtimeConfigLoader.ts
//
// change `infra-multi-tenant`, Fase 4 (tareas 4.1 y 4.6). Lógica PURA (sin Next ni `window`) del cargador de configuración por
// cliente: la consulta al Backend, la caché por Host y la degradación segura. `lib/runtimeConfig.ts` la ata a `headers()` de Next.
//
// Reglas (design D15):
//   - La caché es PROPIA y va por Host: no se confía en la caché de `fetch` de Next (su clave puede no incluir cabeceras) ni se
//     comparte una entrada entre dominios. Vigencia blanda de 60 s; una consulta vencida que falla sirve el ÚLTIMO valor bueno.
//   - Sin valor bueno (Backend caído desde el arranque o dominio desconocido) se entrega la config NEUTRA: nunca la marca de otro
//     cliente.
//   - El Host llega de un encabezado que controla quien visita: la caché tiene tope (desaloja la menos usada) y recuerda por poco
//     tiempo los dominios que el Backend rechazó, para que un barrido de Hosts inventados no se traduzca en un barrido de consultas.

export type StoreMode = "default" | "wholesale";
export type TableReservationsMode = "off" | "on" | "coming_soon";

/** Configuración pública de un cliente (misma forma que `GET /api/public/tenant-config` del Backend). Nunca contiene secretos. */
export type RuntimeConfig = {
  name: string;
  description: string | null;
  brandColor: string;
  logoUrl: string | null;
  /** Logo apaisado (con letras) de la cabecera. El Backend no lo entrega: solo lo define `single` (archivo local del despliegue). */
  wordmarkUrl: string | null;
  faviconUrl: string | null;
  storeMode: StoreMode;
  tableReservations: TableReservationsMode;
  currency: string;
  currencySymbol: string;
  /** Base de la API con `/api` (como `NEXT_PUBLIC_API_URL`). `null` = sin dato: el llamador decide cómo degradar. */
  apiBase: string | null;
  socketUrl: string | null;
  appUrl: string;
  vapidPublicKey: string | null;
  mapsPublicKey: string | null;
};

/** Color neutro del producto: el mismo que usa el Backend. Nunca el de un cliente. */
export const NEUTRAL_BRAND_COLOR = "#0077CC";

/** Config NEUTRA: lo que se muestra cuando no hay ningún valor bueno del cliente. */
export const NEUTRAL_RUNTIME_CONFIG: RuntimeConfig = Object.freeze({
  name: "Pedidos online",
  description: null,
  brandColor: NEUTRAL_BRAND_COLOR,
  logoUrl: null,
  wordmarkUrl: null,
  faviconUrl: null,
  storeMode: "default",
  tableReservations: "off",
  currency: "ARS",
  currencySymbol: "$",
  apiBase: null,
  socketUrl: null,
  appUrl: "",
  vapidPublicKey: null,
  mapsPublicKey: null,
}) as RuntimeConfig;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Valida y normaliza lo que respondió el Backend. Defensivo: un campo con forma inesperada cae a su valor neutro en vez de
 * propagar basura al HTML (el color se inyecta en un atributo `style` y en una etiqueta `<meta>`).
 */
export function parseRuntimeConfig(raw: unknown): RuntimeConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const name = str(r.name);
  if (!name) return null; // sin nombre no es una config válida

  const storeMode: StoreMode = r.storeMode === "wholesale" ? "wholesale" : "default";
  const tr = r.tableReservations;
  const tableReservations: TableReservationsMode = tr === "on" || tr === "coming_soon" ? tr : "off";
  return {
    name,
    description: str(r.description),
    brandColor: typeof r.brandColor === "string" && HEX.test(r.brandColor) ? r.brandColor.toUpperCase() : NEUTRAL_BRAND_COLOR,
    logoUrl: str(r.logoUrl),
    wordmarkUrl: null,
    faviconUrl: str(r.faviconUrl),
    storeMode,
    tableReservations,
    currency: str(r.currency) ?? NEUTRAL_RUNTIME_CONFIG.currency,
    currencySymbol: str(r.currencySymbol) ?? NEUTRAL_RUNTIME_CONFIG.currencySymbol,
    apiBase: str(r.apiBase)?.replace(/\/+$/, "") ?? null,
    socketUrl: str(r.socketUrl)?.replace(/\/+$/, "") ?? null,
    appUrl: str(r.appUrl)?.replace(/\/+$/, "") ?? "",
    vapidPublicKey: str(r.vapidPublicKey),
    mapsPublicKey: str(r.mapsPublicKey),
  };
}

export type LoaderOptions = {
  /** Base interna del Backend, con `/api` (p. ej. `http://backend:5000/api`). */
  backendUrl: string;
  /** Clave que habilita `X-Keltron-Host` en el Backend. */
  internalKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Vigencia blanda de una entrada buena (ms). Por defecto 60 s. */
  ttlMs?: number;
  /** Cuánto se recuerda un dominio que el Backend rechazó (ms). Por defecto 30 s. */
  negativeTtlMs?: number;
  /** Espera máxima de la consulta (ms). Por defecto 3 s: el primer HTML no puede colgarse por un Backend lento. */
  timeoutMs?: number;
  /** Tope de dominios recordados. Por defecto 200. */
  maxEntries?: number;
  /** Aviso de una falla (el llamador decide cómo registrarla). */
  onError?: (host: string, error: unknown) => void;
};

type Entry = { value: RuntimeConfig | null; fetchedAt: number; negativeUntil?: number };

export type RuntimeConfigLoader = {
  /** Config del cliente de ese Host: la de la caché vigente, la recién consultada, la última buena o la neutra. */
  load(host: string): Promise<RuntimeConfig>;
  /** Cuántos dominios hay recordados (para pruebas). */
  size(): number;
};

export function createRuntimeConfigLoader(opts: LoaderOptions): RuntimeConfigLoader {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 60_000;
  const negativeTtlMs = opts.negativeTtlMs ?? 30_000;
  const timeoutMs = opts.timeoutMs ?? 3_000;
  const maxEntries = opts.maxEntries ?? 200;
  const base = opts.backendUrl.replace(/\/+$/, "");

  const cache = new Map<string, Entry>(); // el orden de inserción hace de LRU: se reinserta al usar
  const inflight = new Map<string, Promise<RuntimeConfig>>();

  const touch = (host: string, entry: Entry) => {
    cache.delete(host);
    cache.set(host, entry);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  async function fetchFresh(host: string): Promise<RuntimeConfig> {
    const previous = cache.get(host);
    try {
      const res = await fetchImpl(`${base}/public/tenant-config`, {
        headers: { "X-Keltron-Host": host, "X-Internal-Key": opts.internalKey, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404 || res.status === 403 || res.status === 401) {
        // El Backend no reconoce el dominio (o está suspendido): se recuerda un rato y se muestra lo neutro. NO se conserva una
        // marca vieja de un dominio que dejó de existir.
        touch(host, { value: null, fetchedAt: now(), negativeUntil: now() + negativeTtlMs });
        return NEUTRAL_RUNTIME_CONFIG;
      }
      if (!res.ok) throw new Error(`El Backend respondió ${res.status}`);
      const parsed = parseRuntimeConfig(await res.json());
      if (!parsed) throw new Error("La respuesta del Backend no es una configuración válida");
      touch(host, { value: parsed, fetchedAt: now() });
      return parsed;
    } catch (error) {
      opts.onError?.(host, error);
      // Falla transitoria: el ÚLTIMO valor bueno de ESTE dominio; sin él, neutro. Se reintenta recién tras un TTL corto para no
      // martillar a un Backend caído con una consulta por visita.
      const last = previous?.value ?? null;
      touch(host, { value: last, fetchedAt: now() - ttlMs + negativeTtlMs });
      return last ?? NEUTRAL_RUNTIME_CONFIG;
    }
  }

  return {
    size: () => cache.size,
    async load(rawHost: string): Promise<RuntimeConfig> {
      const host = rawHost.trim().toLowerCase();
      if (!host) return NEUTRAL_RUNTIME_CONFIG;

      const entry = cache.get(host);
      if (entry) {
        if (entry.negativeUntil !== undefined && now() < entry.negativeUntil) return NEUTRAL_RUNTIME_CONFIG;
        if (entry.negativeUntil === undefined && now() - entry.fetchedAt < ttlMs) {
          touch(host, entry);
          return entry.value ?? NEUTRAL_RUNTIME_CONFIG;
        }
      }

      // Una sola consulta en vuelo por dominio: mil visitas simultáneas no son mil pedidos al Backend.
      let pending = inflight.get(host);
      if (!pending) {
        pending = fetchFresh(host).finally(() => inflight.delete(host));
        inflight.set(host, pending);
      }
      return pending;
    },
  };
}

/** Sube a JSON seguro para incrustar en un `<script>`: escapa `<` (cierre de etiqueta) y los separadores de línea de JS. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}
