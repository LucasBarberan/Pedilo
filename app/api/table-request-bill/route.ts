import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const TABLE_COOKIE = "pedilo_table_token";
const TEST_COOKIE = "pedilo_test_token";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TABLE_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Escaneá nuevamente el QR de la mesa" },
      { status: 409 }
    );
  }

  const testToken = cookieStore.get(TEST_COOKIE)?.value;
  const headers: HeadersInit = {};
  if (testToken) headers.authorization = `Bearer ${testToken}`;

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/tables/public/${encodeURIComponent(token)}/request-bill`,
      { method: "POST", headers, cache: "no-store" }
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "No se pudo pedir la cuenta. Revisá la conexión e intentá nuevamente" },
      { status: 502 }
    );
  }
}
