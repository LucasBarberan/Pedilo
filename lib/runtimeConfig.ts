// lib/runtimeConfig.ts  (SERVIDOR)
//
// change `infra-multi-tenant`, Fase 4 (tarea 4.1; design D15). Entrega la configuración del cliente que está visitando la tienda.
//
//   - TENANCY_MODE distinto de "multi" (por defecto): exactamente lo de siempre, desde las variables NEXT_PUBLIC_* del build.
//   - TENANCY_MODE=multi: UNA imagen para todos los clientes; la marca y las direcciones salen del Backend por Host
//     (`GET /api/public/tenant-config`), con caché propia por dominio (ver `lib/runtimeConfigLoader.ts`).
//
// Variables de despliegue (SOLO servidor, nunca `NEXT_PUBLIC_*`: se leen al ejecutar, no al construir la imagen):
//   TENANCY_MODE          single | multi
//   BACKEND_INTERNAL_URL  base interna del Backend con `/api` (p. ej. http://backend:5000/api)
//   INTERNAL_API_KEY      la misma clave que habilita `X-Keltron-Host` en el Backend
import { headers } from "next/headers";
import {
  createRuntimeConfigLoader,
  NEUTRAL_BRAND_COLOR,
  type RuntimeConfig,
  type RuntimeConfigLoader,
  type StoreMode,
  type TableReservationsMode,
} from "@/lib/runtimeConfigLoader";

export type { RuntimeConfig } from "@/lib/runtimeConfigLoader";

export const isMultiTenant = (): boolean => process.env.TENANCY_MODE === "multi";

/**
 * single: lo que siempre leyó Pedilo del entorno del build. Los valores por defecto son los de siempre (no se tocan acá: un
 * despliegue que no define una variable sigue viéndose igual). NOTA para `codigo-sin-nombres-de-clientes`: el color por defecto
 * histórico es de marca, no neutro; en multi nunca se usa (el respaldo es `NEUTRAL_RUNTIME_CONFIG`).
 */
export function envRuntimeConfig(): RuntimeConfig {
  const stripSlash = (v: string | undefined) => v?.replace(/\/+$/, "") || null;
  const storeMode: StoreMode = process.env.NEXT_PUBLIC_STORE_MODE === "wholesale" ? "wholesale" : "default";
  const tr = process.env.NEXT_PUBLIC_TABLE_RESERVATIONS;
  const tableReservations: TableReservationsMode = tr === "on" || tr === "coming_soon" ? tr : "off";
  return {
    name: process.env.NEXT_PUBLIC_STORE_NAME ?? "Keltron GO",
    description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION ?? "Pedidos online",
    brandColor: process.env.NEXT_PUBLIC_BRAND_COLOR ?? "#EA562F",
    // single: los archivos locales de siempre (`public/brand/`, por despliegue). En multi el logo sale del Backend y NO hay archivos
    // de marca en la imagen.
    logoUrl: "/brand/logo.png",
    wordmarkUrl: "/brand/logo-letras.png",
    faviconUrl: null,
    storeMode,
    tableReservations,
    currency: "ARS",
    currencySymbol: "$",
    apiBase: stripSlash(process.env.NEXT_PUBLIC_API_URL),
    socketUrl: stripSlash(process.env.NEXT_PUBLIC_SOCKET_URL),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    vapidPublicKey: null,
    mapsPublicKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_API_KEY ?? null,
  };
}

let loader: RuntimeConfigLoader | null = null;

function getLoader(): RuntimeConfigLoader {
  if (loader) return loader;
  const backendUrl = process.env.BACKEND_INTERNAL_URL?.trim();
  const internalKey = process.env.INTERNAL_API_KEY?.trim();
  // Falla VISIBLE: una imagen compartida sin estas variables no sabe a qué Backend preguntar, y mostrar "algo" sería mostrar la
  // tienda equivocada.
  if (!backendUrl || !internalKey) {
    throw new Error("TENANCY_MODE=multi requiere BACKEND_INTERNAL_URL e INTERNAL_API_KEY en el entorno del servidor de Pedilo.");
  }
  loader = createRuntimeConfigLoader({
    backendUrl,
    internalKey,
    onError: (host, error) => console.error(`[runtimeConfig] no se pudo consultar la configuración de ${host}:`, error),
  });
  return loader;
}

/** Host de la visita: el que reenvía el proxy (Caddy) o, si no hay, el propio. Sin puerto ni mayúsculas lo resuelve el Backend. */
export async function requestHost(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || h.get("host") || "").trim();
}

/** Configuración del cliente de ESTA visita. Debe llamarse dentro de un request (usa `headers()`). */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (!isMultiTenant()) return envRuntimeConfig();
  return getLoader().load(await requestHost());
}

/**
 * Subconjunto que viaja al navegador (`window.__RUNTIME__`). Solo datos PÚBLICOS: nada que no se vea ya en la página.
 */
export type PublicRuntime = Pick<
  RuntimeConfig,
  "name" | "brandColor" | "logoUrl" | "wordmarkUrl" | "storeMode" | "tableReservations" | "currency" | "currencySymbol" | "apiBase" | "socketUrl" | "appUrl" | "vapidPublicKey" | "mapsPublicKey"
>;

export function toPublicRuntime(c: RuntimeConfig): PublicRuntime {
  return {
    name: c.name,
    brandColor: c.brandColor,
    logoUrl: c.logoUrl,
    wordmarkUrl: c.wordmarkUrl,
    storeMode: c.storeMode,
    tableReservations: c.tableReservations,
    currency: c.currency,
    currencySymbol: c.currencySymbol,
    apiBase: c.apiBase,
    socketUrl: c.socketUrl,
    appUrl: c.appUrl,
    vapidPublicKey: c.vapidPublicKey,
    mapsPublicKey: c.mapsPublicKey,
  };
}

export { NEUTRAL_BRAND_COLOR };
