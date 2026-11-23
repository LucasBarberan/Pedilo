import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBase } from "@/lib/apiBase";

const COOKIE_NAME = "pedilo_test_token";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const testToken = cookieStore.get(COOKIE_NAME)?.value;

  const body = await req.text();

  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (testToken) headers["authorization"] = `Bearer ${testToken}`;

  // demo-mode Fase 5 (tasks.md 5.8, gap detectado): sin esto, un pedido hecho desde una demo
  // se creaba en `public` en vez de `demo_N` — Route Handler server-side, `apiBase()` (server,
  // next/headers) es seguro acá, a diferencia de los fetchers client-side de lib/api/*.
  const base = await apiBase();

  const r = await fetch(`${base}/orders`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json" },
  });
}
