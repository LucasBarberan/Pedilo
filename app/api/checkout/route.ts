import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "pedilo_test_token";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const testToken = cookieStore.get(COOKIE_NAME)?.value;

  const body = await req.text();

  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (testToken) headers["authorization"] = `Bearer ${testToken}`;

  const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders`, {
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
