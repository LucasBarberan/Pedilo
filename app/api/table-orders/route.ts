import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const TABLE_COOKIE = "pedilo_table_token";
const TEST_COOKIE = "pedilo_test_token";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(TABLE_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Escaneá nuevamente el QR de la mesa" },
      { status: 409 }
    );
  }

  const testToken = cookieStore.get(TEST_COOKIE)?.value;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (testToken) headers.authorization = `Bearer ${testToken}`;

  try {
    const body = await request.text();
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/tables/public/${encodeURIComponent(token)}/commands`,
      { method: "POST", headers, body, cache: "no-store" }
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el pedido. Revisá la conexión e intentá nuevamente" },
      { status: 502 }
    );
  }
}
