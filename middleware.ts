import { NextRequest, NextResponse } from "next/server";
import { DEMO_TOKEN_COOKIE } from "@/lib/apiBase";

// demo-mode Fase 5 — gap real señalado por el usuario probando el flujo: el deploy DEDICADO
// de demos (design.md D5, "un único deploy compartido sirve los 10 demos") sirve TODAS las
// rutas normales de Pedilo (/, /producto/[id], etc.) sin token — cayendo al comportamiento
// "sin cookie de demo, comportamiento actual" de `apiBase()`, que en este deploy específico no
// tiene ningún "actual" sensato (no es la tienda de un cliente real). Entrar directo a la raíz
// del deploy de demos sin `/demo/<token>` mostraría lo que sea que `NEXT_PUBLIC_API_URL`
// resuelva sin prefijo — potencialmente datos ajenos, o simplemente un catálogo vacío/roto.
//
// Gateado por `NEXT_PUBLIC_DEMO_DEPLOY` — SOLO se setea en el deploy dedicado de demos, nunca
// en el Pedilo real de un cliente (ahí esta env var no existe, este middleware es no-op).
const IS_DEMO_DEPLOY = process.env.NEXT_PUBLIC_DEMO_DEPLOY === "true";

export function middleware(req: NextRequest) {
  if (!IS_DEMO_DEPLOY) return NextResponse.next();

  const hasDemoToken = Boolean(req.cookies.get(DEMO_TOKEN_COOKIE)?.value);
  if (hasDemoToken) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // Rutas que deben quedar alcanzables SIN token: la que setea el token, la de error, y todo
  // lo que Next.js sirve internamente (assets, API routes propias de Pedilo, etc.).
  const isAllowedWithoutToken =
    pathname.startsWith("/demo/") ||
    pathname === "/demo-no-disponible" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico";

  if (isAllowedWithoutToken) return NextResponse.next();

  return NextResponse.redirect(new URL("/demo-no-disponible", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
