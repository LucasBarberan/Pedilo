import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const TABLE_COOKIE = "pedilo_table_token";
const TEST_COOKIE = "pedilo_test_token";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  // No usar `request.url` como base de los redirects: detrás del reverse proxy
  // (Caddy) el Host que llega al server de Next standalone puede resolver al
  // hostname interno del contenedor Docker en vez del dominio público, lo que
  // termina mandando al cliente a algo como https://<container-id>:3000/.
  // NEXT_PUBLIC_APP_URL ya viene seteado al dominio público real en cada build.
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const token = params.token?.trim();
  if (!token || token.length > 100) {
    return NextResponse.redirect(new URL("/mesa-no-disponible", origin));
  }

  const cookieStore = await cookies();
  const testToken = cookieStore.get(TEST_COOKIE)?.value;
  const headers: HeadersInit = {};
  if (testToken) headers.authorization = `Bearer ${testToken}`;

  try {
    const validation = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/tables/public/${encodeURIComponent(token)}/context`,
      { headers, cache: "no-store" }
    );
    if (!validation.ok) {
      return NextResponse.redirect(new URL("/mesa-no-disponible", origin));
    }
  } catch {
    return NextResponse.redirect(new URL("/mesa-no-disponible?conexion=1", origin));
  }

  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set(TABLE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
