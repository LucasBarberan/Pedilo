import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const TABLE_COOKIE = "pedilo_table_token";
const TEST_COOKIE = "pedilo_test_token";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const token = params.token?.trim();
  if (!token || token.length > 100) {
    return NextResponse.redirect(new URL("/mesa-no-disponible", request.url));
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
      return NextResponse.redirect(new URL("/mesa-no-disponible", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/mesa-no-disponible?conexion=1", request.url));
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(TABLE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
