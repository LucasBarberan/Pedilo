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

/** Mismo shape que `apiBase()` server-side, pero síncrono — sin token, `NEXT_PUBLIC_API_URL` sin cambios. */
export function getClientApiBase(): string | null {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;
  if (!base) return null;

  const demoToken = readCookie(DEMO_TOKEN_COOKIE);
  if (!demoToken) return base;

  return `${base}/demo/${encodeURIComponent(demoToken)}`;
}
