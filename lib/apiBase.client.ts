// lib/apiBase.client.ts
//
// demo-mode Fase 5 — contraparte CLIENT-SIDE de `lib/apiBase.ts`. La mayoría de los fetchers de
// Pedilo (`lib/api/business.ts`, `delivery.ts`, `loyalty.ts`, `onlineConfig.ts`,
// `paymentMethods.ts`, y el componente entero `app/producto/[id]/page.tsx`) corren en el
// browser (`"use client"`), donde `next/headers` no existe — no pueden usar `apiBase()`
// (server-only). Lee la MISMA cookie (`pedilo_demo_token`, ver `lib/apiBase.ts` y
// `app/demo/[token]/route.ts`) vía `document.cookie` — por eso esa cookie es
// deliberadamente NO httpOnly (el token no es secreto, ya viaja expuesto en la URL
// compartida).
//
// No cachea el resultado a propósito: `document.cookie` es barato de leer y el token puede
// cambiar entre navegaciones client-side.
export const DEMO_TOKEN_COOKIE = "pedilo_demo_token";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let warnedServerWithoutBase = false;

/**
 * ÚNICO lugar fuera de `lib/runtimeConfig.ts` que lee `NEXT_PUBLIC_API_URL` (change infra-multi-tenant, tarea 4.3; lo exige una regla de
 * ESLint). Base de la API de ESTE cliente, sin barra final:
 *   - navegador: `window.__RUNTIME__.apiBase` (lo inyecta `app/layout.tsx` por Host); si no está, la variable del build (single);
 *   - servidor en single: la variable del build;
 *   - servidor en multi: NO hay base global (depende del Host y `headers()` es asíncrono) → devuelve `null` y avisa UNA vez: el
 *     llamador de servidor tiene que pasar `baseUrl` (`await apiBase()`). Es mejor un aviso en el log que una tienda vacía callada.
 */
export function runtimeApiBase(): string | null {
  if (typeof window !== "undefined") {
    const fromRuntime = (window as unknown as { __RUNTIME__?: { apiBase?: string | null } }).__RUNTIME__?.apiBase;
    if (fromRuntime) return fromRuntime.replace(/\/$/, "");
  } else if (process.env.TENANCY_MODE === "multi") {
    if (!warnedServerWithoutBase) {
      warnedServerWithoutBase = true;
      console.error("[apiBase] llamada de servidor sin `baseUrl` en TENANCY_MODE=multi: pasá `await apiBase()` al fetcher.");
    }
    return null;
  }
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;
}

/**
 * Dirección del Socket.IO de ESTE cliente (navegador): `window.__RUNTIME__.socketUrl` y, sin ella, la variable del build (single).
 * Solo se llama desde efectos del navegador (nunca durante el render del servidor).
 */
export function runtimeSocketUrl(): string | null {
  if (typeof window !== "undefined") {
    const fromRuntime = (window as unknown as { __RUNTIME__?: { socketUrl?: string | null } }).__RUNTIME__?.socketUrl;
    if (fromRuntime) return fromRuntime.replace(/\/$/, "");
  }
  return process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, "") ?? null;
}

/** Mismo shape que `apiBase()` server-side, pero síncrono — sin token de demo, la base del cliente sin cambios. */
export function getClientApiBase(): string | null {
  const base = runtimeApiBase();
  if (!base) return null;

  const demoToken = readCookie(DEMO_TOKEN_COOKIE);
  if (!demoToken) return base;

  return `${base}/demo/${encodeURIComponent(demoToken)}`;
}
