import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const TABLE_COOKIE = "pedilo_table_token";
const TEST_COOKIE = "pedilo_test_token";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TABLE_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: "No hay una mesa seleccionada" }, { status: 404 });
  }

  const testToken = cookieStore.get(TEST_COOKIE)?.value;
  const headers: HeadersInit = {};
  if (testToken) headers.authorization = `Bearer ${testToken}`;

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/tables/public/${encodeURIComponent(token)}/context`,
      { headers, cache: "no-store" }
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "No se pudo conectar con el sistema de mesas" },
      { status: 502 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(TABLE_COOKIE);
  return response;
}
