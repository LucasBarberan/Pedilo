import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// demo-mode Fase 5 (openspec/changes/demo-mode/tasks.md, tarea 5.3; design.md D5). Calco de
// app/mesa/[token]/route.ts: token del path → valida contra el backend → cookie httpOnly →
// redirect "/". El `publicToken` NUNCA se expone al cliente vía JS — solo vive en esta cookie
// httpOnly, leída server-side por `lib/apiBase.ts` (tarea 5.4).
const DEMO_COOKIE = "pedilo_demo_token";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  // Mismo motivo que mesa/[token]/route.ts: no usar request.url como base de los redirects
  // detrás del reverse proxy.
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const token = params.token?.trim();
  if (!token || token.length > 100) {
    return NextResponse.redirect(new URL("/demo-no-disponible", origin));
  }

  try {
    // Endpoint público liviano (business/status), ya remontado bajo el prefijo demo en
    // Backend/src/server.ts (tarea 5.2) — 404 si el token no resuelve a un slot ASSIGNED.
    const validation = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/demo/${encodeURIComponent(token)}/business/status`,
      { cache: "no-store" }
    );
    if (!validation.ok) {
      return NextResponse.redirect(new URL("/demo-no-disponible", origin));
    }
  } catch {
    return NextResponse.redirect(new URL("/demo-no-disponible?conexion=1", origin));
  }

  const response = NextResponse.redirect(new URL("/", origin));
  // httpOnly: false A PROPÓSITO — a diferencia de pedilo_table_token/pedilo_test_token
  // (credenciales de sesión reales), `publicToken` NO es secreto: ya viaja expuesto en la URL
  // que se comparte con el prospecto. La mayoría de los fetchers de Pedilo corren client-side
  // (`"use client"` — ver lib/api/*.ts, lib/hooks/use*), así que necesitan leer este valor
  // desde `document.cookie` vía `lib/apiBase.client.ts`; un httpOnly acá los dejaría sin forma
  // de resolver el prefijo demo sin duplicar todo el árbol de fetchers a Server Components.
  response.cookies.set(DEMO_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    // TTL corto a propósito (a diferencia de la mesa, 12h): un link de demo se comparte una
    // vez y se espera que se use en la misma sesión de navegación del prospecto.
    maxAge: 60 * 60 * 4,
  });
  return response;
}
