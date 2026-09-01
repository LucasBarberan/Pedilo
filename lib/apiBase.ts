import { cookies } from "next/headers";

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

export async function apiBase(): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? null;
  if (!base) return null;

  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_TOKEN_COOKIE)?.value;
  if (!demoToken) return base;

  return `${base}/demo/${encodeURIComponent(demoToken)}`;
}
