import { cookies } from "next/headers";
import { getRuntimeConfig } from "@/lib/runtimeConfig";

// lib/apiBase.ts
//
// demo-mode Fase 5 (openspec/changes/demo-mode/tasks.md, tarea 5.4; design.md D5). Helper
// central: con la cookie `pedilo_demo_token` (seteada por app/demo/[token]/route.ts) devuelve
// `${NEXT_PUBLIC_API_URL}/demo/<token>`; sin ella devuelve `NEXT_PUBLIC_API_URL` SIN CAMBIOS —
// comportamiento idéntico al actual (regresión explícita, "Pedilo sin token, comportamiento
// actual" de schema-routing/spec.md). Server-only (usa `cookies()` de `next/headers`): se llama
// UNA VEZ por página en los Server Components (app/page.tsx y afines) y el resultado baja como
// prop — los componentes cliente NUNCA llaman esto directo, reciben `apiBase` ya resuelto.
export const DEMO_TOKEN_COOKIE = "pedilo_demo_token";

/**
 * Base de la API del cliente de ESTA visita, SIN el prefijo de demo (change infra-multi-tenant, tarea 4.3). single: la variable del
 * build; multi: la que devuelve el Backend por Host. Para los route handlers, que nunca pasan por el modo demo.
 */
export async function rawApiBase(): Promise<string | null> {
  return (await getRuntimeConfig()).apiBase;
}

/** Como `rawApiBase()` pero falla con un mensaje claro si no hay base (en vez de armar una URL "null/..."). */
export async function requireApiBase(): Promise<string> {
  const base = await rawApiBase();
  if (!base) throw new Error("No se pudo determinar la dirección de la API de este cliente.");
  return base;
}

export async function apiBase(): Promise<string | null> {
  const base = await rawApiBase();
  if (!base) return null;

  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_TOKEN_COOKIE)?.value;
  if (!demoToken) return base;

  return `${base}/demo/${encodeURIComponent(demoToken)}`;
}
